import { AstGrepBinaryManager } from '../core/binary-manager.js';
import { WorkspaceManager } from '../core/workspace-manager.js';
import { ValidationError, ExecutionError } from '../types/errors.js';
import { PatternValidator, ParameterValidator } from '../utils/validation.js';

/**
 * Direct search tool that calls ast-grep run with minimal overhead
 */
export class SearchTool {
  constructor(
    private binaryManager: AstGrepBinaryManager,
    private workspaceManager: WorkspaceManager
  ) {}

  async execute(params: any): Promise<any> {
    // Validate pattern
    if (!params.pattern || typeof params.pattern !== 'string') {
      throw new ValidationError('Pattern is required and must be a string');
    }

    const patternValidation = PatternValidator.validatePattern(params.pattern, params.language);
    if (!patternValidation.valid) {
      throw new ValidationError(
        `Invalid pattern: ${patternValidation.errors.join('; ')}`,
        { errors: patternValidation.errors }
      );
    }

    // Log warnings if any
    if (patternValidation.warnings && patternValidation.warnings.length > 0) {
      console.error('Pattern warnings:', patternValidation.warnings.join('; '));
    }

    // Validate optional parameters with actionable error messages
    const contextValidation = ParameterValidator.validateContext(params.context);
    if (!contextValidation.valid) {
      throw new ValidationError(contextValidation.errors.join('; '), { errors: contextValidation.errors });
    }

    const maxMatchesValidation = ParameterValidator.validateMaxMatches(params.maxMatches);
    if (!maxMatchesValidation.valid) {
      throw new ValidationError(maxMatchesValidation.errors.join('; '), { errors: maxMatchesValidation.errors });
    }

    const timeoutValidation = ParameterValidator.validateTimeout(params.timeoutMs);
    if (!timeoutValidation.valid) {
      throw new ValidationError(timeoutValidation.errors.join('; '), { errors: timeoutValidation.errors });
    }

    const codeValidation = ParameterValidator.validateCode(params.code);
    if (!codeValidation.valid) {
      throw new ValidationError(codeValidation.errors.join('; '), { errors: codeValidation.errors });
    }

    // Normalize language aliases when provided
    const normalizeLang = (lang: string) => {
      const map: Record<string, string> = {
        javascript: 'js',
        typescript: 'ts',
        jsx: 'jsx',
        tsx: 'tsx',
        python: 'py',
        py: 'py',
        rust: 'rs',
        rs: 'rs',
        golang: 'go',
        go: 'go',
        java: 'java',
        'c++': 'cpp',
        cpp: 'cpp',
        c: 'c',
        kotlin: 'kt',
        kt: 'kt',
      };
      const lower = (lang || '').toLowerCase();
      return map[lower] || lang;
    };

    // Build ast-grep command directly
    const args = ['run', '--pattern', params.pattern.trim()];

    // Add language if provided
    if (params.language) {
      args.push('--lang', normalizeLang(params.language));
    }

    // Always use JSON stream for parsing
    args.push('--json=stream');

    // Add context if requested
    if (params.context && params.context > 0) {
      args.push('--context', params.context.toString());
    }

    // Handle inline code vs file paths
    let executeOptions: any = {
      cwd: this.workspaceManager.getWorkspaceRoot(),
      timeout: params.timeoutMs || 30000
    };

    if (params.code) {
      // Inline code mode
      args.push('--stdin');
      if (!params.language) {
        throw new ValidationError('Language required for inline code');
      }
      executeOptions.stdin = params.code;
    } else {
      // File mode - add paths (default to current directory)
      const inputPaths: string[] = params.paths && Array.isArray(params.paths) && params.paths.length > 0 ? params.paths : ['.'];
      const { valid, resolvedPaths, errors } = this.workspaceManager.validatePaths(inputPaths);
      if (!valid) {
        const errorDetail = errors.length > 0 ? `: ${errors[0]}` : '';
        throw new ValidationError(`Invalid paths${errorDetail}`, { errors });
      }
      // Try to infer language if not provided (based on extension of first path when it is a file)
      if (!params.language && resolvedPaths.length === 1) {
        const first = resolvedPaths[0].toLowerCase();
        const inferred = first.endsWith('.ts') ? 'ts' :
                         first.endsWith('.tsx') ? 'tsx' :
                         first.endsWith('.jsx') ? 'jsx' :
                         first.endsWith('.js') ? 'js' : undefined;
        if (inferred) args.push('--lang', inferred);
      }
      args.push(...resolvedPaths);
    }

    try {
      const result = await this.binaryManager.executeAstGrep(args, executeOptions);
      return this.parseResults(result.stdout, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ExecutionError(`Search failed: ${message}`);
    }
  }

  private parseResults(stdout: string, params: any): any {
    const matches: any[] = [];
    let skippedLines = 0;

    if (!stdout.trim()) {
      return {
        matches,
        skippedLines: 0,
        summary: {
          totalMatches: 0,
          executionTime: 0,
          skippedLines: 0
        }
      };
    }

    // Parse JSONL output
    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const match = JSON.parse(line);
        matches.push({
          file: match.file || '',
          line: (match.range?.start?.line || 0) + 1, // Convert to 1-based
          column: match.range?.start?.column || 0,
          text: match.text || '',
          context: {
            before: match.context?.before || [],
            after: match.context?.after || []
          }
        });
      } catch (e) {
        skippedLines++;
        console.error(`Warning: Skipped malformed JSON line: ${line.substring(0, 100)}...`);
      }
    }

