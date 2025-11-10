import * as path from "path";
import { AstGrepBinaryManager } from "../core/binary-manager.js";
import { WorkspaceManager } from "../core/workspace-manager.js";
import { ValidationError, ExecutionError } from "../types/errors.js";
import { PatternValidator, ParameterValidator, PathValidator } from "../utils/validation.js";
import type { InspectGranularity, JsonStyle, NoIgnoreOption } from "../types/cli.js";

interface PatternObject {
  context?: string;
  selector?: string;
  strictness?: "cst" | "smart" | "ast" | "relaxed" | "signature";
}

interface SearchParams {
  pattern: string | PatternObject;
  language?: string;
  paths?: string[];
  code?: string;
  context?: number;
  before?: number;
  after?: number;
  maxMatches?: number;
  timeoutMs?: number;
  verbose?: boolean;
  strictness?: "cst" | "smart" | "ast" | "relaxed" | "signature";
  globs?: string[];
  noIgnore?: NoIgnoreOption[];
  followSymlinks?: boolean;
  threads?: number;
  inspect?: InspectGranularity;
  jsonStyle?: JsonStyle;
  selector?: string;
  maxDepth?: number;
}

interface MatchEntry {
  file: string;
  line: number;
  column: number;
  text: string;
  context?: {
    before: string[];
    after: string[];
  };
}

interface SearchResult {
  matches: MatchEntry[];
  skippedLines: number;
  totalMatches?: number;
  filesMatched?: number;
  summary: {
    totalMatches: number;
    truncated: boolean;
    skippedLines: number;
    executionTime: number;
  };
}

/**
 * Direct search tool that calls ast-grep run with minimal overhead
 */
export class SearchTool {
  constructor(
    private binaryManager: AstGrepBinaryManager,
    private workspaceManager: WorkspaceManager
  ) {}

