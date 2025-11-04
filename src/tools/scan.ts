import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AstGrepBinaryManager } from '../core/binary-manager.js';
import { WorkspaceManager } from '../core/workspace-manager.js';
import { ValidationError, ExecutionError } from '../types/errors.js';
import { PatternValidator, YamlValidator, ParameterValidator, PathValidator } from '../utils/validation.js';

/**
 * Rule builder that generates YAML and runs ast-grep scan
 */
export class ScanTool {
  constructor(
    private workspaceManager: WorkspaceManager,
    private binaryManager: AstGrepBinaryManager
  ) {}

  async execute(params: any): Promise<any> {
    // Validate required parameters
    if (!params.id || typeof params.id !== 'string') {
      throw new ValidationError('id is required and must be a string');
    }
    if (!params.language || typeof params.language !== 'string') {
      throw new ValidationError('language is required and must be a string');
    }
    if (!params.pattern || typeof params.pattern !== 'string') {
      throw new ValidationError('pattern is required and must be a string');
    }

    // Validate rule ID format
    const ruleIdValidation = YamlValidator.validateRuleId(params.id);
    if (!ruleIdValidation.valid) {
      throw new ValidationError(
        `Invalid rule ID: ${ruleIdValidation.errors.join('; ')}`,
        { errors: ruleIdValidation.errors }
      );
    }

    // Validate pattern
    const patternValidation = PatternValidator.validatePattern(params.pattern, params.language);
    if (!patternValidation.valid) {
      throw new ValidationError(
        `Invalid pattern: ${patternValidation.errors.join('; ')}`,
        { errors: patternValidation.errors }
      );
    }

    // Validate severity if provided
    if (params.severity) {
      const severityValidation = YamlValidator.validateSeverity(params.severity);
      if (!severityValidation.valid) {
        throw new ValidationError(severityValidation.errors.join('; '));
      }
    }

    // Validate optional parameters with actionable error messages
    const timeoutValidation = ParameterValidator.validateTimeout(params.timeoutMs);
    if (!timeoutValidation.valid) {
      throw new ValidationError(timeoutValidation.errors.join('; '), { errors: timeoutValidation.errors });
    }

    const codeValidation = ParameterValidator.validateCode(params.code);
    if (!codeValidation.valid) {
      throw new ValidationError(codeValidation.errors.join('; '), { errors: codeValidation.errors });
    }

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

    // Generate simple YAML rule
    const yaml = this.buildYaml({ ...params, language: normalizeLang(params.language) });

    // Create temporary rule file with unique name
    const tempDir = os.tmpdir();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const rulesFile = path.join(tempDir, `rule-${Date.now()}-${randomSuffix}.yml`);

    let tempCodeFileForCleanup: string | null = null;
    try {
      await fs.writeFile(rulesFile, yaml, 'utf8');

      // Build scan command (normalize rule file path for ast-grep)
      const args = ['scan', '--rule', PathValidator.normalizePath(rulesFile), '--json=stream'];

      // Add paths or inline code via temp file
      let tempCodeFile: string | null = null;
      if (params.code) {
        const extMap: Record<string, string> = {
          js: 'js', ts: 'ts', jsx: 'jsx', tsx: 'tsx',
          py: 'py', rs: 'rs', go: 'go', java: 'java',
          cpp: 'cpp', c: 'c', kt: 'kt'
        };
        const ext = extMap[normalizeLang(params.language)] || 'js';
        const randomSuffix = Math.random().toString(36).substring(2, 15);
        tempCodeFile = path.join(os.tmpdir(), `astgrep-inline-${Date.now()}-${randomSuffix}.${ext}`);
        await fs.writeFile(tempCodeFile, params.code, 'utf8');
        args.push(PathValidator.normalizePath(tempCodeFile));
        tempCodeFileForCleanup = tempCodeFile;
      } else {
        const inputPaths: string[] = params.paths && Array.isArray(params.paths) && params.paths.length > 0 ? params.paths : ['.'];
        const { valid, resolvedPaths, errors } = this.workspaceManager.validatePaths(inputPaths);
        if (!valid) {
          throw new ValidationError('Invalid paths', { errors });
        }
        args.push(...resolvedPaths);
      }

      const result = await this.binaryManager.executeAstGrep(args, {
        cwd: this.workspaceManager.getWorkspaceRoot(),
        timeout: params.timeoutMs || 30000
      });

      const { findings, skippedLines } = this.parseFindings(result.stdout);

      const resultObj = {
        yaml,
        skippedLines,
        scan: {
          findings,
          summary: {
            totalFindings: findings.length,
            errors: findings.filter(f => f.severity === 'error').length,
            warnings: findings.filter(f => f.severity === 'warning').length,
            skippedLines
          }
        }
      };

      return resultObj;

    } finally {
      // Cleanup with logging
      const cleanupErrors: string[] = [];

      try {
        await fs.unlink(rulesFile);
      } catch (e) {
        cleanupErrors.push(`Failed to cleanup rule file: ${e instanceof Error ? e.message : String(e)}`);
      }

      if (tempCodeFileForCleanup) {
        try {
          await fs.unlink(tempCodeFileForCleanup);
        } catch (e) {
          cleanupErrors.push(`Failed to cleanup temp code file: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (cleanupErrors.length > 0) {
        console.error('Cleanup warnings:', cleanupErrors.join('; '));
      }
    }
  }

  private buildYaml(params: any): string {
    // Extract metavariables from pattern for validation
    const patternMetavars = PatternValidator.extractMetavariables(params.pattern);

    const lines = [
      `id: ${params.id}`,
      `message: ${YamlValidator.escapeYamlString(params.message || params.id)}`,
      `severity: ${params.severity || 'warning'}`,
      `language: ${params.language}`,
      'rule:',
      `  pattern: ${YamlValidator.escapeYamlString(params.pattern)}`
    ];

    // Add simple constraints if provided
    if (params.where && params.where.length > 0) {
      lines.push('constraints:');
      for (const constraint of params.where) {
        // Validate that metavariable exists in pattern
        if (!patternMetavars.has(constraint.metavariable)) {
          throw new ValidationError(
            `Constraint references metavariable '${constraint.metavariable}' which is not in the pattern. ` +
            `Available metavariables: ${Array.from(patternMetavars).join(', ') || 'none'}`
          );
        }

        // Validate that constraint provides at least one operator (regex or equals)
        const hasRegex = constraint.hasOwnProperty('regex') && typeof constraint.regex === 'string' && constraint.regex.trim().length > 0;
        const hasEquals = constraint.hasOwnProperty('equals') && typeof constraint.equals === 'string' && constraint.equals.length > 0;

        if (!hasRegex && !hasEquals) {
          throw new ValidationError(
            `Constraint for metavariable '${constraint.metavariable}' must specify either 'regex' or 'equals' with a non-empty value`
          );
        }

        lines.push(`  ${constraint.metavariable}:`);
        if (hasRegex) {
          lines.push(`    regex: ${YamlValidator.escapeYamlString(constraint.regex)}`);
        } else if (hasEquals) {
          const escaped = constraint.equals.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          lines.push(`    regex: ${YamlValidator.escapeYamlString('^' + escaped + '$')}`);
        }
      }
    }

    // Add fix if provided
    if (params.fix) {
      // Validate that fix metavariables exist in pattern
      const fixMetavars = PatternValidator.extractMetavariables(params.fix);
      for (const metavar of fixMetavars) {
        if (!patternMetavars.has(metavar)) {
          throw new ValidationError(
            `Fix template uses metavariable '${metavar}' which is not in the pattern. ` +
            `Available metavariables: ${Array.from(patternMetavars).join(', ') || 'none'}`
          );
        }
      }

      lines.push(`fix: ${YamlValidator.escapeYamlString(params.fix)}`);
    }

    return lines.join('\n');
  }

  private parseFindings(stdout: string): { findings: any[], skippedLines: number } {
    const findings: any[] = [];
    let skippedLines = 0;

    if (!stdout.trim()) return { findings, skippedLines: 0 };

    const lines = stdout.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const finding = JSON.parse(line);
        findings.push({
          ruleId: finding.ruleId || 'unknown',
          severity: finding.severity || 'info',
          message: finding.message || '',
          file: finding.file || '',
          line: (finding.range?.start?.line || 0) + 1, // Convert to 1-based
          column: finding.range?.start?.column || 0,
          fix: finding.fix
        });
      } catch (e) {
        skippedLines++;
        console.error(`Warning: Skipped malformed JSON line: ${line.substring(0, 100)}...`);
      }
    }

    if (skippedLines > 0) {
      console.error(`Warning: Skipped ${skippedLines} malformed finding lines out of ${lines.length} total lines`);
    }

    return { findings, skippedLines };
  }

  static getSchema() {
    return {
      name: 'ast_run_rule',
      description: `Generate and execute ast-grep YAML rules with advanced features.

WHEN TO USE THIS TOOL:
• Need constraints on metavariables (filter by name, type, or pattern)
• Want to provide automated fix suggestions
• Need to categorize findings by severity (error/warning/info)
• Building reusable code quality rules
• Complex pattern matching that requires multiple conditions

WHEN TO USE ast_search INSTEAD:
• Simple pattern matching without constraints
• Quick exploration of codebase
• Don't need fix suggestions or severity levels

WHEN TO USE ast_replace INSTEAD:
• Want to apply changes immediately
• Don't need to categorize or report findings
• Simple find-and-replace operations

RULE STRUCTURE:
This tool generates YAML rules with the following components:
1. id: Unique identifier for the rule
2. message: Human-readable description of the issue
3. severity: error | warning | info
4. language: Target programming language
5. pattern: AST pattern to match
6. constraints (optional): Filter matches based on metavariable content
7. fix (optional): Suggested replacement code

METAVARIABLE RULES:
1. $_ (anonymous) cannot be referenced in constraints or fix templates - use only for matching
2. $NAME must be used as a complete AST node unit and must be named (not bare $)
3. All metavariables must correspond to complete, valid AST nodes in the target language
4. Multi-node $$$NAME must always be named - bare $$$ is rejected
5. Metavariables used in constraints or fix must exist in the pattern

CONSTRAINT EXAMPLES:

1. Match specific variable names:
   {
     id: "no-test-vars",
     pattern: "const $NAME = $VALUE",
     where: [
       { metavariable: "NAME", regex: "^test" }
     ]
   }
   // Matches: const testVar = 1
   // Doesn't match: const myVar = 1

2. Match specific values:
   {
     id: "no-magic-numbers",
     pattern: "timeout($DURATION)",
     where: [
       { metavariable: "DURATION", regex: "^[0-9]+$" }
     ]
   }
   // Matches: timeout(5000)
   // Doesn't match: timeout(TIMEOUT_CONSTANT)

3. Exact matching:
   {
     id: "no-console-log",
     pattern: "$OBJ.$METHOD($$$ARGS)",
     where: [
       { metavariable: "OBJ", equals: "console" },
       { metavariable: "METHOD", equals: "log" }
     ]
   }
   // Matches: console.log(...)
   // Doesn't match: logger.log(...) or console.error(...)

4. Multiple constraints:
   {
     id: "deprecated-api",
     pattern: "$OBJ.$METHOD($$$ARGS)",
     where: [
       { metavariable: "OBJ", equals: "oldAPI" },
       { metavariable: "METHOD", regex: "^(get|set)" }
     ]
   }
   // Matches: oldAPI.getData(...) or oldAPI.setData(...)

FIX TEMPLATE EXAMPLES:

1. Simple replacement:
   {
     pattern: "console.log($ARG)",
     fix: "logger.info($ARG)"
   }

2. Reordering:
   {
     pattern: "assertEquals($EXPECTED, $ACTUAL)",
     fix: "assertEquals($ACTUAL, $EXPECTED)"
   }

3. Adding context:
   {
     pattern: "throw new Error($MSG)",
     fix: "throw new Error(\`[\${MODULE}] \${$MSG}\`)"
   }

SEVERITY GUIDELINES:
• error: Code that will cause bugs or runtime failures
• warning: Code that should be changed but won't break (default)
• info: Suggestions for improvement, style issues

COMPLETE EXAMPLES:

1. Enforce const over var:
   {
     id: "prefer-const",
     language: "javascript",
     pattern: "var $NAME = $VALUE",
     message: "Use 'const' or 'let' instead of 'var'",
     severity: "warning",
     fix: "const $NAME = $VALUE",
     paths: ["src/"]
   }

2. Detect deprecated API with constraints:
   {
     id: "no-deprecated-api",
     language: "typescript",
     pattern: "$OBJ.$METHOD($$$ARGS)",
     message: "This API is deprecated, use newAPI instead",
     severity: "error",
     where: [
       { metavariable: "OBJ", equals: "oldAPI" }
     ],
     fix: "newAPI.$METHOD($$$ARGS)",
     code: "oldAPI.getData(); newAPI.getData();"
   }

3. Enforce naming conventions:
   {
     id: "constant-naming",
     language: "javascript",
     pattern: "const $NAME = $VALUE",
     message: "Constants should be UPPER_CASE",
     severity: "info",
     where: [
       { metavariable: "NAME", regex: "^[a-z]" }
     ]
   }

OUTPUT FORMAT:
Returns both the generated YAML rule and scan results:
• yaml: The generated YAML rule (can be saved for reuse)
• skippedLines: Top-level count of any malformed output lines that were skipped during parsing
• scan.findings: Array of matches with file, line, column, message
• scan.summary: Statistics (total findings, errors, warnings, skippedLines)

RESULT HANDLING:
• All findings are returned (no truncation limit like ast_search)
• summary.totalFindings reports the complete count
• summary.errors and summary.warnings break down findings by severity
• summary.skippedLines indicates any malformed output lines that were skipped
• skippedLines is available both at top-level and in summary for consistency
• For large result sets, consider narrowing paths or adding more specific constraints

PATH VALIDATION:
• All paths are validated to be within the workspace root (prevents directory escape attacks)
• Omitting paths parameter defaults to current workspace root directory (".")
• Paths can be relative (e.g., "src/") or absolute (must be within workspace)
• Invalid paths (outside workspace, non-existent) will fail with ValidationError
• Example: paths: ["src/", "tests/"] scans two directories
• Example: omit paths entirely to scan the entire workspace

MODES OF OPERATION:

1. Inline Code Mode (for testing):
   - Use code parameter to test rules on code snippets
   - **IMPORTANT: Language is REQUIRED (in the rule parameters) when using inline code mode**
   - Quick validation of rule logic before scanning files
   - Minimal working example:
     {
       id: "no-var",
       pattern: "var $NAME = $VALUE",
       language: "javascript",
       code: "var x = 1; const y = 2;"
     }
   - Language is a required parameter for all rules, so inline mode always has language specified

2. File/Directory Mode (for scanning):
   - Use paths parameter or omit for current directory
   - Language must be specified in rule parameters
   - Scans actual codebase
   - Example: {
       id: "no-var",
       pattern: "var $NAME = $VALUE",
       language: "javascript",
       paths: ["src/", "lib/"]
     }

JSX/TSX PATTERN MATCHING:
When creating rules for JSX/TSX code, set language to 'jsx' or 'tsx':
• Match elements: "<$COMPONENT $$$ATTRS>" or "<$TAG>$$$CHILDREN</$TAG>"
• Match attribute names: "<div $ATTR={$VALUE}>"
• Match attribute values: "<Button onClick={$HANDLER}>"
• Example: { pattern: "<$COMPONENT className={$CLASS}>", language: "jsx" }
• WARNING: Overly broad patterns like "<$TAG>" can match thousands of elements in large codebases
• RECOMMENDATION: Use constraints to filter specific component names or attribute values

BEST PRACTICES:
• Start with simple pattern, add constraints incrementally
• Test with inline code before scanning files
• Use descriptive rule IDs (kebab-case recommended)
• Provide clear, actionable messages
• Test fix templates thoroughly before relying on them
• Use appropriate severity levels

MCP→CLI PARAMETER MAPPING:
This tool generates a YAML rule file and maps MCP parameters to ast-grep CLI flags:
• id, language, pattern, severity, message, where, fix → YAML rule file (temp)
• paths → positional arguments (file/directory paths)
• code → temp file with appropriate extension
• timeoutMs → process timeout (not a CLI flag)
• Output format: --json=stream

Example CLI equivalent:
  MCP: { id: "no-var", pattern: "var $N = $V", language: "js", paths: ["src/"] }
  YAML: Generated temporary rule file with id, pattern, language, etc.
  CLI: ast-grep scan --rule <temp-rule.yml> --json=stream src/

TIMEOUT GUIDANCE:
• Default timeout: 30000ms (30 seconds)
• Timeouts include YAML generation, file parsing, rule execution, and I/O operations
• Recommended timeouts by repo size:
  - Small repos (<1000 files): 30000ms (default)
  - Medium repos (1000-10000 files): 60000-120000ms
  - Large repos (>10000 files): 120000-300000ms
• If timeouts occur: narrow paths, specify language, or simplify pattern/constraints
• Maximum allowed: 300000ms (5 minutes)

YAML GENERATION DETAILS:
• All strings (patterns, messages, regex) are safely double-quoted and escaped
• Special YAML characters (: [ ] { } # " ' etc.) are automatically escaped
• Newlines and quotes within strings are handled correctly
• IMPORTANT: 'equals' constraints are converted to anchored regex (^value$) internally
• Example: { equals: "console" } becomes regex: "^console$" in YAML
• This conversion ensures exact matching while using ast-grep's regex constraint system

LIMITATIONS:
• Constraints only support regex and equals matching
• Fix templates cannot perform complex transformations
• YAML generation is simplified (advanced features require manual YAML)
• Temporary files are created and cleaned up automatically`,

      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique rule identifier in kebab-case (e.g., "no-console-log", "require-const")'
          },
          language: {
            type: 'string',
            description: 'Programming language: javascript/js, typescript/ts, python/py, rust, go, java, cpp, etc.'
          },
          pattern: {
            type: 'string',
            description: 'AST pattern with metavariables. Use $VAR for single nodes, $$$NAME for multiple. Examples: "console.log($ARG)", "function $NAME($$$PARAMS) { $$$BODY }"'
          },
          message: {
            type: 'string',
            description: 'Human-readable message describing the issue (defaults to rule id)'
          },
          severity: {
            type: 'string',
            enum: ['error', 'warning', 'info'],
            default: 'warning',
            description: 'Issue severity: error (critical), warning (default), or info (informational)'
          },
          where: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                metavariable: {
                  type: 'string',
                  description: 'Metavariable name from pattern (without $ prefix)'
                },
                regex: {
                  type: 'string',
                  description: 'Regular expression to match metavariable content'
                },
                equals: {
                  type: 'string',
                  description: 'Exact string to match metavariable content'
                }
              },
              required: ['metavariable']
            },
            description: 'Constraints to filter matches. Each constraint must reference a metavariable from the pattern.'
          },
          fix: {
            type: 'string',
            description: 'Fix template using same metavariables as pattern. Example: "logger.info($ARG)" for console.log($ARG) pattern'
          },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths to scan (defaults to current directory)'
          },
          code: {
            type: 'string',
            description: 'Inline code to scan instead of files (useful for testing rules)'
          },
          timeoutMs: {
            type: 'number',
            default: 30000,
            description: 'Timeout in milliseconds (1000-300000)'
          }
        },
        required: ['id', 'language', 'pattern']
      }
    };
  }
}