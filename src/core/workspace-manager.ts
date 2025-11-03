import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { SecurityError } from '../types/errors.js';

export interface WorkspaceConfig {
  root: string;
  allowedPaths: string[];
  blockedPaths: string[];
  maxDepth: number;
}

/**
 * Detects and manages workspace boundaries used by MCP tools.
 */
export class WorkspaceManager {
  private config: WorkspaceConfig;

  /**
   * Build workspace configuration from an optional explicit root.
   */
  constructor(explicitRoot?: string) {
    this.config = this.detectWorkspace(explicitRoot);
  }

  /**
   * Determine the effective workspace root and allowed path boundaries.
   */
  private detectWorkspace(explicitRoot?: string): WorkspaceConfig {
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
      maxDepth: 10,
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
    console.error(`Starting workspace detection from: ${currentDir}`);

    // Enhanced root indicators with priority ordering
    const primaryIndicators = ['.git', 'package.json', 'Cargo.toml', 'go.mod', 'pom.xml'];
    const secondaryIndicators = ['pyproject.toml', 'composer.json', 'build.gradle', 'tsconfig.json'];
    const tertiaryIndicators = ['Makefile', 'README.md', '.vscode', '.idea', 'Gemfile'];

    const allIndicators = [...primaryIndicators, ...secondaryIndicators, ...tertiaryIndicators];

    // Enhanced detection with validation - increased search depth to 8 levels
    for (let depth = 0; depth <= 8; depth++) {
      // Try primary indicators first (most reliable)
      for (const indicator of primaryIndicators) {
        try {
          fsSync.accessSync(path.join(currentDir, indicator));
          if (this.validateWorkspaceRoot(currentDir)) {
            console.error(`Found primary workspace indicator '${indicator}' in: ${currentDir}`);
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
          if (this.validateWorkspaceRoot(currentDir)) {
            console.error(`Found secondary workspace indicator '${indicator}' in: ${currentDir}`);
            return currentDir;
          }
        } catch {
          // Indicator not found, continue
        }
      }

      // Try tertiary indicators as last resort
      if (depth >= 2) { // Only check tertiary after going up a bit
        for (const indicator of tertiaryIndicators) {
          try {
            fsSync.accessSync(path.join(currentDir, indicator));
            if (this.validateWorkspaceRoot(currentDir)) {
              console.error(`Found tertiary workspace indicator '${indicator}' in: ${currentDir}`);
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
            fsSync.accessSync(path.join(candidate, 'package.json'));
            fsSync.accessSync(path.join(candidate, 'src'));
            console.error(`Using nested project directory as workspace root: ${candidate}`);
            return candidate;
          } catch {
            // Not a project directory
          }
        }
      }
    } catch {}

    // Enhanced fallback: use current directory with validation
    const fallback = process.cwd();
    console.error(`No workspace indicators found, using current directory: ${fallback}`);
    return fallback;
  }

  private validateWorkspaceRoot(rootPath: string): boolean {
    try {
      const entries = fsSync.readdirSync(rootPath);

      // Check for presence of source code files or directories
      const codeIndicators = ['src', 'lib', 'app', 'components', 'modules', 'source', 'Sources'];
      const hasCodeStructure = entries.some(entry => {
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
    const systemPaths = [
      '/etc', '/bin', '/usr', '/sys', '/proc',           // Unix system dirs
      'C:\\Windows', 'C:\\Program Files',               // Windows system dirs
      path.join(process.env.HOME || '', '.ssh'),        // SSH keys
      path.join(process.env.HOME || '', '.aws'),        // AWS credentials
      'node_modules/.bin',                              // Binary executables
      '.git',                                           // Git internal files
    ];

    return systemPaths.map(p => path.resolve(p));
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
      // Resolve the path relative to workspace root
      const resolvedPath = path.resolve(this.config.root, inputPath);
      const normalizedRoot = path.resolve(this.config.root);
      const relativeFromRoot = path.relative(normalizedRoot, resolvedPath);

      // Ensure the resolved path is within the workspace root
      if (
        relativeFromRoot === '' ||
        relativeFromRoot === '.'
      ) {
        // resolvedPath is the root itself; allow
      } else if (
        relativeFromRoot.startsWith('..' + path.sep) ||
        relativeFromRoot === '..'
      ) {
        return {
          valid: false,
          resolvedPath,
          error: `Path "${inputPath}" is outside workspace root`
        };
      }

      // Check against blocked paths
      for (const blockedPath of this.config.blockedPaths) {
        if (resolvedPath.startsWith(blockedPath)) {
          return {
            valid: false,
            resolvedPath,
            error: `Access to system directory "${inputPath}" is blocked`
          };
        }
      }

      // Check depth limit
      const relativePath = relativeFromRoot;
      const depth = relativePath.split(path.sep).length;

      if (depth > this.config.maxDepth) {
        return {
          valid: false,
          resolvedPath,
          error: `Path depth (${depth}) exceeds maximum allowed depth (${this.config.maxDepth})`
        };
      }

      return {
        valid: true,
        resolvedPath
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        valid: false,
        resolvedPath: inputPath,
        error: `Invalid path: ${errorMessage}`
      };
    }
  }

  validatePaths(inputPaths: string[]): { valid: boolean; resolvedPaths: string[]; errors: string[] } {
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
      errors
    };
  }

  // Get all files in the workspace (with safety limits)
  async getWorkspaceFiles(options: {
    includePatterns?: string[];
    excludePatterns?: string[];
    maxFiles?: number;
  } = {}): Promise<string[]> {
    const {
      includePatterns = [],
      excludePatterns = ['node_modules', '.git', 'build', 'dist'],
      maxFiles = 100000
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
          if (excludePatterns.some(pattern => {
            return relativePath.includes(pattern) ||
                   item.startsWith('.') && pattern === '.*';
          })) {
            continue;
          }

          const stats = await fs.stat(itemPath);

          if (stats.isFile()) {
            // Check include patterns if specified
            if (includePatterns.length === 0 ||
                includePatterns.some(pattern => relativePath.includes(pattern))) {
              files.push(itemPath);
            }
          } else if (stats.isDirectory()) {
            await scanDirectory(itemPath, currentDepth + 1);
          }
        }
      } catch (error) {
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
          } else if (stats.isDirectory() && !item.startsWith('.')) {
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
