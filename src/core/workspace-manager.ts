import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { PathValidator } from "../utils/validation.js";

export interface WorkspaceConfig {
  root: string;
  allowedPaths: string[];
  blockedPaths: string[];
  maxDepth: number;
}

export interface WorkspaceManagerOptions {
  explicitRoot?: string;
  maxDepth?: number;
}

/**
 * Detects and manages workspace boundaries used by MCP tools.
 */
export class WorkspaceManager {
  private config: WorkspaceConfig;
  private static readonly DEFAULT_MAX_DEPTH = 10;
  private static readonly MIN_MAX_DEPTH = 1;
  private static readonly MAX_MAX_DEPTH = 20;

  /**
   * Build workspace configuration from optional parameters.
   * @param options - Configuration options including explicit root and maxDepth
   */
  constructor(options?: WorkspaceManagerOptions | string) {
    // Support legacy string parameter for backward compatibility
    if (typeof options === "string") {
      this.config = this.detectWorkspace(options, WorkspaceManager.DEFAULT_MAX_DEPTH);
    } else {
      const explicitRoot = options?.explicitRoot;
      const maxDepth = options?.maxDepth ?? WorkspaceManager.DEFAULT_MAX_DEPTH;

      // Validate maxDepth
      if (maxDepth < WorkspaceManager.MIN_MAX_DEPTH || maxDepth > WorkspaceManager.MAX_MAX_DEPTH) {
        throw new Error(
          `maxDepth must be between ${WorkspaceManager.MIN_MAX_DEPTH} and ${WorkspaceManager.MAX_MAX_DEPTH}, got ${maxDepth}`
        );
      }

      this.config = this.detectWorkspace(explicitRoot, maxDepth);
    }
  }

  /**
   * Determine the effective workspace root and allowed path boundaries.
   */
  private detectWorkspace(explicitRoot?: string, maxDepth: number = WorkspaceManager.DEFAULT_MAX_DEPTH): WorkspaceConfig {
    let workspaceRoot: string;

    if (explicitRoot) {
      workspaceRoot = path.resolve(explicitRoot);
    } else {
      // Auto-detect workspace root
      workspaceRoot = this.autoDetectWorkspaceRoot();
    }

    return {
      root: workspaceRoot,
      allowedPaths: [],
      blockedPaths: this.getBlockedPaths(),
      maxDepth,
    };
  }

