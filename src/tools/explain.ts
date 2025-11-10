import { AstGrepBinaryManager } from "../core/binary-manager.js";
import { WorkspaceManager } from "../core/workspace-manager.js";
import { ValidationError, ExecutionError } from "../types/errors.js";
import { PatternValidator, ParameterValidator } from "../utils/validation.js";

interface PatternObject {
  context?: string;
  selector?: string;
  strictness?: "cst" | "smart" | "ast" | "relaxed" | "signature";
}

interface ExplainParams {
  pattern: string | PatternObject;
  code: string;
  language: string;
  showAst?: boolean;
  timeoutMs?: number;
  verbose?: boolean;
  strictness?: "cst" | "smart" | "ast" | "relaxed" | "signature";
}

interface MetavariableCapture {
  value: string;
  line: number;
  column: number;
}

interface ExplainResult {
  matched: boolean;
  metavariables: Record<string, MetavariableCapture>;
  astNodes: string[];
  suggestions: string[];
  ast?: string;
}

/**
 * Pattern explanation tool that executes ast-grep to show metavariable captures and AST node kinds
 */
export class ExplainTool {
  constructor(
    private binaryManager: AstGrepBinaryManager,
    private workspaceManager: WorkspaceManager
  ) {}

  async execute(paramsRaw: Record<string, unknown>): Promise<ExplainResult> {
    // Runtime parameter validation with type narrowing
    const params = paramsRaw as unknown as ExplainParams;

    // Validate code parameter
    if (!params.code || typeof params.code !== "string") {
      throw new ValidationError("Code is required and must be a string");
    }

    if (!params.language || typeof params.language !== "string") {
      throw new ValidationError("Language is required and must be a string");
    }

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

      const patternValidation = PatternValidator.validatePattern(patternString, params.language);
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

    // Validate code size
    const codeValidation = ParameterValidator.validateCode(params.code);
    if (!codeValidation.valid) {
      throw new ValidationError(codeValidation.errors.join("; "), {
        errors: codeValidation.errors,
      });
    }

    // Validate timeout if provided
    const timeoutValidation = ParameterValidator.validateTimeout(params.timeoutMs);
    if (!timeoutValidation.valid) {
      throw new ValidationError(timeoutValidation.errors.join("; "), {
        errors: timeoutValidation.errors,
      });
    }

    // Validate verbose if provided
    const verboseValidation = ParameterValidator.validateVerbose(params.verbose);
    if (!verboseValidation.valid) {
      throw new ValidationError(verboseValidation.errors.join("; "), {
        errors: verboseValidation.errors,
      });
    }

    // Set default verbose value to true
    const isVerbose = params.verbose !== false;

    // Normalize language aliases
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

    const normalizedLang = normalizeLang(params.language);

    // Build CLI command
    const args = [
      "run",
      "--pattern",
      patternString.trim(),
      "--lang",
      normalizedLang,
    ];

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

    args.push("--json=stream", "--stdin");

    const executeOptions = {
      cwd: this.workspaceManager.getWorkspaceRoot(),
      timeout: params.timeoutMs || 10000,
      stdin: params.code,
    };

    try {
      const result = await this.binaryManager.executeAstGrep(args, executeOptions);

      // Get AST debug output if requested
      let astDebugOutput: string | undefined;
      if (params.showAst) {
        const astArgs = [
          "run",
          "--pattern",
          patternString.trim(),
          "--lang",
          normalizedLang,
        ];

        // Add selector if from pattern object
        if (selector) {
          astArgs.push("--selector", selector);
        }

        // Add strictness to AST debug query too (from pattern object or top-level param)
        if (effectiveStrictness) {
          astArgs.push("--strictness", effectiveStrictness);
        }

        astArgs.push("--debug-query=ast", "--stdin");

        const astResult = await this.binaryManager.executeAstGrep(astArgs, executeOptions);
        astDebugOutput = astResult.stdout || astResult.stderr;
      }

      return this.parseExplainOutput(
        result.stdout,
        params.showAst || false,
        astDebugOutput,
        isVerbose
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ExecutionError(`Pattern explanation failed: ${message}`);
    }
  }

  private parseExplainOutput(
    stdout: string,
    showAst: boolean,
    astDebugOutput?: string,
    isVerbose: boolean = true
  ): ExplainResult {
    const metavariables: Record<string, MetavariableCapture> = {};
    const astNodes = new Set<string>();
    let matched = false;
    let skippedLines = 0;

    if (!stdout.trim()) {
      return {
        matched: false,
        metavariables: {},
        astNodes: [],
        suggestions: this.generateSuggestions(false),
      };
    }

    // Parse JSON stream output
    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line) as {
          text?: string;
          metaVariables?: {
            single?: Record<
              string,
              {
                text?: string;
                range?: {
                  start?: { line?: number; column?: number };
                };
              }
            >;
            multi?: Record<
              string,
              Array<{
                text?: string;
                range?: {
                  start?: { line?: number; column?: number };
                };
              }>
            >;
          };
          kind?: string;
        };

        // If we have a text field, the pattern matched
        if (json.text) {
          matched = true;
        }

        // Extract single metavariables
        if (json.metaVariables?.single) {
          for (const [name, capture] of Object.entries(json.metaVariables.single)) {
            metavariables[name] = {
              value: capture.text || "",
              line: (capture.range?.start?.line || 0) + 1, // Convert to 1-based
              column: capture.range?.start?.column || 0,
            };
          }
        }

        // Extract multi metavariables (concatenate all matched nodes)
        if (json.metaVariables?.multi) {
          for (const [name, captures] of Object.entries(json.metaVariables.multi)) {
            const combinedText = captures.map((c) => c.text || "").join(" ");
            const firstCapture = captures[0];
            metavariables[name] = {
              value: combinedText,
              line: (firstCapture?.range?.start?.line || 0) + 1,
              column: firstCapture?.range?.start?.column || 0,
            };
          }
        }

        // Extract AST node kinds (tree-sitter node type)
        if (json.kind) {
          astNodes.add(json.kind);
        }
      } catch {
        // Skip malformed JSON lines and count them
        skippedLines++;
        console.error(`Warning: Skipped malformed JSON line: ${line.substring(0, 100)}...`);
        continue;
      }
    }

    if (skippedLines > 0) {
      console.error(
        `Warning: Skipped ${skippedLines} malformed result lines out of ${lines.length} total lines`
      );
    }

    // If not verbose, return only a simplified result
    if (!isVerbose) {
      const simplifiedResult: ExplainResult = {
        matched,
        metavariables: {}, // Empty metavariables for non-verbose mode
        astNodes: Array.from(astNodes),
        suggestions: this.generateSuggestions(matched),
      };

      // Add AST field if requested
      if (showAst && astDebugOutput) {
        simplifiedResult.ast = astDebugOutput;
      }

      return simplifiedResult;
    }

    const result: ExplainResult = {
      matched,
      metavariables,
      astNodes: Array.from(astNodes),
      suggestions: this.generateSuggestions(matched),
    };

    // Add AST field if requested
    if (showAst && astDebugOutput) {
      result.ast = astDebugOutput;
    }

    return result;
  }

  private generateSuggestions(matched: boolean): string[] {
    if (matched) {
      return [];
    }

    return [
      "Pattern did not match. Try:",
      "- Verify pattern syntax matches language AST structure",
      "- Check metavariable names are UPPER_CASE",
      "- Use $NAME for multi-node matches (not bare $)",
      "- Test with simpler pattern first",
      "- Use ast_search to verify pattern works on files",
    ];
  }

  static getSchema() {
    return {
      name: "ast_explain_pattern",
      description: `Debug and understand AST patterns by showing metavariable captures, AST node kinds, and helpful suggestions. Perfect for pattern development and troubleshooting.

QUICK START:
Explain a simple pattern:
{ "pattern": "console.log($ARG)", "code": "console.log('hello');", "language": "javascript" }

Explain a function pattern:
{ "pattern": "function $NAME($$$PARAMS) { $$$BODY }", "code": "function test(a, b) { return a + b; }", "language": "javascript" }

WHEN TO USE:
• Developing new AST patterns - see what metavariables capture
• Debugging pattern match failures - get actionable suggestions
• Learning AST structure - see node kinds for your code
• Understanding metavariable behavior - see exact captures and positions
• Testing patterns quickly before using in search/replace/scan

WHEN NOT TO USE:
• Searching files for patterns → Use ast_search for file/directory searches
• Applying fixes to code → Use ast_replace for actual replacements
• Running rules with constraints → Use ast_run_rule for filtering by metavariable content
• Production code scanning → Use ast_run_rule for code quality checks
• Need structural rules (kind/has/inside) → Use ast_run_rule with rule parameter

PATTERN SYNTAX:
• $VAR - Single AST node (expression, identifier, statement)
  - Examples: $ARG, $NAME, $VALUE, $OBJ, $PROP
  - Naming: UPPER_CASE or UPPER_SNAKE_CASE recommended
  - Captured in metavariables output with exact text and position
• $$$NAME - Multiple nodes, MUST be named (bare $$$ rejected)
  - Examples: $$$ARGS, $$$PARAMS, $$$BODY, $$$ITEMS
  - Matches: zero or more AST nodes in sequence
  - Always requires a name (bare $$$ will be rejected)
  - Captured as concatenated text in metavariables output
• $_ - Anonymous match (use when you don't need to reference it)
  - Example: foo($_, $_, $_) matches three arguments without capturing
  - Will NOT appear in metavariables output

Metavariable rules:
1. Must be complete AST nodes: Use "$OBJ.$PROP", not "$VAR.prop"
2. Multi-node must be named: "$$$ARGS" not "$$$" (validation error if unnamed)
3. Language-specific: JavaScript patterns won't work in Python
4. Match structure, not text: "foo" won't match "foobar"
5. Case-sensitive: $VAR and $var are different metavariables

COMMON PATTERNS:

1. Function calls:
   Any arguments: "functionName($$$ARGS)"
   Exactly one: "functionName($ARG)"
   Exactly two: "functionName($A, $B)"

2. Function definitions:
   Any function: "function $NAME($$$PARAMS) { $$$BODY }"
   Arrow function: "($$$PARAMS) => $BODY"

3. Class patterns:
   Basic: "class $NAME { $$$MEMBERS }"
   With extends: "class $NAME extends $BASE { $$$MEMBERS }"

OUTPUT STRUCTURE:
{
  "matched": boolean,          // true if pattern matched the code
  "metavariables": {           // Captured metavariables with positions
    "ARG": {
      "value": "'hello'",      // Captured code text
      "line": 1,              // 1-based line number
      "column": 12            // 0-based column
    }
  },
  "astNodes": ["call_expression", "string"],  // AST node kinds of matches
  "suggestions": [],          // Debugging tips (empty if matched)
  "ast": "..."               // AST debug output (only when showAst: true)
}

ERROR RECOVERY:

If pattern fails to match, check these common issues:

1. "Pattern is required"
   → Add pattern parameter
   → Example: { pattern: "console.log($ARG)", code: "...", language: "javascript" }

2. "Code is required"
   → Add code parameter with inline code to test
   → Example: { pattern: "$P", code: "console.log('test');", language: "javascript" }

3. "Language is required"
   → Add language parameter (always required)
   → Example: { pattern: "$P", code: "...", language: "javascript" }

4. "Invalid pattern: Use named multi-node metavariables like $$$BODY"
   → Replace "$$$" with "$$$NAME"
   → Bare $$$ is rejected

5. matched: false with suggestions
   → Pattern syntax is valid but doesn't match code
   → Follow suggestions to fix pattern
   → Try with ast_search on real files to verify pattern works

6. Empty metavariables but matched: true
   → Pattern has no metavariables (e.g., "console.log()")
   → This is expected for literal patterns

ADVANCED OPTIONS:

Debugging:
• showAst: Include AST debug output (executes --debug-query=ast)
• verbose: Control output verbosity (default: true, false returns simplified summary)
• strictness: Pattern matching strictness (cst, smart, ast, relaxed, signature)

Performance:
• timeoutMs: Process timeout in milliseconds (1000-300000, default: 10000)

LIMITATIONS:
• Only works with inline code (not file paths)
• Default timeout 10 seconds (configurable via timeoutMs)
• Language parameter always required
• Code size limited to 1MB
• AST node kinds shown in astNodes array (not per-metavariable)

PERFORMANCE:
• Fast execution (default 10s timeout, max 300s)
• No file I/O overhead
• Perfect for iterative pattern development
• Adjust timeout for complex patterns

CLI FLAG REFERENCE:

MCP Parameter → ast-grep CLI Flag:
• pattern → --pattern <value>
• language → --lang <value>
• code → --stdin (with stdin input)
• strictness → --strictness cst|smart|ast|relaxed|signature
• showAst → --debug-query=ast (separate call when true)
• verbose → Controls output verbosity (not a CLI flag, affects result formatting)
• timeoutMs → Process timeout (not a CLI flag)

Language Normalization:
javascript→js, typescript→ts, python→py, golang→go, c++→cpp, csharp→cs

Example Commands:
1. Basic explain: ast-grep run --pattern "console.log($ARG)" --lang js --json=stream --stdin
2. With strictness: ast-grep run --pattern "console.log($ARG)" --lang js --strictness relaxed --json=stream --stdin
3. With AST debug: ast-grep run --pattern "console.log($ARG)" --lang js --debug-query=ast --stdin

Reference: AST_GREP_DOCUMENTS.md lines 355-814 for complete CLI flag documentation`,

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
                      "AST kind to extract from context. Example: 'field_definition' to match only field nodes.",
                  },
                  strictness: {
                    type: "string",
                    enum: ["cst", "smart", "ast", "relaxed", "signature"],
                    description: "Pattern-specific strictness override. Takes precedence over top-level strictness.",
                  },
                },
                description:
                  "Pattern object for advanced matching. Use when testing patterns with specific AST node selectors.",
              },
            ],
            description:
              "AST pattern (string or object). String form for simple patterns, object form for testing context-based patterns.",
          },
          code: {
            type: "string",
            description:
              "Inline code to test the pattern against. Required for pattern explanation.",
          },
          language: {
            type: "string",
            description:
              "Programming language (js/ts/py/java/rust/go/cpp/kotlin/csharp). Required.",
          },
          showAst: {
            type: "boolean",
            description:
              "Include AST debug output in result. When true, executes a second ast-grep call with --debug-query=ast to show the pattern's AST structure. Default: false.",
          },
          timeoutMs: {
            type: "number",
            description:
              "Timeout in milliseconds (1000-300000). Default: 10000. Increase for complex patterns or slow systems.",
          },
          verbose: {
            type: "boolean",
            description:
              "Control output verbosity. Default: true. When false, returns simplified summary without detailed metavariable captures. Useful in CLI to prevent excessive output.",
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
              "Useful for testing different matching modes to understand pattern behavior. See: https://ast-grep.github.io/advanced/match-algorithm.html",
          },
        },
        required: ["pattern", "code", "language"],
        additionalProperties: false,
      },
    };
  }
}
