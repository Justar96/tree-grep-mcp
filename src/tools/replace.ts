import * as path from "path";
import { AstGrepBinaryManager } from "../core/binary-manager.js";
import { WorkspaceManager } from "../core/workspace-manager.js";
import { ValidationError, ExecutionError } from "../types/errors.js";
import { PatternValidator, ParameterValidator, PathValidator } from "../utils/validation.js";
import type { InspectGranularity, NoIgnoreOption } from "../types/cli.js";

interface PatternObject {
  context?: string;
  selector?: string;
  strictness?: "cst" | "smart" | "ast" | "relaxed" | "signature";
}

interface ReplaceParams {
  pattern: string | PatternObject;
  replacement: string;
  language?: string;
  paths?: string[];
  code?: string;
  context?: number;
  before?: number;
  after?: number;
  dryRun?: boolean;
  timeoutMs?: number;
  verbose?: boolean;
  strictness?: "cst" | "smart" | "ast" | "relaxed" | "signature";
  globs?: string[];
  noIgnore?: NoIgnoreOption[];
  followSymlinks?: boolean;
  threads?: number;
  inspect?: InspectGranularity;
  maxDepth?: number;
}

interface ChangeEntry {
  file: string;
  matches: number;
  preview?: string;
  applied: boolean;
}

interface ReplaceResult {
  changes: ChangeEntry[];
  skippedLines: number;
  summary: {
    totalChanges: number;
    filesModified: number;
    skippedLines: number;
    dryRun: boolean;
    warnings?: string[];
  };
}

/**
 * Direct replace tool that calls ast-grep run --rewrite with minimal overhead
 */
export class ReplaceTool {
  constructor(
    private binaryManager: AstGrepBinaryManager,
    private workspaceManager: WorkspaceManager
  ) {}

