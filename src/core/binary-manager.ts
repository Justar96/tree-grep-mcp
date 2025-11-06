import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { BinaryError, InstallationOptions } from "../types/errors.js";

const execFileAsync = promisify(execFile);

/**
 * Manages ast-grep binary discovery, installation, validation, and execution.
 */
export class AstGrepBinaryManager {
  private static readonly HARDCODED_VERSION = "0.39.5";
  private static readonly GITHUB_RELEASES_API =
    "https://api.github.com/repos/ast-grep/ast-grep/releases/latest";
  private static readonly CACHE_VALIDATION_RETRIES = 3;
  private static readonly CACHE_VALIDATION_RETRY_DELAY_MS = 1000;
  private static readonly VERSION_FETCH_TIMEOUT_MS = 5000;

  private binaryPath: string | null = null;
  private isInitialized = false;
  private options: InstallationOptions;

  /**
   * Create a manager with optional installation directives.
   */
  constructor(options: InstallationOptions = {}) {
    this.options = options;
  }

  /**
   * Get the default cache directory with proper path validation.
   * This method handles cases where os.homedir() may return unexpected values
   * due to environment variable pollution from workspace configurations.
   */
  private getDefaultCacheDir(): string {
    // On Windows, use USERPROFILE directly to avoid path resolution issues
    if (process.platform === "win32") {
      const userProfile = process.env.USERPROFILE;
      if (userProfile && path.isAbsolute(userProfile)) {
        return path.join(userProfile, ".ast-grep-mcp", "binaries");
      }
    }

    // On Unix-like systems, use HOME or fall back to os.homedir()
    const home = process.env.HOME || os.homedir();
    if (home && path.isAbsolute(home)) {
      return path.join(home, ".ast-grep-mcp", "binaries");
    }

    // Last resort: use a temp directory
    const tempDir = os.tmpdir();
    console.error(
      `Warning: Could not determine user home directory, using temp directory: ${tempDir}`
    );
    return path.join(tempDir, ".ast-grep-mcp", "binaries");
  }

  private async extractBinaryVersion(binaryPath: string): Promise<string | null> {
    try {
      const { command, commandArgs } = this.getExecutionCommand(binaryPath, ["--version"]);
      const { stdout, stderr } = await execFileAsync(command, commandArgs, { timeout: 5000 });
      const output = `${stdout ?? ""}${stderr ?? ""}`;
      const match = output.match(/\d+\.\d+\.\d+/);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  }

  private compareVersions(first: string, second: string): number {
    const parse = (value: string): number[] =>
      value
        .split(".")
        .map((segment) => Number.parseInt(segment, 10))
        .map((num) => (Number.isNaN(num) ? 0 : num));

    const firstParts = parse(first);
    const secondParts = parse(second);
    const length = Math.max(firstParts.length, secondParts.length);

    for (let index = 0; index < length; index++) {
      const a = firstParts[index] ?? 0;
      const b = secondParts[index] ?? 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }

    return 0;
  }

  private async fetchLatestGitHubVersion(): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      AstGrepBinaryManager.VERSION_FETCH_TIMEOUT_MS
    );

