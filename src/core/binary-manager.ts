import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { BinaryError, InstallationOptions } from "../types/errors.js";
import { inflateRawSync } from "zlib";
import { PathValidator } from "../utils/validation.js";

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
        // Note: path.join() returns platform-native separators (backslashes on Windows).
        // These paths are used with Node.js fs methods which accept both separators.
        // Normalization to forward slashes is NOT needed here - only when passing to ast-grep CLI.
        return PathValidator.normalizePath(path.join(userProfile, ".ast-grep-mcp", "binaries"));
      }
    }

    // On Unix-like systems, use HOME or fall back to os.homedir()
    const home = process.env.HOME || os.homedir();
    if (home && path.isAbsolute(home)) {
      // Note: path.join() returns forward slashes on Unix.
      // No normalization needed for fs operations.
      return PathValidator.normalizePath(path.join(home, ".ast-grep-mcp", "binaries"));
    }

    // Last resort: use a temp directory
    const tempDir = os.tmpdir();
    console.error(
      `Warning: Could not determine user home directory, using temp directory: ${tempDir}`
    );
    return PathValidator.normalizePath(path.join(tempDir, ".ast-grep-mcp", "binaries"));
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

    // 2. System binary (default)
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
      console.error(`ast-grep v${version} (custom: ${customPath})`);
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
      console.error(`ast-grep v${version} (system: ${systemPath})`);
    } else {
      throw new BinaryError(
        "ast-grep not found in PATH. Please install ast-grep using one of the official methods:\n" +
          "  npm install -g @ast-grep/cli\n" +
          "  brew install ast-grep\n" +
          "  cargo install ast-grep\n" +
          "  scoop install ast-grep\n" +
          "See: https://ast-grep.github.io/guide/quick-start.html#installation"
      );
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
   * Resolve existing cached binary path, handling Windows script wrappers.
   */
  private async resolveExistingBinary(binaryPath: string, platform: string): Promise<string | null> {
    if (await this.fileExists(binaryPath)) {
      return binaryPath;
    }

    if (platform === "win32") {
      const baseWithoutExe = binaryPath.replace(/\.exe$/i, "");
      const candidatePaths = [
        `${baseWithoutExe}.cmd`,
        `${binaryPath}.cmd`,
        `${baseWithoutExe}.ps1`,
        `${binaryPath}.ps1`,
        path.join(path.dirname(binaryPath), "ast-grep.exe"),
        path.join(path.dirname(binaryPath), "ast-grep.cmd"),
        path.join(path.dirname(binaryPath), "ast-grep.ps1"),
      ];

      for (const candidateRaw of candidatePaths) {
        const candidate = PathValidator.normalizePath(candidateRaw);
        if (await this.fileExists(candidate)) {
          return candidate;
        }
      }
    }

    return null;
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
    // Temp file path: Uses platform-native separators for fs operations.
    // Node.js fs methods (fs.open, fs.unlink) accept both separators on Windows.
    // No normalization needed for internal file operations.
    const tempZipPath = PathValidator.normalizePath(targetPath + ".zip");

    // Create cache directory with platform-native path.
    // path.dirname() preserves separator type from input path.
    // Ensure cache directory exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    console.error(`Downloading from: ${downloadUrl}`);

    try {
      // Download with retry logic
      await this.downloadWithRetry(downloadUrl, tempZipPath, 3);

      console.error("Extracting binary from archive...");
      // Extract binary from zip
      await this.extractBinary(tempZipPath, PathValidator.normalizePath(targetPath), platform);

      console.error("Validating binary version...");
      if (!(await this.testBinary(PathValidator.normalizePath(targetPath), releaseVersion))) {
        const actualVersion = await this.extractBinaryVersion(
          PathValidator.normalizePath(targetPath)
        );
        throw new BinaryError(
          `Downloaded binary version mismatch. Expected v${releaseVersion}, found ${actualVersion ?? "unknown"}. This may indicate a corrupted download.`
        );
      }

      const validatedVersion =
        (await this.extractBinaryVersion(PathValidator.normalizePath(targetPath))) ??
        releaseVersion;
      console.error(`Binary version validated: v${validatedVersion}`);
      console.error(`Successfully installed ast-grep v${validatedVersion}`);

      // Set executable permissions on Unix systems
      if (platform !== "win32") {
        await fs.chmod(PathValidator.normalizePath(targetPath), "755");
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
      // Extraction directory: Uses platform-native separators.
      // All fs operations (mkdir, readdir, rename, rm) accept both separators on Windows.
      const extractDir = path.join(path.dirname(targetPath), "extract");
      await fs.mkdir(extractDir, { recursive: true });

      if (platform === "win32") {
        const sanitizeForPowerShell = (value: string): string => value.replace(/"/g, '""');
        const extractionScript = `Expand-Archive -Path "${sanitizeForPowerShell(zipPath)}" -DestinationPath "${sanitizeForPowerShell(extractDir)}" -Force`;
        const powerShellCandidates = ["powershell.exe", "powershell", "pwsh.exe", "pwsh"];
        const describeError = (error: unknown): string => {
          const err = error as NodeJS.ErrnoException & { stderr?: string };
          if (err?.stderr) {
            return err.stderr.toString();
          }
          if (err?.message) {
            return err.message;
          }
          return String(error);
        };

        let extracted = false;
        let manualError: unknown = null;
        let tarError: unknown = null;
        let lastPowerShellError: unknown = null;

        try {
          await this.extractZipManually(zipPath, extractDir);
          extracted = true;
        } catch (error) {
          manualError = error;
        }

        if (!extracted) {
          try {
            await execFileAsync(
              "tar",
              ["-xf", zipPath, "--force-local", "-C", extractDir],
              { timeout: 30000 }
            );
            extracted = true;
          } catch (error) {
            tarError = error;
          }
        }

        if (!extracted) {
          for (const command of powerShellCandidates) {
            try {
              await execFileAsync(
                command,
                ["-NoLogo", "-NoProfile", "-Command", extractionScript],
                { timeout: 30000 }
              );
              extracted = true;
              break;
            } catch (error) {
              lastPowerShellError = error;
              const err = error as NodeJS.ErrnoException & { stderr?: string };
              if (err.code === "ENOENT") {
                continue;
              }
              throw new Error(`Failed to extract with ${command}: ${describeError(error)}`);
            }
          }
        }

        if (!extracted) {
          const messages: string[] = [];
          if (manualError) {
            messages.push(`Manual extraction failed: ${describeError(manualError)}`);
          }
          if (tarError) {
            messages.push(`tar failed: ${describeError(tarError)}`);
          }
          if (lastPowerShellError) {
            messages.push(`PowerShell failed: ${describeError(lastPowerShellError)}`);
          } else {
            messages.push("PowerShell executable not found on PATH.");
          }
          throw new Error(messages.join(" "));
        }
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
   * Extract zip archive contents using pure JavaScript when platform tools are unavailable.
   */
  private async extractZipManually(zipPath: string, extractDir: string): Promise<void> {
    const data = await fs.readFile(zipPath);
    const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    const eocdOffset = data.lastIndexOf(eocdSignature);
    if (eocdOffset === -1) {
      throw new Error("End of central directory signature not found");
    }

    const totalEntries = data.readUInt16LE(eocdOffset + 10);
    const centralDirectoryOffset = data.readUInt32LE(eocdOffset + 16);

    let offset = centralDirectoryOffset;

    for (let index = 0; index < totalEntries; index++) {
      const signature = data.readUInt32LE(offset);
      if (signature !== 0x02014b50) {
        throw new Error("Invalid central directory file header signature");
      }

      const compressionMethod = data.readUInt16LE(offset + 10);
      const compressedSize = data.readUInt32LE(offset + 20);
      const fileNameLength = data.readUInt16LE(offset + 28);
      const extraFieldLength = data.readUInt16LE(offset + 30);
      const commentLength = data.readUInt16LE(offset + 32);
      const localHeaderOffset = data.readUInt32LE(offset + 42);

      const fileNameStart = offset + 46;
      const fileNameEnd = fileNameStart + fileNameLength;
      const rawName = data.subarray(fileNameStart, fileNameEnd).toString("utf8");
      const normalizedName = rawName.replace(/\\/g, "/");

      offset = fileNameEnd + extraFieldLength + commentLength;

      if (!normalizedName || normalizedName.endsWith("/")) {
        await fs.mkdir(path.join(extractDir, normalizedName), { recursive: true });
        continue;
      }

      const localHeaderSignature = data.readUInt32LE(localHeaderOffset);
      if (localHeaderSignature !== 0x04034b50) {
        throw new Error(`Invalid local file header signature for ${normalizedName}`);
      }

      const localFileNameLength = data.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = data.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData = data.subarray(dataStart, dataStart + compressedSize);

      let fileBuffer: Buffer;
      if (compressionMethod === 0) {
        fileBuffer = Buffer.from(compressedData);
      } else if (compressionMethod === 8) {
        fileBuffer = inflateRawSync(compressedData);
      } else {
        throw new Error(
          `Unsupported compression method ${compressionMethod} for ${normalizedName}`
        );
      }

      const outputPath = path.join(extractDir, normalizedName);
      console.error(`[ManualExtract] writing ${outputPath}`);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, fileBuffer);
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
    // Cleanup: fs.unlink() accepts both forward and backslashes on Windows.
    // No path normalization needed for file deletion.
    // Paths can be in platform-native format or normalized format.
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

    // Binary path execution: this.binaryPath may contain platform-native separators.
    // getExecutionCommand() handles .ps1, .cmd, and .exe files correctly on Windows.
    // Path normalization is NOT needed for binary execution - only for arguments passed to ast-grep.
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
        // Allow large JSON stream output without tripping Node's buffer limit.
        maxBuffer: 1024 * 1024 * 128,
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