  async execute(paramsRaw: Record<string, unknown>): Promise<ReplaceResult> {
    // Runtime parameter validation with type narrowing
    const params = paramsRaw as unknown as ReplaceParams;

    // Validate pattern (string or object)
    if (!params.pattern) {
      throw new ValidationError("Pattern is required");
    }

    // Determine if pattern is string or object, and extract components
    let patternString: string;
    let selector: string | undefined;
    let patternStrictness: string | undefined;

    if (typeof params.pattern === "string") {
      // String pattern
      patternString = params.pattern;

      const patternValidation = PatternValidator.validatePattern(
        patternString,
        typeof params.language === "string" ? params.language : undefined
      );
      if (!patternValidation.valid) {
        throw new ValidationError(`Invalid pattern: ${patternValidation.errors.join("; ")}`, {
          errors: patternValidation.errors,
        });
      }

      // Log warnings if any
      if (patternValidation.warnings && patternValidation.warnings.length > 0) {
        for (const warning of patternValidation.warnings) {
          console.error(`Warning: ${warning}`);
        }
      }
    } else if (PatternValidator.isPatternObject(params.pattern)) {
      // Pattern object
      const patternObj = params.pattern as PatternObject;
      const objValidation = PatternValidator.validatePatternObject(patternObj);

      if (!objValidation.valid) {
        throw new ValidationError(`Invalid pattern object: ${objValidation.errors.join("; ")}`, {
          errors: objValidation.errors,
        });
      }

      // Log warnings if any
      if (objValidation.warnings && objValidation.warnings.length > 0) {
        for (const warning of objValidation.warnings) {
          console.error(`Warning: ${warning}`);
        }
      }

      // Extract components
      patternString = patternObj.context || patternObj.selector || "";
      selector = patternObj.selector;
      patternStrictness = patternObj.strictness;
    } else {
      throw new ValidationError("Pattern must be a string or pattern object");
    }

    // Validate replacement
    // Note: Empty string is valid (deletes matched pattern)
    if (
      params.replacement === undefined ||
      params.replacement === null ||
      typeof params.replacement !== "string"
    ) {
      throw new ValidationError("Replacement is required and must be a string");
    }

    // Only validate replacement pattern if non-empty
    // Empty replacement is valid for pattern deletion
    if (params.replacement.length > 0) {
      const replacementValidation = PatternValidator.validatePattern(
        params.replacement,
        params.language
      );
      if (!replacementValidation.valid) {
        throw new ValidationError(
          `Invalid replacement: ${replacementValidation.errors.join("; ")}`,
          { errors: replacementValidation.errors }
        );
      }
    }

    // Validate metavariable consistency between pattern string and replacement
    // This ensures all metavariables used in replacement are defined in pattern
    // Example: pattern="foo($A)" with replacement="bar($B)" will fail
    // Unused pattern metavariables generate warnings (may be intentional)
    const metavarValidation = PatternValidator.compareMetavariables(
      patternString,
      params.replacement
    );
    if (!metavarValidation.valid) {
      throw new ValidationError(`Metavariable mismatch: ${metavarValidation.errors.join("; ")}`, {
        errors: metavarValidation.errors,
      });
    }

    // Capture warnings for API consumers
    const warnings =
      metavarValidation.warnings && metavarValidation.warnings.length > 0
        ? metavarValidation.warnings
        : undefined;

    // Log warnings if any - log each warning individually for better test assertions
    if (warnings) {
      for (const warning of warnings) {
        console.error(`Warning: ${warning}`);
      }
    }

    // Validate optional parameters with actionable error messages
    const contextValidation = ParameterValidator.validateContext(params.context);
    if (!contextValidation.valid) {
      throw new ValidationError(contextValidation.errors.join("; "), {
        errors: contextValidation.errors,
      });
    }

    const beforeValidation = ParameterValidator.validateContextWindow("before", params.before);
    if (!beforeValidation.valid) {
      throw new ValidationError(beforeValidation.errors.join("; "), {
        errors: beforeValidation.errors,
      });
    }

    const afterValidation = ParameterValidator.validateContextWindow("after", params.after);
    if (!afterValidation.valid) {
      throw new ValidationError(afterValidation.errors.join("; "), {
        errors: afterValidation.errors,
      });
    }

    const contextComboValidation = ParameterValidator.validateContextCombination(
      params.context,
      params.before,
      params.after
    );
    if (!contextComboValidation.valid) {
      throw new ValidationError(contextComboValidation.errors.join("; "), {
        errors: contextComboValidation.errors,
      });
    }

    const timeoutValidation = ParameterValidator.validateTimeout(params.timeoutMs);
    if (!timeoutValidation.valid) {
      throw new ValidationError(timeoutValidation.errors.join("; "), {
        errors: timeoutValidation.errors,
      });
    }

    const verboseValidation = ParameterValidator.validateVerbose(params.verbose);
    if (!verboseValidation.valid) {
      throw new ValidationError(verboseValidation.errors.join("; "), {
        errors: verboseValidation.errors,
      });
    }

    // Validate maxDepth if provided
    if (params.maxDepth !== undefined) {
      if (typeof params.maxDepth !== "number" || !Number.isFinite(params.maxDepth)) {
        throw new ValidationError("maxDepth must be a finite number");
      }
      if (params.maxDepth < 1 || params.maxDepth > 20) {
        throw new ValidationError("maxDepth must be between 1 and 20");
      }
    }

    // Validate strictness if provided
    if (params.strictness !== undefined) {
      const validStrictness = ["cst", "smart", "ast", "relaxed", "signature"];
      if (typeof params.strictness !== "string" || !validStrictness.includes(params.strictness)) {
        throw new ValidationError(
          `Invalid strictness. Must be one of: ${validStrictness.join(", ")}`
        );
      }
    }

    // Set default verbose value to true
    const isVerbose = params.verbose !== false;

    const codeValidation = ParameterValidator.validateCode(params.code);
    if (!codeValidation.valid) {
      throw new ValidationError(codeValidation.errors.join("; "), {
        errors: codeValidation.errors,
      });
    }

    const globsValidation = ParameterValidator.validateGlobs(params.globs);
    if (!globsValidation.valid) {
      throw new ValidationError(globsValidation.errors.join("; "), { errors: globsValidation.errors });
    }

    const noIgnoreValidation = ParameterValidator.validateNoIgnore(params.noIgnore);
    if (!noIgnoreValidation.valid) {
      throw new ValidationError(noIgnoreValidation.errors.join("; "), {
        errors: noIgnoreValidation.errors,
      });
    }

    const followValidation = ParameterValidator.validateBooleanOption(
      params.followSymlinks,
      "followSymlinks"
    );
    if (!followValidation.valid) {
      throw new ValidationError(followValidation.errors.join("; "), {
        errors: followValidation.errors,
      });
    }

    const threadsValidation = ParameterValidator.validateThreads(params.threads);
    if (!threadsValidation.valid) {
      throw new ValidationError(threadsValidation.errors.join("; "), {
        errors: threadsValidation.errors,
      });
    }

    const inspectValidation = ParameterValidator.validateInspect(params.inspect);
    if (!inspectValidation.valid) {
      throw new ValidationError(inspectValidation.errors.join("; "), {
        errors: inspectValidation.errors,
      });
    }


    const normalizeLang = (lang: string) => {
      const map: Record<string, string> = {
        javascript: "js",
        typescript: "ts",
        jsx: "jsx",
        tsx: "tsx",
        python: "py",
        py: "py",
        rust: "rs",
        rs: "rs",
        golang: "go",
        go: "go",
        java: "java",
        "c++": "cpp",
        cpp: "cpp",
        c: "c",
        csharp: "cs",
        cs: "cs",
        kotlin: "kt",
        kt: "kt",
      };
      const lower = (lang || "").toLowerCase();
      return map[lower] || lang;
    };

    // Build ast-grep command directly
    const args = ["run", "--pattern", patternString.trim(), "--rewrite", params.replacement];

    // Add language if provided
    if (params.language) {
      args.push("--lang", normalizeLang(params.language));
    }

    // Add selector if from pattern object
    if (selector) {
      args.push("--selector", selector);
    }

    // Add strictness (from pattern object or top-level param)
    // Pattern object strictness takes precedence over top-level param
    const effectiveStrictness = patternStrictness || params.strictness;
    if (effectiveStrictness) {
      args.push("--strictness", effectiveStrictness);
    }

    if (params.context && params.context > 0) {
      args.push("--context", params.context.toString());
    }

    if (typeof params.before === "number" && params.before > 0) {
      args.push("--before", params.before.toString());
    }

    if (typeof params.after === "number" && params.after > 0) {
      args.push("--after", params.after.toString());
    }

    if (params.globs && params.globs.length > 0) {
      for (const glob of params.globs) {
        args.push("--globs", glob);
      }
    }

    if (params.noIgnore && params.noIgnore.length > 0) {
      for (const ignoreType of params.noIgnore) {
        args.push("--no-ignore", ignoreType);
      }
    }

    if (params.followSymlinks) {
      args.push("--follow");
    }

    if (typeof params.threads === "number") {
      args.push("--threads", params.threads.toString());
    }

    if (params.inspect) {
      args.push("--inspect", params.inspect);
    }

    // Handle dry-run vs actual replacement
    // Default to dry-run (true) if not specified
    if (params.dryRun === false) {
      args.push("--update-all");
    }
    // Note: ast-grep run --rewrite outputs diff format by default (perfect for dry-run)

    // Create workspace manager with custom maxDepth if provided
    const workspaceManager = params.maxDepth !== undefined
      ? new WorkspaceManager({
          explicitRoot: this.workspaceManager.getWorkspaceRoot(),
          maxDepth: params.maxDepth
        })
      : this.workspaceManager;

    // Handle inline code vs file paths
    const executeOptions: {
      cwd: string;
      timeout: number;
      stdin?: string;
    } = {
      cwd: workspaceManager.getWorkspaceRoot(),
      timeout: params.timeoutMs || 60000,
    };

    if (params.code) {
      // Inline code mode
      args.push("--stdin");
      if (!params.language) {
        throw new ValidationError("Language required for inline code");
      }
      executeOptions.stdin = params.code;
    } else {
      // File mode - add paths (default to current directory)
      // Only use "." as default when paths are omitted
      const pathsProvided = params.paths && Array.isArray(params.paths) && params.paths.length > 0;
      const inputPaths: string[] = pathsProvided && params.paths ? params.paths : ["."];

      // Warn when scanning entire workspace with default path
      if (!pathsProvided) {
        const workspaceRoot = workspaceManager.getWorkspaceRoot();
        const home = process.env.HOME || process.env.USERPROFILE || "";

        // Prevent scanning from home directory or common user directories
        if (home && path.resolve(workspaceRoot) === path.resolve(home)) {
          throw new ValidationError(
            `Cannot replace in home directory without explicit paths. Please provide absolute paths to specific directories.`
          );
        }

        const normalizedRoot = workspaceRoot.toLowerCase();
        const userDirPatterns = [
          /[/\\]downloads[/\\]?$/i,
          /[/\\]documents[/\\]?$/i,
          /[/\\]desktop[/\\]?$/i,
        ];
        if (userDirPatterns.some((pattern) => pattern.test(normalizedRoot))) {
          throw new ValidationError(
            `Cannot replace in user directory without explicit paths. Please provide absolute paths to specific directories.`
          );
        }

        console.error(
          `Warning: No paths provided, replacing in entire workspace from root: ${workspaceRoot}`
        );
      }

      // Validate that paths are absolute
      // Only allow "." when it's the default (paths not provided by client)
      for (const p of inputPaths) {
        if (!path.isAbsolute(p)) {
          if (p === "." || p === "") {
            // "." or "" only allowed when paths were not provided (default case)
            if (pathsProvided) {
              throw new ValidationError(
                `Path must be absolute. Use '/workspace/src/' or 'C:/workspace/src/'`
              );
            }
          } else {
            throw new ValidationError(
              `Path must be absolute. Use '/workspace/src/' or 'C:/workspace/src/'`
            );
          }
        }
      }

      // Normalize paths for ast-grep compatibility (Windows -> forward slashes)
      // Empty strings should be treated as current directory
      const normalizedPaths = inputPaths.map((p) =>
        p === "" ? "." : PathValidator.normalizePath(p)
      );

      // Validate paths for security (but don't use the absolute resolved paths)
      const { valid, errors } = workspaceManager.validatePaths(normalizedPaths);
      if (!valid) {
        // Replace normalized paths in error messages with original paths
        const originalErrors = errors.map((err) => {
          let modifiedErr = err;
          for (let i = 0; i < normalizedPaths.length; i++) {
            if (normalizedPaths[i] !== inputPaths[i]) {
              modifiedErr = modifiedErr.replace(normalizedPaths[i], inputPaths[i]);
            }
          }
          return modifiedErr;
        });
        const errorDetail = originalErrors.length > 0 ? `: ${originalErrors[0]}` : "";
        throw new ValidationError(`Invalid paths${errorDetail}`, { errors: originalErrors });
      }

      // Pass normalized paths to ast-grep (not absolute resolved paths)
      args.push(...normalizedPaths);
    }

    try {
      const result = await this.binaryManager.executeAstGrep(args, executeOptions);
      return this.parseResults(result.stdout, params, warnings, isVerbose);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ExecutionError(`Replace failed: ${message}`);
    }
  }