    try {
      const response = await fetch(AstGrepBinaryManager.GITHUB_RELEASES_API, {
        signal: controller.signal,
        headers: { Accept: "application/vnd.github+json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as { tag_name?: string };
      const tagName = typeof body?.tag_name === "string" ? body.tag_name : null;
      if (!tagName) {
        return null;
      }

      return tagName.startsWith("v") ? tagName.slice(1) : tagName;
    } catch {
      console.error(
        "Warning: Could not fetch latest version from GitHub, using hardcoded version 0.39.5"
      );
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Resolve and prepare an ast-grep binary for subsequent tool execution.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Priority order:
    // 1. Custom binary path
    if (this.options.customBinaryPath) {
      await this.useCustomBinary(this.options.customBinaryPath);
      return;
    }

    // 2. System binary (if requested)
    if (this.options.useSystem) {
      await this.useSystemBinary();
      return;
    }

    // 3. Platform-specific or auto-install
    if (this.options.autoInstall || this.options.platform) {
      await this.installPlatformBinary();
      return;
    }

    // 4. Fallback to system binary
    await this.useSystemBinary();
  }

  /**
   * Validate and register a caller supplied binary path without downloading.
   */
  private async useCustomBinary(customPath: string): Promise<void> {
    if (await this.testBinary(customPath)) {
      this.binaryPath = customPath;
      this.isInitialized = true;
      const version = await this.extractBinaryVersion(customPath);
      console.error(`Using custom binary: ${customPath} (version: ${version ?? "unknown"})`);
    } else {
      throw new BinaryError(`Custom binary path "${customPath}" is not valid`);
    }
  }

  /**
   * Locate ast-grep on PATH and ensure it can be executed.
   */
  private async useSystemBinary(): Promise<void> {
    const systemPath = await this.findBinaryInPath();
    if (systemPath && (await this.testBinary(systemPath))) {
      this.binaryPath = systemPath;
      this.isInitialized = true;
      const version = await this.extractBinaryVersion(systemPath);
      console.error(`Using system binary: ${systemPath} (version: ${version ?? "unknown"})`);
    } else {
      throw new BinaryError(
        "ast-grep not found in PATH. Install from official sources (see https://ast-grep.github.io/guide/quick-start.html) or use --auto-install."
      );
    }
  }

  /**
   * Download and cache a platform specific ast-grep binary when requested.
   */
  private async installPlatformBinary(): Promise<void> {
    const platform =
      this.options.platform === "auto"
        ? process.platform
        : this.options.platform || process.platform;
    const arch = process.arch;
    const totalStages = 4;

    // Validate platform/architecture support
    const supportedPlatforms = ["win32", "darwin", "linux"];
    const supportedArchs = ["x64", "arm64"];

    if (!supportedPlatforms.includes(platform)) {
      console.error(`Unsupported platform: ${platform}. Falling back to system binary.`);
      await this.useSystemBinary();
      return;
    }

    if (!supportedArchs.includes(arch)) {
      console.error(`Unsupported architecture: ${arch}. Falling back to system binary.`);
      await this.useSystemBinary();
      return;
    }

    const cacheDir = this.options.cacheDir || this.getDefaultCacheDir();

    const binaryName = this.getBinaryName(platform, arch);
    const binaryPath = path.join(cacheDir, binaryName);

    this.logStage(1, totalStages, `Checking cached binary at ${binaryPath}...`);

    // Check if binary exists in cache and is valid
    if (await this.fileExists(binaryPath)) {
      const expectedVersionForCache =
        (await this.fetchLatestGitHubVersion()) ?? AstGrepBinaryManager.HARDCODED_VERSION;
      let cacheValidated = false;

      for (let attempt = 1; attempt <= AstGrepBinaryManager.CACHE_VALIDATION_RETRIES; attempt++) {
        if (await this.testBinary(binaryPath, expectedVersionForCache)) {
          cacheValidated = true;
          break;
        }

        if (attempt < AstGrepBinaryManager.CACHE_VALIDATION_RETRIES) {
          const delay =
            AstGrepBinaryManager.CACHE_VALIDATION_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.error(
            `Cache validation attempt ${attempt}/${AstGrepBinaryManager.CACHE_VALIDATION_RETRIES} failed, retrying in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      if (cacheValidated) {
        const version = await this.extractBinaryVersion(binaryPath);
        console.error(`Using cached binary: ${binaryPath} (version: ${version ?? "unknown"})`);
        this.binaryPath = binaryPath;
        this.isInitialized = true;
        this.logStage(4, totalStages, "Installation complete");
        return;
      }

      console.error(
        `Cache validation failed after ${AstGrepBinaryManager.CACHE_VALIDATION_RETRIES} attempts, re-downloading binary`
      );
      try {
        await fs.unlink(binaryPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Try to download binary
    try {
      this.logStage(2, totalStages, `Downloading ast-grep binary for ${platform}-${arch}...`);
      const version = await this.downloadBinary(platform, arch, binaryPath);
      this.logStage(3, totalStages, "Validating downloaded binary version...");
      console.error(`Using downloaded binary: ${binaryPath} (version: ${version ?? "unknown"})`);
      this.binaryPath = binaryPath;
      this.isInitialized = true;
      this.logStage(4, totalStages, "Installation complete");
    } catch (error) {
      console.error(
        `Failed to download binary: ${error instanceof Error ? error.message : String(error)}`
      );
      console.error("Falling back to system binary...");

      // Fallback to system binary
      try {
        await this.useSystemBinary();
      } catch (systemError) {
        throw new BinaryError(
          "Failed to install ast-grep binary automatically.\n\n" +
            "RECOMMENDED: Install ast-grep from official sources for best compatibility:\n" +
            "  • npm: npm install -g @ast-grep/cli\n" +
            "  • cargo: cargo install ast-grep\n" +
            "  • brew: brew install ast-grep\n" +
            "  • pip: pip install ast-grep-cli\n" +
            "  • Official guide: https://ast-grep.github.io/guide/quick-start.html\n\n" +
            "ALTERNATIVE OPTIONS:\n" +
            "  • Use --use-system if ast-grep is already installed\n" +
            "  • Set AST_GREP_BINARY_PATH environment variable\n" +
            "  • Check network connectivity for automatic download\n\n" +
            `Error details:\n  Download error: ${error instanceof Error ? error.message : String(error)}\n  System binary error: ${systemError instanceof Error ? systemError.message : String(systemError)}`
        );
      }
    }
  }

  /**
   * Search the environment PATH for an ast-grep executable.
   */
  private async findBinaryInPath(): Promise<string | null> {
    const paths = process.env.PATH?.split(path.delimiter) || [];
    const binaryNames =
      process.platform === "win32"
        ? ["ast-grep.exe", "ast-grep.cmd", "ast-grep.ps1", "ast-grep"]
        : ["ast-grep"];

    for (const searchPath of paths) {
      for (const binaryName of binaryNames) {
        const fullPath = path.join(searchPath, binaryName);
        if ((await this.fileExists(fullPath)) && (await this.testBinary(fullPath))) {
          return fullPath;
        }
      }
    }

    return null;
  }

  /**
   * Run --version against the provided binary to confirm it is usable.
   */
  private async testBinary(binaryPath: string, expectedVersion?: string): Promise<boolean> {
    try {
      const { command, commandArgs } = this.getExecutionCommand(binaryPath, ["--version"]);
      await execFileAsync(command, commandArgs, { timeout: 5000 });
    } catch {
      return false;
    }

    if (!expectedVersion) {
      return true;
    }

    const actualVersion = await this.extractBinaryVersion(binaryPath);
    if (!actualVersion) {
      console.error(`Binary version mismatch: found unknown, expected ${expectedVersion}`);
      return false;
    }

    const comparison = this.compareVersions(actualVersion, expectedVersion);
    if (comparison < 0) {
      console.error(`Binary version mismatch: found ${actualVersion}, expected ${expectedVersion}`);
      return false;
    }

    return true;
  }

  /**
   * Determine whether a file exists without throwing on access errors.
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build the expected ast-grep file name for the given platform and architecture.
   */
  private getBinaryName(platform: string, arch: string): string {
    const extension = platform === "win32" ? ".exe" : "";
    return `ast-grep-${platform}-${arch}${extension}`;
  }

  /**
   * Download, extract, and validate a platform specific ast-grep binary.
   */
  private async downloadBinary(
    platform: string,
    arch: string,
    targetPath: string
  ): Promise<string> {
    const releaseVersion =
      (await this.fetchLatestGitHubVersion()) ?? AstGrepBinaryManager.HARDCODED_VERSION;
    const baseUrl = `https://github.com/ast-grep/ast-grep/releases/download/${releaseVersion}`;

    const fileMap: Record<string, string> = {
      "win32-x64": "app-x86_64-pc-windows-msvc.zip",
      "win32-arm64": "app-aarch64-pc-windows-msvc.zip",
      "darwin-x64": "app-x86_64-apple-darwin.zip",
      "darwin-arm64": "app-aarch64-apple-darwin.zip",
      "linux-x64": "app-x86_64-unknown-linux-gnu.zip",
      "linux-arm64": "app-aarch64-unknown-linux-gnu.zip",
    };

    const fileName = fileMap[`${platform}-${arch}`];
    if (!fileName) {
      throw new BinaryError(`Unsupported platform: ${platform}-${arch}`);
    }

    const downloadUrl = `${baseUrl}/${fileName}`;
    const tempZipPath = targetPath + ".zip";

    // Ensure cache directory exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    console.error(`Downloading from: ${downloadUrl}`);

    try {
      // Download with retry logic
      await this.downloadWithRetry(downloadUrl, tempZipPath, 3);

      console.error("Extracting binary from archive...");
      // Extract binary from zip
      await this.extractBinary(tempZipPath, targetPath, platform);

      console.error("Validating binary version...");
      if (!(await this.testBinary(targetPath, releaseVersion))) {
        const actualVersion = await this.extractBinaryVersion(targetPath);
        throw new BinaryError(
          `Downloaded binary version mismatch. Expected v${releaseVersion}, found ${actualVersion ?? "unknown"}. This may indicate a corrupted download.`
        );
      }

      const validatedVersion = (await this.extractBinaryVersion(targetPath)) ?? releaseVersion;
      console.error(`Binary version validated: v${validatedVersion}`);
      console.error(`Successfully installed ast-grep v${validatedVersion}`);

      // Set executable permissions on Unix systems
      if (platform !== "win32") {
        await fs.chmod(targetPath, "755");
      }

      try {
        await fs.unlink(tempZipPath);
      } catch {
        // Ignore cleanup errors
      }

      return validatedVersion;
    } catch (error) {
      // Cleanup on failure
      await this.cleanup([tempZipPath, targetPath]);

      if (error instanceof BinaryError) {
        throw error;
      }

      throw new BinaryError(
        `Failed to download ast-grep binary: ${error instanceof Error ? error.message : String(error)}\n\n` +
          "RECOMMENDED: Install ast-grep from official sources for best compatibility:\n" +
          "  • npm: npm install -g @ast-grep/cli\n" +
          "  • cargo: cargo install ast-grep\n" +
          "  • brew: brew install ast-grep\n" +
          "  • pip: pip install ast-grep-cli\n" +
          "  • Official guide: https://ast-grep.github.io/guide/quick-start.html\n\n" +
          "ALTERNATIVE OPTIONS:\n" +
          "  • Use --use-system if ast-grep is already installed\n" +
          "  • Set AST_GREP_BINARY_PATH environment variable\n" +
          "  • Check network connectivity for automatic download\n\n" +
          "Official installation methods ensure version compatibility and receive automatic updates."
      );
    }
  }

  /**
   * Download a file with retry logic and exponential backoff.
   */
  private async downloadWithRetry(
    url: string,
    outputPath: string,
    maxRetries: number
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.error(`Download attempt ${attempt}/${maxRetries}...`);
        await this.downloadFile(url, outputPath);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.error(`Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Download failed after all retries");
  }

  /**
   * Stream a remote file to disk using the built in fetch implementation.
   */
  private async downloadFile(url: string, outputPath: string): Promise<void> {
    // Use Node.js built-in fetch (available in Node 18+)
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    // Stream download to handle large files
    const fileStream = await fs.open(outputPath, "w");
    const writer = fileStream.createWriteStream();

    try {
      const reader = response.body.getReader();
      let totalBytes = 0;
      const contentLength = response.headers.get("content-length");
      const expectedBytes = contentLength ? parseInt(contentLength, 10) : 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        await writer.write(value);
        totalBytes += value.length;

        // Log progress for large downloads
        if (expectedBytes > 0 && totalBytes % (1024 * 1024) === 0) {
          const progress = Math.round((totalBytes / expectedBytes) * 100);
          console.error(`Download progress: ${progress}% (${totalBytes}/${expectedBytes} bytes)`);
        }
      }

      console.error(`Download completed: ${totalBytes} bytes`);
    } finally {
      await writer.close();
      await fileStream.close();
    }
  }

  private logStage(stage: number, totalStages: number, message: string): void {
    console.error(`[Stage ${stage}/${totalStages}] ${message}`);
  }

  /**
   * Extract the ast-grep binary from an archive and stage the executable.
   */
  private async extractBinary(
    zipPath: string,
    targetPath: string,
    platform: string
  ): Promise<void> {
    try {
      const extractDir = path.join(path.dirname(targetPath), "extract");
      await fs.mkdir(extractDir, { recursive: true });

      if (platform === "win32") {
        // Use PowerShell on Windows
        await execFileAsync(
          "powershell",
          ["-Command", `Expand-Archive -Path "${zipPath}" -DestinationPath "${extractDir}" -Force`],
          { timeout: 30000 }
        );
      } else {
        // Check if unzip is available, fallback to manual extraction
        try {
          await execFileAsync("unzip", ["-o", zipPath, "-d", extractDir], { timeout: 30000 });
        } catch {
          throw new Error(
            "Unzip command not available. Please install unzip or use --use-system option."
          );
        }
      }

      // Find the ast-grep binary in extracted files
      const extractedFiles = await this.findFilesRecursively(extractDir);
      const binaryPattern = platform === "win32" ? /ast-grep\.exe$/ : /ast-grep$/;
      const astGrepFile = extractedFiles.find((file) => binaryPattern.test(file));

      if (!astGrepFile) {
        throw new Error(
          `ast-grep binary not found in archive. Found files: ${extractedFiles.join(", ")}`
        );
      }

      // Move binary to final location
      await fs.rename(astGrepFile, targetPath);

      // Cleanup extract directory
      await fs.rm(extractDir, { recursive: true, force: true });
    } catch (error) {
      throw new Error(
        `Failed to extract binary: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Walk a directory tree and collect file paths for archive extraction.
   */
  private async findFilesRecursively(dir: string): Promise<string[]> {
    const files: string[] = [];

    async function scan(currentDir: string): Promise<void> {
      const items = await fs.readdir(currentDir);

      for (const item of items) {
        const itemPath = path.join(currentDir, item);
        const stats = await fs.stat(itemPath);

        if (stats.isFile()) {
          files.push(itemPath);
        } else if (stats.isDirectory()) {
          await scan(itemPath);
        }
      }
    }

    await scan(dir);
    return files;
  }

  /**
   * Remove temporary files created during download or extraction.
   */
  private async cleanup(paths: string[]): Promise<void> {
    for (const filePath of paths) {
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Return the resolved ast-grep binary path if initialization succeeded.
   */
  getBinaryPath(): string | null {
    return this.binaryPath;
  }

  /**
   * Execute ast-grep with the provided arguments and optional stdin payload.
   */
  async executeAstGrep(
    args: string[],
    options: { cwd?: string; timeout?: number; stdin?: string } = {}
  ): Promise<{ stdout: string; stderr: string }> {
    if (!this.binaryPath) {
      throw new BinaryError("Binary not initialized");
    }

    const cwd = options.cwd || process.cwd();
    const timeout = options.timeout || 30000;

    // Determine the command and arguments based on file type
    const { command, commandArgs } = this.getExecutionCommand(this.binaryPath, args);

    // If stdin is provided, use spawn to write to child stdin
    if (options.stdin !== undefined) {
      return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(command, commandArgs, { cwd });
        let stdout = "";
        let stderr = "";

        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
          reject(new Error(`ast-grep execution timed out after ${timeout}ms`));
        }, timeout);

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });

        child.on("error", (err: NodeJS.ErrnoException) => {
          clearTimeout(timer);
          if (err.code === "ENOENT") {
            reject(new BinaryError(`ast-grep binary not found at ${this.binaryPath}`));
          } else {
            reject(
              new Error(
                `ast-grep execution failed: ${err instanceof Error ? err.message : String(err)}`
              )
            );
          }
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(`ast-grep exited with code ${code}: ${stderr || stdout}`));
          }
        });

        try {
          child.stdin.write(options.stdin);
          child.stdin.end();
        } catch (e) {
          clearTimeout(timer);
          reject(
            new Error(
              `Failed to write stdin to ast-grep: ${e instanceof Error ? e.message : String(e)}`
            )
          );
        }
      });
    }

    // No stdin: use execFile
    try {
      const result = await execFileAsync(command, commandArgs, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 10,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ETIMEDOUT") {
        throw new Error(`ast-grep execution timed out after ${timeout}ms`);
      }
      if (err.code === "ENOENT") {
        throw new BinaryError(`ast-grep binary not found at ${this.binaryPath}`);
      }
      throw new Error(`ast-grep execution failed: ${err.message}`);
    }
  }

  /**
   * Determine the appropriate command wrapper for invoking the binary on each platform.
   */
  private getExecutionCommand(
    binaryPath: string,
    args: string[]
  ): { command: string; commandArgs: string[] } {
    if (binaryPath.endsWith(".ps1")) {
      return {
        command: "powershell.exe",
        commandArgs: ["-File", binaryPath, ...args],
      };
    } else if (binaryPath.endsWith(".cmd")) {
      return {
        command: "cmd.exe",
        commandArgs: ["/c", binaryPath, ...args],
      };
    } else {
      return {
        command: binaryPath,
        commandArgs: args,
      };
    }
  }
}