  private autoDetectWorkspaceRoot(): string {
    // Priority 1: Use explicitly set WORKSPACE_ROOT environment variable
    if (process.env.WORKSPACE_ROOT) {
      const explicitRoot = path.resolve(process.env.WORKSPACE_ROOT);
      console.error(`Using explicit workspace root: ${explicitRoot}`);
      return explicitRoot;
    }

    let currentDir = process.cwd();

    // Enhanced root indicators with priority ordering
    const primaryIndicators = [".git", "package.json", "Cargo.toml", "go.mod", "pom.xml"];
    const secondaryIndicators = [
      "pyproject.toml",
      "composer.json",
      "build.gradle",
      "tsconfig.json",
    ];
    const tertiaryIndicators = ["Makefile", "README.md", ".vscode", ".idea", "Gemfile"];

    // Enhanced detection with validation - increased search depth to 8 levels
    for (let depth = 0; depth <= 8; depth++) {
      // Try primary indicators first (most reliable)
      for (const indicator of primaryIndicators) {
        try {
          fsSync.accessSync(path.join(currentDir, indicator));
          // Primary indicators are strong signals - validate but don't require code structure
          if (this.validateWorkspaceRoot(currentDir, true)) {
            return currentDir;
          }
        } catch {
          // Indicator not found, continue
        }
      }

      // Try secondary indicators if no primary found
      for (const indicator of secondaryIndicators) {
        try {
          fsSync.accessSync(path.join(currentDir, indicator));
          // Secondary indicators are also strong signals
          if (this.validateWorkspaceRoot(currentDir, true)) {
            return currentDir;
          }
        } catch {
          // Indicator not found, continue
        }
      }

      // Try tertiary indicators as last resort
      if (depth >= 2) {
        // Only check tertiary after going up a bit
        for (const indicator of tertiaryIndicators) {
          try {
            fsSync.accessSync(path.join(currentDir, indicator));
            // Tertiary indicators require code structure validation
            if (this.validateWorkspaceRoot(currentDir, false)) {
              return currentDir;
            }
          } catch {
            // Indicator not found, continue
          }
        }
      }

      // Move up one directory
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached filesystem root
      currentDir = parentDir;
    }

    // Try common nested project directories (e.g., monorepo layout)
    try {
      const entries = fsSync.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const candidate = path.join(currentDir, entry.name);
          try {
            fsSync.accessSync(path.join(candidate, "package.json"));
            fsSync.accessSync(path.join(candidate, "src"));
            return candidate;
          } catch {
            // Not a project directory
          }
        }
      }
    } catch {}

    // Fallback with warning: use current directory but require explicit paths
    const fallback = process.cwd();
    console.error(
      `WARNING: No workspace root detected. Current directory "${fallback}" lacks project indicators (.git, package.json, etc.). ` +
        `All operations will require explicit absolute paths. Set WORKSPACE_ROOT environment variable for better workspace detection.`
    );
    return fallback;
  }

  private validateWorkspaceRoot(rootPath: string, hasStrongIndicator = false): boolean {
    try {
      // Reject common user home directories
      const home = process.env.HOME || process.env.USERPROFILE || "";
      if (home && path.resolve(rootPath) === path.resolve(home)) {
        return false; // Never use home directory as workspace root
      }

      // Reject if path contains common user directory names
      const normalizedPath = rootPath.toLowerCase();
      const userDirPatterns = [
        /[/\\]downloads[/\\]?$/i,
        /[/\\]documents[/\\]?$/i,
        /[/\\]desktop[/\\]?$/i,
        /[/\\]pictures[/\\]?$/i,
        /[/\\]videos[/\\]?$/i,
        /[/\\]music[/\\]?$/i,
      ];
      if (userDirPatterns.some((pattern) => pattern.test(normalizedPath))) {
        return false;
      }

      // If we have a strong indicator (like .git or package.json), trust it
      // and skip the code structure check
      if (hasStrongIndicator) {
        return true;
      }

      const entries = fsSync.readdirSync(rootPath);

      // Check for presence of source code files or directories
      const codeIndicators = ["src", "lib", "app", "components", "modules", "source", "Sources"];
      const hasCodeStructure = entries.some((entry) => {
        try {
          const entryPath = path.join(rootPath, entry);
          const stat = fsSync.statSync(entryPath);

          if (stat.isDirectory() && codeIndicators.includes(entry)) {
            return true;
          }

          if (stat.isFile() && entry.match(/\.(js|ts|jsx|tsx|py|java|rs|go|cpp|c|h|php|rb)$/i)) {
            return true;
          }
        } catch {
          // Skip entries we can't stat
        }
        return false;
      });

      return hasCodeStructure;
    } catch {
      return false; // If we can't read the directory, assume it's not a valid workspace
    }
  }

  private getBlockedPaths(): string[] {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const systemPaths = [
      // Unix system directories
      "/etc",
      "/bin",
      "/usr",
      "/sys",
      "/proc",
      // Windows system directories
      "C:\\Windows",
      "C:\\Program Files",
      "C:\\Program Files (x86)",
      // Sensitive user directories
      path.join(home, ".ssh"),
      path.join(home, ".aws"),
      path.join(home, ".gnupg"),
      // Common user directories that shouldn't be scanned
      path.join(home, "Downloads"),
      path.join(home, "Documents"),
      path.join(home, "Desktop"),
      path.join(home, "Pictures"),
      path.join(home, "Videos"),
      path.join(home, "Music"),
      // Language-specific cache/module directories
      path.join(home, "go", "pkg"),
      path.join(home, ".cargo"),
      path.join(home, ".rustup"),
      path.join(home, ".npm"),
      path.join(home, ".cache"),
      // Build artifacts and dependencies
      "node_modules/.bin",
      ".git",
    ];

    return systemPaths.map((p) => path.resolve(p)).filter((p) => p !== path.resolve(""));
  }

  getConfig(): WorkspaceConfig {
    return { ...this.config };
  }

  /**
   * Expose the root directory used for workspace relative operations.
   */
  getWorkspaceRoot(): string {
    return this.config.root;
  }

  validatePath(inputPath: string): { valid: boolean; resolvedPath: string; error?: string } {
    try {
      // Step 1: Check if path is absolute - reject relative paths immediately
      if (!PathValidator.isAbsolutePath(inputPath)) {
        return {
          valid: false,
          resolvedPath: inputPath,
          error: `Path must be absolute: "${inputPath}". Relative paths are not supported. Use absolute paths like "/workspace/src/" or "C:/workspace/src/"`,
        };
      }

      // Check for Windows absolute paths on non-Windows platforms
      if (PathValidator.isWindowsAbsolutePath(inputPath) && process.platform !== "win32") {
        return {
          valid: false,
          resolvedPath: inputPath,
          error: `Windows absolute path "${inputPath}" is not supported on non-Windows platforms. Use relative paths or POSIX absolute paths.`,
        };
      }

      // Step 2 & 3: Compute workspace boundary and depth checks on OS-native paths
      // Use path.relative() with OS-native paths before normalization
      const relativeFromRoot = path.relative(this.config.root, inputPath);

      // Ensure the path is within the workspace root
      if (relativeFromRoot === "" || relativeFromRoot === ".") {
        // Path is the root itself; allow
      } else if (relativeFromRoot.startsWith(".." + path.sep) || relativeFromRoot === "..") {
        return {
          valid: false,
          resolvedPath: inputPath,
          error: `Path "${inputPath}" is outside workspace root`,
        };
      }

      // Check depth limit using OS-native relative path
      const depth = relativeFromRoot.split(path.sep).length;

      if (depth > this.config.maxDepth) {
        return {
          valid: false,
          resolvedPath: inputPath,
          error: `Path depth (${depth}) exceeds maximum allowed depth (${this.config.maxDepth})`,
        };
      }

      // Step 4: Security checks on absolute input path
      // Check against blocked paths
      for (const blockedPath of this.config.blockedPaths) {
        if (inputPath.startsWith(blockedPath)) {
          return {
            valid: false,
            resolvedPath: inputPath,
            error: `Access to system directory "${inputPath}" is blocked`,
          };
        }
      }

      // Step 5: After all validations pass, normalize path for ast-grep compatibility
      // Normalize Windows paths to forward slashes only at the end
      const normalizedPath = PathValidator.normalizePath(inputPath);

      return {
        valid: true,
        resolvedPath: normalizedPath,
      };
    } catch (error) {
      // Step 6: Error handling
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        resolvedPath: PathValidator.normalizePath(inputPath),
        error: `Invalid path: ${errorMessage}`,
      };
    }
  }

  validatePaths(inputPaths: string[]): {
    valid: boolean;
    resolvedPaths: string[];
    errors: string[];
  } {
    const resolvedPaths: string[] = [];
    const errors: string[] = [];
    let allValid = true;

    for (const inputPath of inputPaths) {
      const validation = this.validatePath(inputPath);
      if (validation.valid) {
        resolvedPaths.push(validation.resolvedPath);
      } else {
        allValid = false;
        errors.push(validation.error || `Invalid path: ${inputPath}`);
      }
    }

    return {
      valid: allValid,
      resolvedPaths,
      errors,
    };
  }

  // Get all files in the workspace (with safety limits)
  async getWorkspaceFiles(
    options: {
      includePatterns?: string[];
      excludePatterns?: string[];
      maxFiles?: number;
    } = {}
  ): Promise<string[]> {
    const {
      includePatterns = [],
      excludePatterns = ["node_modules", ".git", "build", "dist"],
      maxFiles = 100000,
    } = options;

    const files: string[] = [];
    const visited = new Set<string>();

    const scanDirectory = async (dirPath: string, currentDepth = 0): Promise<void> => {
      if (currentDepth > this.config.maxDepth) return;
      if (files.length >= maxFiles) return;

      try {
        const items = await fs.readdir(dirPath);

        for (const item of items) {
          if (files.length >= maxFiles) break;

          const itemPath = path.join(dirPath, item);
          const relativePath = path.relative(this.config.root, itemPath);

          // Skip if already visited (symlink protection)
          if (visited.has(itemPath)) continue;
          visited.add(itemPath);

          // Check exclude patterns
          if (
            excludePatterns.some((pattern) => {
              return relativePath.includes(pattern) || (item.startsWith(".") && pattern === ".*");
            })
          ) {
            continue;
          }

          const stats = await fs.stat(itemPath);

          if (stats.isFile()) {
            // Check include patterns if specified
            if (
              includePatterns.length === 0 ||
              includePatterns.some((pattern) => relativePath.includes(pattern))
            ) {
              files.push(itemPath);
            }
          } else if (stats.isDirectory()) {
            await scanDirectory(itemPath, currentDepth + 1);
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    await scanDirectory(this.config.root);

    return files;
  }

  private async countFilesRecursive(dir: string, currentDepth = 0): Promise<number> {
    if (currentDepth > this.config.maxDepth) return 0;

    let count = 0;
    try {
      const items = await fs.readdir(dir);

      for (const item of items) {
        const itemPath = path.join(dir, item);
        try {
          const stats = await fs.stat(itemPath);

          if (stats.isFile()) {
            count++;
          } else if (stats.isDirectory() && !item.startsWith(".")) {
            count += await this.countFilesRecursive(itemPath, currentDepth + 1);
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Skip inaccessible directories
    }

    return count;
  }
}