  /**
   * Resolves file paths to absolute paths.
   * Since input paths are absolute, ast-grep returns absolute paths.
   * STDIN and empty strings are returned as-is.
   */
  private resolveFilePath(filePath: string): string {
    // STDIN and empty paths stay as-is
    if (filePath === "STDIN" || filePath === "") {
      return filePath;
    }
    // If path is already absolute, return as-is
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    // Return unchanged if not absolute (contract: ast-grep returns absolute paths when given absolute inputs)
    return filePath;
  }

  private parseResults(
    stdout: string,
    params: ReplaceParams,
    warnings?: string[],
    isVerbose: boolean = true
  ): ReplaceResult {
    const changes: ChangeEntry[] = [];

    if (!stdout.trim()) {
      return {
        changes,
        skippedLines: 0,
        summary: {
          totalChanges: 0,
          filesModified: 0,
          skippedLines: 0,
          dryRun: params.dryRun !== false,
          ...(warnings && warnings.length > 0 ? { warnings } : {}),
        },
      };
    }

    // Parse diff output - very simple approach
    const lines = stdout.split("\n");
    let skippedLines = 0;
    let currentFile = "";
    let changeCount = 0;
    let diffContent = "";

    for (const line of lines) {
      if (line && !line.startsWith("@@") && !line.includes("│") && !line.startsWith(" ")) {
        // Looks like a file header
        if (currentFile && changeCount > 0) {
          changes.push({
            file: this.resolveFilePath(currentFile),
            matches: changeCount,
            preview: params.dryRun !== false ? diffContent : undefined,
            applied: params.dryRun === false,
          });
        }
        currentFile = line.trim();
        changeCount = 0;
        diffContent = line + "\n";
      } else if (
        line.includes("│ -") ||
        line.includes("│ +") ||
        line.includes("│-") ||
        line.includes("│+")
      ) {
        // Change lines can have format: "3    │ -code" or "   3 │ +code"
        if (line.includes("│ -") || line.includes("│-")) changeCount++;
        diffContent += line + "\n";
      } else if (/^\s*\d+\s+\d+\s*│/.test(line)) {
        // Valid context line with line numbers (e.g., "1  1 │ code" or "1  1│ code")
        diffContent += line + "\n";
      } else if (
        line.trim() === "" ||
        /^\s+$/.test(line) ||
        line.startsWith("@@") ||
        line.startsWith("diff --git") ||
        line.startsWith("index") ||
        line.startsWith("---") ||
        line.startsWith("+++")
      ) {
        // Valid formatting: empty lines, whitespace, diff markers, or diff metadata
        diffContent += line + "\n";
      } else {
        // Unexpected line that doesn't match any known diff pattern
        skippedLines++;
        console.error(`Warning: Skipped unexpected diff line: ${line.substring(0, 100)}...`);
        diffContent += line + "\n";
      }
    }

    // Don't forget the last file
    if (currentFile && (changeCount > 0 || diffContent.trim())) {
      changes.push({
        file: this.resolveFilePath(currentFile),
        matches: Math.max(changeCount, 1),
        preview: params.dryRun !== false ? diffContent : undefined,
        applied: params.dryRun === false,
      });
    }

    // Log summary warning if any lines were skipped
    if (skippedLines > 0) {
      console.error(
        `Warning: Skipped ${skippedLines} unexpected diff lines out of ${lines.length} total lines`
      );
    }

    // If not verbose, return only a simplified result with summary
    if (!isVerbose) {
      return {
        changes: [], // Empty changes array for non-verbose mode
        skippedLines,
        summary: {
          totalChanges: changes.reduce((sum, c) => sum + c.matches, 0),
          filesModified: changes.length,
          skippedLines,
          dryRun: params.dryRun !== false,
          ...(warnings && warnings.length > 0 ? { warnings } : {}),
        },
      };
    }

    return {
      changes,
      skippedLines,
      summary: {
        totalChanges: changes.reduce((sum, c) => sum + c.matches, 0),
        filesModified: changes.length,
        skippedLines,
        dryRun: params.dryRun !== false,
        ...(warnings && warnings.length > 0 ? { warnings } : {}),
      },
    };
  }