  async execute(paramsRaw: Record<string, unknown>): Promise<SearchResult> {
    // Runtime parameter validation with type narrowing
    const params = paramsRaw as unknown as SearchParams;

    // Validate pattern (string or object)
    if (!params.pattern) {
      throw new ValidationError("Pattern is required");
    }

    // Determine if pattern is string or object, and extract components
    let patternString: string;
    let localPatternSelector: string | undefined;
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
      localPatternSelector = patternObj.selector;
      patternStrictness = patternObj.strictness;
    } else {
      throw new ValidationError("Pattern must be a string or pattern object");
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

    const maxMatchesValidation = ParameterValidator.validateMaxMatches(params.maxMatches);
    if (!maxMatchesValidation.valid) {
      throw new ValidationError(maxMatchesValidation.errors.join("; "), {
        errors: maxMatchesValidation.errors,
      });
    }

    const timeoutValidation = ParameterValidator.validateTimeout(params.timeoutMs);
    if (!timeoutValidation.valid) {
      throw new ValidationError(timeoutValidation.errors.join("; "), {
        errors: timeoutValidation.errors,
      });
    }

    const codeValidation = ParameterValidator.validateCode(params.code);
    if (!codeValidation.valid) {
      throw new ValidationError(codeValidation.errors.join("; "), {
        errors: codeValidation.errors,
      });
    }

    const verboseValidation = ParameterValidator.validateVerbose(params.verbose);
    if (!verboseValidation.valid) {
      throw new ValidationError(verboseValidation.errors.join("; "), {
        errors: verboseValidation.errors,
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

    const jsonStyleValidation = ParameterValidator.validateJsonStyle(params.jsonStyle);
    if (!jsonStyleValidation.valid) {
      throw new ValidationError(jsonStyleValidation.errors.join("; "), {
        errors: jsonStyleValidation.errors,
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

    // Create workspace manager with custom maxDepth if provided
    const workspaceManager = params.maxDepth !== undefined
      ? new WorkspaceManager({
          explicitRoot: this.workspaceManager.getWorkspaceRoot(),
          maxDepth: params.maxDepth
        })
      : this.workspaceManager;

    // Normalize language aliases when provided
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
    const args = ["run", "--pattern", patternString.trim()];

    // Add language if provided
    if (params.language) {
      args.push("--lang", normalizeLang(params.language));
    }

    // Add selector if provided (pattern object selector takes precedence over top-level selector)
    const effectiveSelector = localPatternSelector ?? params.selector;
    if (effectiveSelector) {
      args.push("--selector", effectiveSelector);
    }

    // Add strictness (from pattern object or top-level param)
    // Pattern object strictness takes precedence over top-level param
    const effectiveStrictness = patternStrictness || params.strictness;
    if (effectiveStrictness) {
      args.push("--strictness", effectiveStrictness);
    }

    // Always request JSON output (style defaults to stream)
    const jsonStyle = params.jsonStyle || "stream";
    args.push(`--json=${jsonStyle}`);

    // Add context if requested
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

    // Handle inline code vs file paths
    const executeOptions: {
      cwd: string;
      timeout: number;
      stdin?: string;
    } = {
      cwd: workspaceManager.getWorkspaceRoot(),
      timeout: params.timeoutMs || 30000,
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
            `Cannot scan from home directory without explicit paths. Please provide absolute paths to specific directories.`
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
            `Cannot scan from user directory without explicit paths. Please provide absolute paths to specific directories.`
          );
        }

        console.error(
          `Warning: No paths provided, scanning entire workspace from root: ${workspaceRoot}`
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

      // Try to infer language if not provided (based on extension of first path when it is a file)
      if (!params.language && normalizedPaths.length === 1) {
        const first = normalizedPaths[0].toLowerCase();
        const inferred = first.endsWith(".ts")
          ? "ts"
          : first.endsWith(".tsx")
            ? "tsx"
            : first.endsWith(".jsx")
              ? "jsx"
              : first.endsWith(".js")
                ? "js"
                : undefined;
        if (inferred) args.push("--lang", inferred);
      }

      // Pass normalized paths to ast-grep (not absolute resolved paths)
      args.push(...normalizedPaths);

      // Log paths being scanned for debugging
      if (normalizedPaths.length <= 3) {
        console.error(`Scanning paths: ${normalizedPaths.join(", ")}`);
      } else {
        console.error(`Scanning ${normalizedPaths.length} paths`);
      }
    }

    try {
      const result = await this.binaryManager.executeAstGrep(args, executeOptions);
      return this.parseResults(result.stdout, params, isVerbose);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ExecutionError(`Search failed: ${message}`);
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
    params: SearchParams,
    isVerbose: boolean = true
  ): SearchResult {
    const matches: MatchEntry[] = [];
    let skippedLines = 0;

    if (!stdout.trim()) {
      return {
        matches,
        skippedLines: 0,
        summary: {
          totalMatches: 0,
          truncated: false,
          skippedLines: 0,
          executionTime: 0,
        },
      };
    }

    // Parse JSONL output
    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const match = JSON.parse(line) as {
          file?: string;
          range?: { start?: { line?: number; column?: number } };
          text?: string;
          context?: { before?: string[]; after?: string[] };
        };
        matches.push({
          file: this.resolveFilePath(match.file || ""),
          line: (match.range?.start?.line || 0) + 1, // Convert to 1-based
          column: match.range?.start?.column || 0,
          text: match.text || "",
          context: {
            before: match.context?.before || [],
            after: match.context?.after || [],
          },
        });
      } catch {
        skippedLines++;
        console.error(`Warning: Skipped malformed JSON line: ${line.substring(0, 100)}...`);
      }
    }

    if (skippedLines > 0) {
      console.error(
        `Warning: Skipped ${skippedLines} malformed result lines out of ${lines.length} total lines`
      );
    }

    const maxMatches = params.maxMatches || 100;

    // If not verbose, return only a simplified result with summary
    if (!isVerbose) {
      return {
        matches: [], // Empty matches array for non-verbose mode
        skippedLines,
        summary: {
          totalMatches: matches.length,
          truncated: matches.length > maxMatches,
          skippedLines,
          executionTime: 0, // We don't need precise timing
        },
      };
    }

    return {
      matches: matches.slice(0, maxMatches),
      skippedLines,
      summary: {
        totalMatches: matches.length,
        truncated: matches.length > maxMatches,
        skippedLines,
        executionTime: 0, // We don't need precise timing
      },
    };
  }

  static getSchema() {
    return {
      name: "ast_search",
      description: `Search code by AST structure (not text). Returns file locations, line numbers, and matched code.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ REQUIRED PARAMETERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• pattern (string) - AST pattern with metavariables ($VAR, $$$ARGS, $_)
• language (string) - REQUIRED when using 'code' parameter (js/ts/py/rust/go/java/cpp)
• paths (array) - Absolute paths to search (e.g., ["/workspace/src/"])
  OR
• code (string) - Inline code to search (requires language parameter)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 QUICK START (Copy & Modify)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Search files for function calls:
   { "pattern": "console.log($ARG)", "paths": ["/workspace/src/"], "language": "javascript" }

2. Test pattern on inline code (language REQUIRED):
   { "pattern": "console.log($ARG)", "code": "console.log('test');", "language": "javascript" }

3. Search with file filtering:
   { "pattern": "console.log($ARG)", "paths": ["/workspace/src/"], "globs": ["**/*.ts", "!**/*.test.ts"], "language": "typescript" }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 TROUBLESHOOTING EMPTY RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Got empty matches array? Check these IN ORDER:

1. ❌ "Language required for inline code"
   → Add language parameter when using code parameter
   → Example: { pattern: "$P", code: "test", language: "javascript" }

2. ❌ "Invalid paths" or "Path must be absolute"
   → Use absolute paths: "/workspace/src/" not "src/"
   → Or omit paths entirely to search entire workspace

3. ✓ No error but matches: [] (empty array)
   → Pattern is valid but nothing matched
   → Try pattern on inline code first to verify syntax
   → Check pattern matches language AST (JS patterns won't match Python)
   → Use inspect: "summary" to see what files were scanned

4. ⏱️ Timeout errors
   → Increase timeoutMs (default: 30000ms, max: 300000ms)
   → Narrow paths to specific directories
   → Use globs to filter files

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 PATTERN SYNTAX (Metavariables)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

$VAR - Single AST node (expression, identifier, statement)
  Examples: $ARG, $NAME, $VALUE, $OBJ, $PROP
  Usage: "console.log($ARG)" matches console.log(anything)

$$$NAME - Multiple nodes (MUST be named, bare $$$ rejected)
  Examples: $$$ARGS, $$$PARAMS, $$$BODY
  Usage: "foo($$$ARGS)" matches foo(), foo(1), foo(1,2,3)

$_ - Anonymous match (when you don't need to reference it)
  Usage: "foo($_, $_, $_)" matches exactly 3 arguments

Common Patterns:
• Function calls: "functionName($$$ARGS)"
• Method calls: "$OBJ.$METHOD($$$ARGS)"
• Function definitions: "function $NAME($$$PARAMS) { $$$BODY }"
• Control flow: "if ($COND) { $$$BODY }"

WHEN TO USE THIS TOOL:
• Find all occurrences of a code pattern across files
• Explore codebase structure (function definitions, class declarations)
• Test patterns quickly before building formal rules

WHEN NOT TO USE:
• Need metavariable constraints → Use ast_run_rule with where constraints
• Want fix suggestions → Use ast_run_rule with fix parameter
• Text-based search → Use grep/ripgrep (faster for plain text)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ ADVANCED OPTIONS (Optional)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

File Filtering:
• globs: ["**/*.ts", "!**/*.test.ts"] - Include/exclude patterns (.gitignore style)
• noIgnore: ["hidden", "dot"] - Search hidden files (bypasses .gitignore)
• followSymlinks: true - Follow symbolic links (default: false)

Performance:
• threads: 4 - Parallel threads (default: 0 = auto-detect)
• timeoutMs: 60000 - Timeout in ms (default: 30000, max: 300000)
• maxDepth: 15 - Max directory depth from workspace root (1-20, default: 10)

Context:
• context: 3 - Lines around match (0-100, default: 0)
• before: 2, after: 5 - Asymmetric context (conflicts with context)

Output:
• maxMatches: 100 - Max results (default: 100, max: 10000)
• jsonStyle: "stream" - Format: stream/pretty/compact (default: stream)
• verbose: false - Simplified output (default: true)

Debugging:
• inspect: "summary" - Show scan stats (nothing/summary/entity)
• strictness: "smart" - Match precision (cst/smart/ast/relaxed/signature)
• selector: "function_declaration" - Extract specific AST node type

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 PATTERN SYNTAX REFERENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Metavariable Rules:
1. Must be complete AST nodes: "$OBJ.$PROP" not "$VAR.prop"
2. Multi-node must be named: "$$$ARGS" not "$$$"
3. Language-specific: JS patterns won't work in Python
4. Match structure, not text: "foo" won't match "foobar"
5. Case-sensitive: $VAR and $var are different

More Examples:
• JSX elements: "<$COMPONENT $$$ATTRS>" (use language: 'jsx' or 'tsx')
• Arrow functions: "($$$PARAMS) => $BODY"
• Destructuring: "const { $$$PROPS } = $OBJ"
• Async/await: "async function $NAME($$$PARAMS) { $$$BODY }"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 CLI FLAG MAPPING (For Reference)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP Parameter → ast-grep CLI Flag:
• pattern → --pattern <value>
• language → --lang <normalized> (javascript→js, typescript→ts, python→py)
• code → --stdin (with stdin input)
• paths → positional arguments (default: ".")
• context → --context <number>
• before/after → --before/--after <number>
• globs → --globs <pattern> (repeatable)
• noIgnore → --no-ignore <type> (repeatable)
• followSymlinks → --follow
• threads → --threads <number>
• inspect → --inspect <level>
• jsonStyle → --json=<style>
• strictness → --strictness <value>
• selector → --selector <kind>

Example: { pattern: "console.log($ARG)", paths: ["/workspace/src/"], language: "js", context: 2 }
→ ast-grep run --pattern "console.log($ARG)" --lang js --context 2 --json=stream /workspace/src/

Reference: AST_GREP_DOCUMENTS.md lines 355-571`,

      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            oneOf: [
              {
                type: "string",
                description:
                  "AST pattern with metavariables ($VAR, $$$NAME, $_). Must be valid syntax for target language.",
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
                      "AST kind to extract from context. Example: 'field_definition' to match only field nodes. See: https://ast-grep.github.io/reference/languages.html",
                  },
                  strictness: {
                    type: "string",
                    enum: ["cst", "smart", "ast", "relaxed", "signature"],
                    description: "Pattern-specific strictness override. Takes precedence over top-level strictness parameter.",
                  },
                },
                description:
                  "Pattern object for advanced matching with context and selector. Use when you need to match specific AST node types within a context. Example: { context: 'class { $F }', selector: 'field_definition' }",
              },
            ],
            description:
              "AST pattern (string or object). String form for simple patterns, object form for advanced context-based matching with selector.",
          },
          code: {
            type: "string",
            description:
              "Inline code to search. Requires language parameter. Use for testing patterns.",
          },
          paths: {
            type: "array",
            items: { type: "string" },
            description:
              "ABSOLUTE file/directory paths within workspace (e.g., '/workspace/src/', 'C:/workspace/src/'). Relative paths NOT supported. Omit to search entire workspace. Security validated.",
          },
          language: {
            type: "string",
            description:
              "Programming language (js/ts/py/java/rust/go/cpp/kotlin/csharp). Required for inline code, recommended for paths.",
          },
          context: {
            type: "number",
            description:
              "Context lines around matches (0-100). Default: 3. Higher values increase output size.",
          },
          maxMatches: {
            type: "number",
            description:
              "Maximum matches to return (1-10000). Default: 100. Check summary.truncated if limited.",
          },
          timeoutMs: {
            type: "number",
            description:
              "Timeout in milliseconds (1000-300000). Default: 30000. Increase for large repos.",
          },
          verbose: {
            type: "boolean",
            description:
              "Control output verbosity. Default: true. When false, returns simplified summary without detailed match information. Useful in CLI to prevent excessive output.",
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
          before: {
            type: "number",
            description:
              "Lines before each match (0-100). Conflicts with context parameter. Use context for symmetric context or before/after for asymmetric.",
          },
          after: {
            type: "number",
            description:
              "Lines after each match (0-100). Conflicts with context parameter. Use context for symmetric context or before/after for asymmetric.",
          },
          globs: {
            type: "array",
            items: { type: "string" },
            description:
              "Include/exclude file patterns (.gitignore-style). Example: ['src/**/*.ts', '!dist/**', '!**/*.test.ts']. Use ! prefix to exclude.",
          },
          noIgnore: {
            type: "array",
            items: {
              type: "string",
              enum: ["hidden", "dot", "exclude", "global", "parent", "vcs"],
            },
            description:
              "Bypass ignore files. Values: 'hidden', 'dot', 'exclude', 'global', 'parent', 'vcs'. Example: ['hidden', 'dot'] to search hidden files.",
          },
          followSymlinks: {
            type: "boolean",
            description: "Follow symbolic links during traversal. Default: false.",
          },
          threads: {
            type: "number",
            description:
              "Parallel processing thread count (0-64). Default: 0 (auto-detect based on CPU cores).",
          },
          inspect: {
            type: "string",
            enum: ["nothing", "summary", "entity"],
            description:
              "Debug file/rule discovery. Values: 'nothing' (default), 'summary', 'entity'. Logs to stderr.",
          },
          jsonStyle: {
            type: "string",
            enum: ["stream", "pretty", "compact"],
            description:
              "JSON output format. Values: 'stream' (default, JSONL), 'pretty', 'compact'.",
          },
          selector: {
            type: "string",
            description:
              "AST kind to match. Example: 'function_declaration'. See: https://ast-grep.github.io/reference/languages.html",
          },
          maxDepth: {
            type: "number",
            description:
              "Maximum directory depth for path validation (1-20). Default: 10. Controls how deep paths can be from workspace root. Example: maxDepth=5 allows /workspace/a/b/c/d/e/ but rejects /workspace/a/b/c/d/e/f/.",
          },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    };
  }
}
