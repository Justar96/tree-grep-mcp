import * as path from "path";
import { AstGrepBinaryManager } from "../core/binary-manager.js";
import { WorkspaceManager } from "../core/workspace-manager.js";
import { ValidationError, ExecutionError } from "../types/errors.js";
import { PatternValidator, ParameterValidator, PathValidator } from "../utils/validation.js";

interface SearchParams {
  pattern: string;
  language?: string;
  paths?: string[];
  code?: string;
  context?: number;
  maxMatches?: number;
  timeoutMs?: number;
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

    // Validate pattern
    if (!params.pattern || typeof params.pattern !== "string") {
      throw new ValidationError("Pattern is required and must be a string");
    }

    const patternValidation = PatternValidator.validatePattern(
      params.pattern,
      typeof params.language === "string" ? params.language : undefined
    );
    if (!patternValidation.valid) {
      throw new ValidationError(`Invalid pattern: ${patternValidation.errors.join("; ")}`, {
        errors: patternValidation.errors,
      });
    }

    // Log warnings if any - log each warning individually for better test assertions
    if (patternValidation.warnings && patternValidation.warnings.length > 0) {
      for (const warning of patternValidation.warnings) {
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
    const args = ["run", "--pattern", params.pattern.trim()];

    // Add language if provided
    if (params.language) {
      args.push("--lang", normalizeLang(params.language));
    }

    // Always use JSON stream for parsing
    args.push("--json=stream");

    // Add context if requested
    if (params.context && params.context > 0) {
      args.push("--context", params.context.toString());
    }

    // Handle inline code vs file paths
    const executeOptions: {
      cwd: string;
      timeout: number;
      stdin?: string;
    } = {
      cwd: this.workspaceManager.getWorkspaceRoot(),
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
        const workspaceRoot = this.workspaceManager.getWorkspaceRoot();
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
      const { valid, errors } = this.workspaceManager.validatePaths(normalizedPaths);
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
      return this.parseResults(result.stdout, params);
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

  private parseResults(stdout: string, params: SearchParams): SearchResult {
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
      description: `Structural code search using AST pattern matching. Searches code by syntax tree structure, not text matching. Returns file locations, line numbers, and matched code with context.

QUICK START:
Search JavaScript files for console.log calls:
{ "pattern": "console.log($ARG)", "paths": ["/workspace/src/"], "language": "javascript" }

Search inline code (language REQUIRED):
{ "pattern": "console.log($ARG)", "code": "console.log('test');", "language": "javascript" }

WHEN TO USE:
• Find all occurrences of a code pattern across files
• Explore codebase structure (e.g., all function definitions, class declarations)
• Test patterns quickly before building formal rules
• Search specific code snippets for testing

WHEN NOT TO USE:
• Need metavariable constraints (e.g., $VAR must match "foo") → Use ast_run_rule with constraints
• Want to provide fix suggestions → Use ast_run_rule with fix parameter
• Need severity levels or categorization → Use ast_run_rule
• Text-based search (grep strings) → Use grep/ripgrep tools instead
• Simple string matching without code structure → Use grep/ripgrep (faster and more appropriate)
• Control flow analysis (complex if/with/try blocks) → Limited support, may require structural rules
• Regex-only matching → ast-grep requires AST patterns, use grep with regex instead

PATTERN SYNTAX:
• $VAR - Single AST node (expression, identifier, statement)
• $$$NAME - Multiple nodes, MUST be named (bare $$$ rejected)
• $_ - Anonymous match (use when you don't need to reference it)

Metavariable rules:
1. Must be complete AST nodes: Use "$OBJ.$PROP", not "$VAR.prop"
2. Multi-node must be named: "$$$ARGS" not "$$$"
3. Language-specific: JavaScript patterns won't work in Python
4. Match structure, not text: "foo" won't match "foobar"

COMMON PATTERNS:

1. Function calls:
   Any arguments: "functionName($$$ARGS)"
   Exactly one: "functionName($ARG)"
   Exactly two: "functionName($A, $B)"
   First + rest: "functionName($FIRST, $$$REST)"

2. Function definitions:
   Any function: "function $NAME($$$PARAMS) { $$$BODY }"
   Arrow function: "($$$PARAMS) => $BODY"
   Method: "$OBJ.$METHOD = function($$$PARAMS) { $$$BODY }"

3. Class patterns:
   Basic: "class $NAME { $$$MEMBERS }"
   With extends: "class $NAME extends $BASE { $$$MEMBERS }"

4. Control flow:
   If statement: "if ($COND) { $$$BODY }"
   Try-catch: "try { $$$TRY } catch ($ERR) { $$$CATCH }"

5. Object operations:
   Method call: "$OBJ.$METHOD($$$ARGS)"
   Property access: "$OBJ.$PROP"
   Destructuring: "const { $$$PROPS } = $OBJ"

JSX/TSX (set language to 'jsx' or 'tsx'):
   Element: "<$COMPONENT $$$ATTRS>" or "<$TAG>$$$CHILDREN</$TAG>"
   Attribute: "<div $ATTR={$VALUE}>"
   Event handler: "<Button onClick={$HANDLER}>"
   WARNING: Broad patterns like "<$TAG>" match thousands of elements - be specific

PATTERN LIBRARY:
For more pattern examples, see: https://github.com/justar96/tree-grep-mcp/blob/main/PATTERN_LIBRARY.md

ERROR RECOVERY:

If search fails, check these common issues:

1. "Language required for inline code"
   → Add language parameter when using code parameter
   → Example: { pattern: "$P", code: "test", language: "javascript" }

2. "Invalid paths"
   → Use absolute paths like '/workspace/src/' or 'C:/workspace/src/'
   → Relative paths are not supported (will be rejected with validation error)
   → Paths validated against workspace root for security
   → Omit paths to search entire workspace (defaults to current directory)

3. "Invalid pattern: Use named multi-node metavariables like $$BODY instead of bare $$"
   → Replace "$$$" with "$$$NAME"
   → All multi-node metavariables must have names

4. Timeout errors
   → Increase timeoutMs (default: 30000ms)
   → Narrow paths to specific directories
   → Specify language for faster parsing
   → Recommended by repo size:
     Small (<1K files): 30000ms (default)
     Medium (1K-10K files): 60000-120000ms
     Large (>10K files): 120000-300000ms (max: 300000ms)

5. Empty results (no error, but matches array is empty)
   → Pattern is valid but nothing matched (not an error)
   → Try broader pattern or check pattern syntax matches language AST
   → Verify paths contain files of specified language

6. summary.truncated: true
   → Increase maxMatches parameter (default: 100, max: 10000)
   → Or narrow search scope to reduce matches
   → summary.totalMatches shows complete count even when truncated

BEST PRACTICES:
• Use for structural code patterns, not plain text searches
• Start with simple patterns and add complexity incrementally
• Test patterns on inline code before scanning large codebases
• Specify language for faster parsing and better results
• Use specific paths to reduce search scope and improve performance
• For relational rules (inside/has), use stopBy: end to search thoroughly

LIMITATIONS:
• Paths must be within workspace root (security constraint)
• Path depth limited to 6 levels from workspace root (use parent directories for deep paths)
• Pattern syntax is language-specific (JS patterns won't work in Python)
• Metavariables must be complete AST nodes (not partial identifiers)
• Multi-node metavariables must be named ($$$ARGS, not $$$)
• Control flow patterns (if/with/try blocks) have limited support
• Multi-line patterns with newlines may not match - prefer single-line or structural rules
• Not suitable for simple text matching - use grep/ripgrep instead
• Indentation-sensitive for multi-line patterns
• High skippedLines in output indicates ast-grep format changes (report issue)

OPERATION MODES:

File/Directory Mode (default):
• Specify paths or omit for current directory
• Language optional but recommended for performance
• Example: { pattern: "console.log($$$ARGS)", paths: ["/workspace/src/"], language: "javascript" }

Inline Code Mode:
• Use code parameter for testing patterns on snippets
• Language REQUIRED (throws ValidationError if omitted)
• Example: { pattern: "console.log($ARG)", code: "console.log('test');", language: "javascript" }

OUTPUT STRUCTURE:
• matches: Array of { file, line, column, text, context: { before: [], after: [] } }
• summary: { totalMatches, truncated, skippedLines, executionTime }
• skippedLines: Count of malformed output lines (should be 0)

PERFORMANCE:
• Specify language for faster parsing
• Use specific paths vs entire workspace
• Adjust maxMatches by repo size:
  Small (<1K files): 100-500
  Medium (1K-10K): 50-200
  Large (>10K): 20-100

REFERENCE - MCP to ast-grep CLI Mapping:
pattern → --pattern <value>
language → --lang <value>
code → --stdin (with stdin input)
paths → positional arguments
context → --context <number>
maxMatches → result slicing (not a CLI flag)
timeoutMs → process timeout (not a CLI flag)

Example: { pattern: "console.log($ARG)", paths: ["/workspace/src/"], language: "js", context: 2 }
CLI: ast-grep run --pattern "console.log($ARG)" --lang js --context 2 --json=stream /workspace/src/`,

      inputSchema: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description:
              "AST pattern with metavariables ($VAR, $$$NAME, $_). Must be valid syntax for target language.",
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
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    };
  }
}