  static getSchema() {
    return {
      name: "ast_replace",
      description: `Replace code by AST structure (not text). SAFE BY DEFAULT - previews changes unless dryRun: false.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ SAFETY FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛡️ SAFE BY DEFAULT: dryRun: true (preview only, NO files modified)
⚡ TO APPLY CHANGES: Set dryRun: false AFTER reviewing preview
📋 ALWAYS review the diff preview before applying changes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ REQUIRED PARAMETERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• pattern (string) - AST pattern to match (with metavariables)
• replacement (string) - Replacement template (reuses pattern metavariables)
• language (string) - REQUIRED when using 'code' parameter
• paths (array) - Absolute paths to modify (e.g., ["/workspace/src/"])
  OR
• code (string) - Inline code to modify (requires language parameter)

CRITICAL: Pattern and replacement must use SAME metavariable names!
✓ pattern: "var $NAME = $VALUE", replacement: "const $NAME = $VALUE"
✗ pattern: "var $NAME = $VALUE", replacement: "const $X = $Y" (FAILS validation)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 QUICK START (Copy & Modify)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Preview replacement on inline code (SAFE):
   { "pattern": "console.log($ARG)", "replacement": "logger.info($ARG)", "code": "console.log('test');", "language": "javascript" }

2. Preview replacement on files (SAFE):
   { "pattern": "var $NAME = $VALUE", "replacement": "const $NAME = $VALUE", "paths": ["/workspace/src/"], "dryRun": true }

3. Apply changes after reviewing preview:
   { "pattern": "var $NAME = $VALUE", "replacement": "const $NAME = $VALUE", "paths": ["/workspace/src/"], "dryRun": false }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 TROUBLESHOOTING FAILURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ❌ "Metavariable mismatch: $VAR used in replacement but not in pattern"
   → Ensure ALL replacement metavariables exist in pattern
   → Example: pattern="foo($A)" replacement="bar($B)" is INVALID
   → Fix: pattern="foo($A)" replacement="bar($A)"

2. ❌ "Language required for inline code"
   → Add language parameter when using code parameter
   → Example: { pattern: "$P", replacement: "$R", code: "test", language: "javascript" }

3. ❌ "Invalid paths" or "Path must be absolute"
   → Use absolute paths: "/workspace/src/" not "src/"
   → Or omit paths to modify entire workspace

4. ⚠️ Warning: "Metavariable $X in pattern is not used in replacement"
   → Not an error, but may be unintentional
   → Pattern captures $X but replacement omits it
   → Example: pattern="foo($A, $B)" replacement="bar($A)" (drops $B)

5. ✓ No error but changes: [] (empty array)
   → Pattern is valid but matched nothing
   → Test pattern with ast_search first to verify matches
   → Check pattern syntax matches language AST

WHEN TO USE THIS TOOL:
• Automated refactoring (rename functions, change APIs)
• Code modernization (convert old syntax to new syntax)
• Bulk updates across multiple files

WHEN NOT TO USE:
• Simple text replacement → Use sed (faster for plain text)
• Need conditional replacements → Use ast_run_rule with where constraints
• Adding new elements → Manual editing required

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 METAVARIABLE RULES (Critical)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pattern and replacement MUST use same metavariable names:
✓ pattern: "var $NAME = $VALUE", replacement: "const $NAME = $VALUE"
✗ pattern: "var $NAME = $VALUE", replacement: "const $X = $Y"

You can:
• Reorder: pattern="compare($A, $B)", replacement="compare($B, $A)"
• Duplicate: pattern="log($MSG)", replacement="log($MSG, $MSG)"
• Omit: pattern="foo($A, $B)", replacement="bar($A)" (generates warning)

You cannot:
• Use different names: $NAME in pattern, $X in replacement (validation error)
• Use $_ in replacement (anonymous matches can't be referenced)
• Use bare $$$ (must be named: $$$ARGS)

Common Replacement Patterns:
• Simple renaming: "oldFunction($$$ARGS)" → "newFunction($$$ARGS)"
• API migration: "jQuery($SEL).click($H)" → "document.querySelector($SEL).addEventListener('click', $H)"
• Syntax modernization: "var $NAME = $VALUE" → "const $NAME = $VALUE"
• Function to arrow: "function $N($$$P) { $$$B }" → "const $N = ($$$P) => { $$$B }"
• Adding arguments: "logger.log($MSG)" → "logger.log('INFO', $MSG)"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ ADVANCED OPTIONS (Optional)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

File Filtering:
• globs: ["**/*.ts", "!**/*.test.ts"] - Include/exclude patterns
• noIgnore: ["hidden", "dot"] - Search hidden files
• followSymlinks: true - Follow symbolic links (default: false)

Performance:
• threads: 4 - Parallel threads (default: 0 = auto-detect)
• timeoutMs: 60000 - Timeout in ms (default: 60000, max: 300000)
• maxDepth: 15 - Max directory depth from workspace root (1-20, default: 10)

Context:
• context: 3 - Lines around match (0-100)
• before: 2, after: 5 - Asymmetric context (conflicts with context)

Output:
• verbose: false - Simplified output (default: true)
• jsonStyle: "stream" - Format: stream/pretty/compact

Debugging:
• inspect: "summary" - Show scan stats (nothing/summary/entity)
• strictness: "smart" - Match precision (cst/smart/ast/relaxed/signature)
• selector: "field_definition" - Extract specific AST node type (advanced)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 BEST PRACTICES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ALWAYS test with dryRun: true first (default behavior)
2. Review diff preview carefully before setting dryRun: false
3. Test patterns on inline code before applying to files
4. Break large replacements into smaller, focused passes
5. Use ast_search first to verify pattern matches correctly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 CLI FLAG MAPPING (For Reference)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP Parameter → ast-grep CLI Flag:
• pattern → --pattern <value>
• replacement → --rewrite <value>
• language → --lang <normalized> (javascript→js, typescript→ts, python→py)
• code → --stdin (with stdin input)
• paths → positional arguments (absolute paths)
• dryRun: false → --update-all (applies changes)
• dryRun: true → no flag (preview mode, default)
• context → --context <number>
• before/after → --before/--after <number>
• globs → --globs <pattern> (repeatable)
• noIgnore → --no-ignore <option> (repeatable)
• followSymlinks → --follow
• threads → --threads <number>
• inspect → --inspect <granularity>
• strictness → --strictness <level>

Example: { pattern: "var $N = $V", replacement: "const $N = $V", paths: ["/workspace/src/"], dryRun: true }
→ ast-grep run --pattern "var $N = $V" --rewrite "const $N = $V" /workspace/src/

Reference: AST_GREP_DOCUMENTS.md lines 355-814`,

      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            oneOf: [
              {
                type: "string",
                description: "AST pattern to match. Must use same metavariable names as replacement.",
              },
              {
                type: "object",
                properties: {
                  context: {
                    type: "string",
                    description:
                      "Code context for pattern parsing. Example: 'class { $FIELD }' to match field definitions.",
                  },
                  selector: {
                    type: "string",
                    description:
                      "AST kind to extract from context. Example: 'field_definition' to match only field nodes.",
                  },
                  strictness: {
                    type: "string",
                    enum: ["cst", "smart", "ast", "relaxed", "signature"],
                    description: "Pattern-specific strictness override. Takes precedence over top-level strictness.",
                  },
                },
                description:
                  "Pattern object for advanced matching. Use when you need to match specific AST node types within a context.",
              },
            ],
            description:
              "AST pattern (string or object). String form for simple patterns, object form for advanced context-based matching.",
          },
          replacement: {
            type: "string",
            description:
              "Replacement template. Reuses pattern metavariables. Can reorder, duplicate, or omit variables.",
          },
          code: {
            type: "string",
            description:
              "Inline code to modify. Requires language parameter. Use for testing patterns safely.",
          },
          paths: {
            type: "array",
            items: { type: "string" },
            description:
              "ABSOLUTE file/directory paths to modify within workspace (e.g., '/workspace/src/', 'C:/workspace/src/'). Relative paths NOT supported. Omit for entire workspace. Security validated.",
          },
          language: {
            type: "string",
            description:
              "Programming language (js/ts/py/java/rust/go/cpp/kotlin/csharp). Required for inline code, recommended for paths.",
          },
          dryRun: {
            type: "boolean",
            description:
              "If true or omitted, preview only (no files modified). If false, apply changes after review.",
          },
          timeoutMs: {
            type: "number",
            description:
              "Timeout in milliseconds (1000-300000). Default: 60000. Increase for large repos.",
          },
          verbose: {
            type: "boolean",
            description:
              "Control output verbosity. Default: true. When false, returns simplified summary without detailed change information. Useful in CLI to prevent excessive output.",
          },
          strictness: {
            type: "string",
            enum: ["cst", "smart", "ast", "relaxed", "signature"],
            description:
              "Pattern matching strictness (default: 'smart'). Controls how precisely patterns must match AST nodes:\n" +
              "- cst: Match exact CST nodes (most strict, includes all syntax)\n" +
              "- smart: Match AST nodes except trivial tokens like parentheses (default, recommended)\n" +
              "- ast: Match only named AST nodes (ignores unnamed nodes)\n" +
              "- relaxed: Match AST nodes except comments (good for commented code)\n" +
              "- signature: Match AST structure without text content (matches any identifier/literal)\n" +
              "See: https://ast-grep.github.io/advanced/match-algorithm.html",
          },
          context: {
            type: "number",
            description:
              "Lines of context around each match (0-100). Conflicts with before/after parameters. Use for balanced context.",
          },
          before: {
            type: "number",
            description:
              "Lines before each match (0-100). Conflicts with context parameter. Use with after for asymmetric context.",
          },
          after: {
            type: "number",
            description:
              "Lines after each match (0-100). Conflicts with context parameter. Use with before for asymmetric context.",
          },
          globs: {
            type: "array",
            items: { type: "string" },
            description:
              "Include/exclude file patterns (.gitignore-style). Example: ['**/*.ts', '!**/*.test.ts'] includes TypeScript files but excludes tests. Patterns starting with '!' are exclusions.",
          },
          noIgnore: {
            type: "array",
            items: {
              type: "string",
              enum: ["hidden", "dot", "exclude", "global", "parent", "vcs"],
            },
            description:
              "Override .gitignore rules. Options: 'hidden' (search hidden files), 'dot' (search dot files), 'exclude' (ignore .ignore files), 'global' (ignore global gitignore), 'parent' (ignore parent gitignore), 'vcs' (ignore VCS ignore files).",
          },
          followSymlinks: {
            type: "boolean",
            description:
              "Follow symbolic links when traversing directories (default: false). Enable to search through symlinked directories.",
          },
          threads: {
            type: "number",
            description:
              "Number of parallel threads for searching (default: auto-detected CPU cores). Increase for faster searches on multi-core systems, decrease to reduce resource usage.",
          },
          inspect: {
            type: "string",
            enum: ["pattern", "file", "full"],
            description:
              "Show detailed AST information for debugging. Options: 'pattern' (show pattern AST only), 'file' (show file AST only), 'full' (show both pattern and file AST). Useful for understanding why patterns don't match.",
          },
          jsonStyle: {
            type: "string",
            enum: ["pretty", "compact", "stream"],
            description:
              "JSON output format. Options: 'pretty' (formatted with indentation), 'compact' (single-line), 'stream' (one JSON object per line, default). Stream format is most efficient for large result sets.",
          },
          selector: {
            type: "string",
            description:
              "AST node type to extract from pattern context (advanced). Use with pattern object's context field to match specific node types. Example: 'field_definition' to match only field nodes within a class context.",
          },
          maxDepth: {
            type: "number",
            description:
              "Maximum directory depth for path validation (1-20). Default: 10. Controls how deep paths can be from workspace root. Example: maxDepth=5 allows /workspace/a/b/c/d/e/ but rejects /workspace/a/b/c/d/e/f/.",
          },
        },
        required: ["pattern", "replacement"],
        additionalProperties: false,
      },
    };
  }
}