    if (skippedLines > 0) {
      console.error(`Warning: Skipped ${skippedLines} malformed result lines out of ${lines.length} total lines`);
    }

    const maxMatches = params.maxMatches || 100;
    return {
      matches: matches.slice(0, maxMatches),
      skippedLines,
      summary: {
        totalMatches: matches.length,
        truncated: matches.length > maxMatches,
        skippedLines,
        executionTime: 0 // We don't need precise timing
      }
    };
  }

  static getSchema() {
    return {
      name: 'ast_search',
      description: `Search code using AST pattern matching (structural search, not text search).

WHEN TO USE THIS TOOL:
• Quick searches for specific code patterns across files
• Finding all occurrences of a pattern (e.g., all console.log calls)
• Exploring codebase structure without creating rules
• Testing patterns before creating formal rules with ast_run_rule

WHEN TO USE ast_run_rule INSTEAD:
• Need to add constraints on metavariables (e.g., only match specific variable names)
• Want to provide fix suggestions
• Need to categorize findings by severity
• Building reusable rules for code quality checks

PATTERN SYNTAX GUIDE:
• $VAR - matches single AST node (expression, identifier, statement)
• $$$NAME - matches zero or more nodes (MUST be named, never use bare $$$)
• $_ - anonymous single match (when you don't need to reference it)

METAVARIABLE RULES:
1. $_ (anonymous) cannot be referenced in replacements or constraints - use only for matching
2. $NAME must be used as a complete AST node unit and must be named (not bare $)
3. All metavariables must correspond to complete, valid AST nodes in the target language
4. Multi-node $$$NAME must always be named - bare $$$ is rejected

COMMON PATTERNS BY USE CASE:
1. Function calls with specific argument count:
   - Any args: "functionName($$$ARGS)"
   - Exactly 1: "functionName($ARG)"
   - Exactly 2: "functionName($A, $B)"
   - First + rest: "functionName($FIRST, $$$REST)"

2. Function definitions:
   - Any function: "function $NAME($$$PARAMS) { $$$BODY }"
   - Arrow function: "($$$PARAMS) => $BODY"
   - Method: "$OBJ.$METHOD = function($$$PARAMS) { $$$BODY }"

3. Class patterns:
   - Class definition: "class $NAME { $$$MEMBERS }"
   - Class with extends: "class $NAME extends $BASE { $$$MEMBERS }"

4. Control flow:
   - If statement: "if ($COND) { $$$BODY }"
   - Try-catch: "try { $$$TRY } catch ($ERR) { $$$CATCH }"

5. Object/Array operations:
   - Method call: "$OBJ.$METHOD($$$ARGS)"
   - Property access: "$OBJ.$PROP"
   - Destructuring: "const { $$$PROPS } = $OBJ"

PATH VALIDATION:
• All paths are validated to be within the workspace root (prevents directory escape attacks)
• Omitting paths parameter defaults to current workspace root directory (".")
• Paths can be relative (e.g., "src/") or absolute (must be within workspace)
• Invalid paths (outside workspace, non-existent) will fail with ValidationError
• Example: paths: ["src/components", "lib/utils"] searches two directories
• Example: omit paths entirely to search the entire workspace

MODES OF OPERATION:
1. File/Directory Mode (default):
   - Specify paths parameter or omit for current directory
   - Language is optional but recommended for better performance
   - Example: { pattern: "console.log($$$ARGS)", paths: ["src/"], language: "javascript" }

2. Inline Code Mode:
   - Use code parameter to search specific code snippet
   - **IMPORTANT: Language is REQUIRED in this mode - the tool will fail with ValidationError if omitted**
   - Useful for testing patterns before applying to codebase
   - Minimal working example:
     {
       pattern: "console.log($ARG)",
       code: "console.log('test'); foo();",
       language: "javascript"
     }
   - Without language parameter: ValidationError: "Language required for inline code"

JSX/TSX PATTERN MATCHING:
When searching JSX/TSX code, set language to 'jsx' or 'tsx':
• Match elements: "<$COMPONENT $$$ATTRS>" or "<$TAG>$$$CHILDREN</$TAG>"
• Match attribute names: "<div $ATTR={$VALUE}>"
• Match attribute values: "<Button onClick={$HANDLER}>"
• Example: pattern="<$COMPONENT className={$CLASS}>" matches "<Button className={styles.primary}>"
• WARNING: Overly broad patterns like "<$TAG>" can match thousands of elements in large codebases
• RECOMMENDATION: Add constraints or be specific with component/attribute patterns

IMPORTANT LIMITATIONS:
• Patterns match AST structure, not text - "foo" won't match "foobar"
• Metavariables must be complete AST nodes - "$VAR.prop" won't work, use "$OBJ.$PROP"
• Multi-node metavariables ($$$) MUST be named - bare $$$ is rejected
• Pattern syntax is language-specific - JavaScript patterns won't work for Python

RESULT TRUNCATION:
• maxMatches parameter limits the number of returned items (default: 100)
• summary.totalMatches reports the full count of all matches found
• summary.truncated indicates whether results were truncated (true if totalMatches > maxMatches)
• Recommended maxMatches by repo size:
  - Small repos (<1000 files): 100-500
  - Medium repos (1000-10000 files): 50-200
  - Large repos (>10000 files): 20-100
• Higher maxMatches increase memory usage and response size
• Performance impact: Parsing all matches still occurs; truncation only affects data transfer

OUTPUT FORMAT:
• matches: Array of match objects with file, line, column, text, and context
• skippedLines: Top-level count of any malformed output lines that were skipped during parsing
• summary: Statistics object with totalMatches, truncated, skippedLines, executionTime
• skippedLines is available both at top-level and in summary for consistency

MCP→CLI PARAMETER MAPPING:
This tool maps MCP parameters to ast-grep CLI flags as follows:
• pattern → --pattern <value>
• language → --lang <value>
• code → --stdin (with stdin input)
• paths → positional arguments (file/directory paths)
• context → --context <number>
• maxMatches → result slicing (not a CLI flag)
• timeoutMs → process timeout (not a CLI flag)
• Output format: --json=stream

Example CLI equivalent:
  MCP: { pattern: "console.log($ARG)", paths: ["src/"], language: "js", context: 2 }
  CLI: ast-grep run --pattern "console.log($ARG)" --lang js --context 2 --json=stream src/

TIMEOUT GUIDANCE:
• Default timeout: 30000ms (30 seconds)
• Timeouts include file parsing, pattern matching, and I/O operations
• Recommended timeouts by repo size:
  - Small repos (<1000 files): 30000ms (default)
  - Medium repos (1000-10000 files): 60000-120000ms
  - Large repos (>10000 files): 120000-300000ms
• If timeouts occur: narrow paths, specify language, or use more specific patterns
• Maximum allowed: 300000ms (5 minutes)

PERFORMANCE TIPS:
• Specify language when known (faster parsing)
• Use specific paths instead of searching entire workspace
• Set appropriate maxMatches to limit results
• Increase timeout for large codebases`,

      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'AST pattern to search for. Use $VAR for single nodes, $$$NAME for multiple nodes. Examples: "console.log($ARG)", "function $NAME($$$PARAMS) { $$$BODY }", "class $NAME { $$$MEMBERS }"'
          },
          code: {
            type: 'string',
            description: 'Search inline code directly (requires language parameter). Recommended for testing patterns before applying to codebase.'
          },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File or directory paths to search. Defaults to current directory. Examples: ["src/index.js"], ["src/", "tests/"]'
          },
          language: {
            type: 'string',
            description: 'Programming language (required for inline code). Supported: javascript/js, typescript/ts, python/py, java, rust, go, cpp, etc.'
          },
          context: {
            type: 'number',
            default: 3,
            description: 'Number of lines to show before and after each match (0-100)'
          },
          maxMatches: {
            type: 'number',
            default: 100,
            description: 'Maximum number of matches to return (1-10000)'
          },
          timeoutMs: {
            type: 'number',
            default: 30000,
            description: 'Search timeout in milliseconds (1000-300000)'
          }
        },
        required: ['pattern'],
        additionalProperties: false
      }
    };
  }
}