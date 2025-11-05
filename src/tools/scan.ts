import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AstGrepBinaryManager } from '../core/binary-manager.js';
import { WorkspaceManager } from '../core/workspace-manager.js';
import { ValidationError, ExecutionError } from '../types/errors.js';
import { PatternValidator, YamlValidator, ParameterValidator, PathValidator } from '../utils/validation.js';
import type { Rule, Pattern } from '../types/rules.js';
import { hasPositiveKey } from '../types/rules.js';

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

    // Support two modes:
    // Mode 1 (existing): Simple pattern string + optional where constraints
    // Mode 2 (new): Complex rule object with kind, has, inside, all, any, not, matches, etc.
    const hasPattern = params.pattern && typeof params.pattern === 'string';
    const hasRule = params.rule && typeof params.rule === 'object' && !Array.isArray(params.rule);

    if (!hasPattern && !hasRule) {
      throw new ValidationError(
        'Either pattern (string) or rule (object) is required. ' +
        'Use pattern for simple matching, or rule for structural rules with kind, has, inside, etc.'
      );
    }

    if (hasPattern && hasRule) {
      throw new ValidationError(
        'Cannot specify both pattern and rule parameters. ' +
        'Use pattern for simple matching, or rule for structural rules.'
      );
    }

    // Validate rule ID format
    const ruleIdValidation = YamlValidator.validateRuleId(params.id);
    if (!ruleIdValidation.valid) {
      throw new ValidationError(
        `Invalid rule ID: ${ruleIdValidation.errors.join('; ')}`,
        { errors: ruleIdValidation.errors }
      );
    }

    // Validate pattern (only in simple pattern mode)
    if (hasPattern) {
      const patternValidation = PatternValidator.validatePattern(params.pattern, params.language);
      if (!patternValidation.valid) {
        throw new ValidationError(
          `Invalid pattern: ${patternValidation.errors.join('; ')}`,
          { errors: patternValidation.errors }
        );
      }

      // Log pattern warnings if any - log each warning individually for better test assertions
      if (patternValidation.warnings && patternValidation.warnings.length > 0) {
        for (const warning of patternValidation.warnings) {
          console.error(`Warning: ${warning}`);
        }
      }
    }

    // Validate rule object (in structural rule mode)
    if (hasRule) {
      // Basic validation: rule must have at least one positive key
      if (!hasPositiveKey(params.rule)) {
        throw new ValidationError(
          'Rule object must have at least one positive key (pattern, kind, regex, inside, has, precedes, follows, all, any, or matches)'
        );
      }

      // If rule has a pattern property, validate it
      if (params.rule.pattern) {
        const pattern = params.rule.pattern;
        if (typeof pattern === 'string') {
          const patternValidation = PatternValidator.validatePattern(pattern, params.language);
          if (!patternValidation.valid) {
            throw new ValidationError(
              `Invalid pattern in rule: ${patternValidation.errors.join('; ')}`,
              { errors: patternValidation.errors }
            );
          }
          // Log warnings for rule pattern
          if (patternValidation.warnings && patternValidation.warnings.length > 0) {
            for (const warning of patternValidation.warnings) {
              console.error(`Warning: ${warning}`);
            }
          }
        } else if (typeof pattern === 'object' && pattern !== null) {
          // Pattern object validation (selector, context, strictness)
          if (pattern.selector && typeof pattern.selector !== 'string') {
            throw new ValidationError('Pattern object selector must be a string');
          }
          if (pattern.context && typeof pattern.context !== 'string') {
            throw new ValidationError('Pattern object context must be a string');
          }
          if (pattern.strictness) {
            const validStrictness = ['cst', 'smart', 'ast', 'relaxed', 'signature'];
            if (!validStrictness.includes(pattern.strictness)) {
              throw new ValidationError(
                `Invalid strictness: ${pattern.strictness}. Must be one of: ${validStrictness.join(', ')}`
              );
            }
          }
        } else {
          throw new ValidationError('Rule pattern must be a string or pattern object');
        }
      }

      // Validate kind if present
      if (params.rule.kind && typeof params.rule.kind !== 'string') {
        throw new ValidationError('Rule kind must be a string (tree-sitter node type)');
      }

      // Validate regex if present
      if (params.rule.regex && typeof params.rule.regex !== 'string') {
        throw new ValidationError('Rule regex must be a string');
      }
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
    const lines = [
      `id: ${params.id}`,
      `message: ${YamlValidator.escapeYamlString(params.message || params.id)}`,
      `severity: ${params.severity || 'warning'}`,
      `language: ${params.language}`,
      'rule:'
    ];

    // Mode 1: Simple pattern string
    let patternMetavars: Set<string> = new Set();
    if (params.pattern) {
      patternMetavars = PatternValidator.extractMetavariables(params.pattern);
      lines.push(`  pattern: ${YamlValidator.escapeYamlString(params.pattern)}`);
    }
    // Mode 2: Structural rule object
    else if (params.rule) {
      const ruleLines = this.serializeRule(params.rule, 1);
      lines.push(...ruleLines);

      // Extract metavariables from rule for constraint/fix validation
      // This is a simplified extraction - only from top-level pattern
      if (params.rule.pattern && typeof params.rule.pattern === 'string') {
        patternMetavars = PatternValidator.extractMetavariables(params.rule.pattern);
      }
    }

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

  /**
   * Serialize a rule object to YAML format with proper indentation
   *
   * @param rule - The rule object to serialize (can contain nested rules)
   * @param indentLevel - Current indentation level (0 = top level, 1 = inside rule:, etc.)
   * @returns Array of YAML lines with proper indentation
   */
  private serializeRule(rule: Rule, indentLevel: number): string[] {
    const lines: string[] = [];
    const indent = '  '.repeat(indentLevel);

    // Atomic rules
    if (rule.pattern !== undefined) {
      const pattern = rule.pattern;
      if (typeof pattern === 'string') {
        lines.push(`${indent}pattern: ${YamlValidator.escapeYamlString(pattern)}`);
      } else if (typeof pattern === 'object' && pattern !== null) {
        // Pattern object with selector, context, strictness
        lines.push(`${indent}pattern:`);
        if (pattern.selector) {
          lines.push(`${indent}  selector: ${YamlValidator.escapeYamlString(pattern.selector)}`);
        }
        if (pattern.context) {
          lines.push(`${indent}  context: ${YamlValidator.escapeYamlString(pattern.context)}`);
        }
        if (pattern.strictness) {
          lines.push(`${indent}  strictness: ${pattern.strictness}`);
        }
      }
    }

    if (rule.kind !== undefined) {
      lines.push(`${indent}kind: ${rule.kind}`);
    }

    if (rule.regex !== undefined) {
      lines.push(`${indent}regex: ${YamlValidator.escapeYamlString(rule.regex)}`);
    }

    // Relational rules (inside, has, precedes, follows)
    const relationalRules: Array<{ key: string; value: any }> = [
      { key: 'inside', value: rule.inside },
      { key: 'has', value: rule.has },
      { key: 'precedes', value: rule.precedes },
      { key: 'follows', value: rule.follows }
    ];

    for (const { key, value } of relationalRules) {
      if (value !== undefined) {
        lines.push(`${indent}${key}:`);

        // Serialize nested rule
        const nestedLines = this.serializeRule(value as Rule, indentLevel + 1);
        lines.push(...nestedLines);

        // Add stopBy and field if present in the relational rule
        if (typeof value === 'object' && value !== null) {
          if ((value as any).stopBy !== undefined) {
            const stopBy = (value as any).stopBy;
            if (typeof stopBy === 'string') {
              lines.push(`${indent}  stopBy: ${stopBy}`);
            } else if (typeof stopBy === 'object') {
              lines.push(`${indent}  stopBy:`);
              lines.push(...this.serializeRule(stopBy as Rule, indentLevel + 2));
            }
          }
          if ((value as any).field !== undefined) {
            lines.push(`${indent}  field: ${(value as any).field}`);
          }
        }
      }
    }

    // Composite rules (all, any, not, matches)
    if (rule.all !== undefined && Array.isArray(rule.all)) {
      lines.push(`${indent}all:`);
      for (const subRule of rule.all) {
        lines.push(`${indent}  -`);
        const subLines = this.serializeRule(subRule as Rule, indentLevel + 2);
        // Adjust first line to be on same line as dash
        if (subLines.length > 0) {
          const firstLine = subLines[0].trim();
          lines[lines.length - 1] = `${indent}  - ${firstLine}`;
          lines.push(...subLines.slice(1));
        }
      }
    }

    if (rule.any !== undefined && Array.isArray(rule.any)) {
      lines.push(`${indent}any:`);
      for (const subRule of rule.any) {
        lines.push(`${indent}  -`);
        const subLines = this.serializeRule(subRule as Rule, indentLevel + 2);
        if (subLines.length > 0) {
          const firstLine = subLines[0].trim();
          lines[lines.length - 1] = `${indent}  - ${firstLine}`;
          lines.push(...subLines.slice(1));
        }
      }
    }

    if (rule.not !== undefined) {
      lines.push(`${indent}not:`);
      const notLines = this.serializeRule(rule.not as Rule, indentLevel + 1);
      lines.push(...notLines);
    }

    if (rule.matches !== undefined) {
      lines.push(`${indent}matches: ${rule.matches}`);
    }

    return lines;
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
      description: `Generate and execute ast-grep YAML rules. Supports simple patterns with constraints, structural rules (kind/has/inside/all/any/not), fix suggestions, and severity levels. Returns generated YAML and scan findings.

QUICK START:
Simple pattern with constraint:
{ "id": "no-var", "language": "javascript", "pattern": "var $NAME = $VALUE", "where": [{ "metavariable": "NAME", "regex": "^test" }] }

Structural rule with kind:
{ "id": "match-expr", "language": "rust", "rule": { "kind": "match_expression" } }

Pattern with fix suggestion:
{ "id": "modernize", "language": "javascript", "pattern": "var $N = $V", "fix": "const $N = $V", "severity": "warning" }

WHEN TO USE:
• Need constraints on metavariables (filter by name, pattern, exact value)
• Want to provide automated fix suggestions
• Need to categorize findings by severity (error/warning/info)
• Building reusable code quality rules
• Structural matching with kind, has, inside, all, any, not operators
• Pattern objects with selector/context/strictness for disambiguation

WHEN NOT TO USE:
• Simple search without constraints → Use ast_search
• Want to apply changes immediately → Use ast_replace
• Quick codebase exploration → Use ast_search

RULE MODES (Automatic Detection):
This tool automatically detects rule complexity based on parameters provided:

1. Simple Pattern Mode: Provide 'pattern' parameter
   - AST pattern string with optional constraints
   - Example: { pattern: "console.log($ARG)", where: [{ metavariable: "ARG", regex: ".*" }] }

2. Structural Rule Mode: Provide 'rule' parameter
   - Complex rule object with kind, relational, or composite operators
   - Example: { rule: { kind: "function_declaration", has: { pattern: "await $E", stopBy: "end" } } }

NOTE: Provide either 'pattern' OR 'rule', not both

STRUCTURAL RULES:
Structural rules enable advanced matching beyond simple patterns:

1. Kind Rules - Match by AST node type:
   { rule: { kind: "match_expression" } }
   Matches Rust match expressions by tree-sitter node type.

2. Relational Rules - Match based on relationships (inside, has, precedes, follows):
   { rule: { kind: "function_declaration", has: { pattern: "await $E", stopBy: "end" } } }
   Matches functions containing await. IMPORTANT: Use stopBy: "end" for relational rules.

3. Pattern Objects - Disambiguate with selector/context/strictness:
   { rule: { pattern: { selector: "type_parameters", context: "function $F<$T>()" } } }
   Matches TypeScript generic function type parameters.

4. Composite Rules - Combine conditions (all=AND, any=OR, not=NOT):
   { rule: { all: [{ kind: "call_expression" }, { pattern: "console.log($M)" }] } }
   Matches nodes satisfying ALL sub-rules.

METAVARIABLE RULES:
• $VAR - Single node, must be complete AST node ($OBJ.$PROP not $VAR.prop)
• $$$NAME - Multiple nodes, must be named (bare $$$ rejected)
• $_ - Anonymous match (cannot reference in constraints/fix)
• All metavariables in constraints/fix must exist in pattern
• Multi-node metavariables must always be named

CONSTRAINT EXAMPLES:

1. Regex pattern matching:
   where: [{ metavariable: "NAME", regex: "^test" }]
   Matches: const testVar = 1  |  Doesn't match: const myVar = 1

2. Exact value matching:
   where: [{ metavariable: "OBJ", equals: "console" }, { metavariable: "METHOD", equals: "log" }]
   Matches: console.log(...)  |  Doesn't match: logger.log(...)

3. Numeric values only:
   where: [{ metavariable: "DURATION", regex: "^[0-9]+$" }]
   Matches: timeout(5000)  |  Doesn't match: timeout(CONSTANT)

FIX TEMPLATE EXAMPLES:

1. Simple replacement: pattern="console.log($A)" fix="logger.info($A)"
2. Reordering: pattern="assertEquals($E, $A)" fix="assertEquals($A, $E)"
3. Adding context: pattern="throw new Error($M)" fix="throw new Error(\`[MODULE] \${$M}\`)"

SEVERITY LEVELS:
• error: Critical bugs or runtime failures
• warning: Should be changed but won't break (default)
• info: Suggestions for improvement, style issues

ERROR RECOVERY:

If rule execution fails, check these common issues:

1. "Either pattern (string) or rule (object) is required"
   → Provide either pattern parameter OR rule parameter, not both
   → Example (pattern mode): { pattern: "console.log($A)", ... }
   → Example (rule mode): { rule: { kind: "function_declaration" }, ... }

2. "Rule object must have at least one positive key"
   → Rule object needs pattern, kind, regex, inside, has, all, any, or matches
   → Example: { rule: { kind: "match_expression" } }

3. "Metavariable $X used in constraint/fix but not in pattern"
   → All constraint/fix metavariables must be defined in pattern
   → Fix: Add $X to pattern or remove from constraint/fix

4. "Invalid pattern: Use named multi-node metavariables like $$ARGS"
   → Replace "$$$" with "$$$NAME"
   → Bare $$$ is rejected

5. "Language required for inline code"
   → Language is always required parameter (for both inline and file modes)
   → Example: { id: "r", language: "javascript", pattern: "...", code: "..." }

6. "Invalid paths"
   → Use relative paths within workspace
   → Paths validated against workspace root for security
   → Omit paths to scan entire workspace

7. Empty scan.findings array (no matches)
   → Rule is valid but matched nothing (not an error)
   → Test with inline code first to verify rule logic
   → Check pattern syntax matches language AST

8. Timeout errors
   → Increase timeoutMs (default: 30000ms, max: 300000ms)
   → Narrow paths to specific directories
   → Simplify pattern or constraints
   → Recommended by repo size:
     Small (<1K files): 30000ms (default)
     Medium (1K-10K): 60000-120000ms
     Large (>10K): 120000-300000ms

OUTPUT STRUCTURE:
• yaml: Generated YAML rule (can be saved for reuse)
• scan.findings: Array of { file, line, column, message, severity }
• scan.summary: { totalFindings, errors, warnings, info }
• All findings returned (no truncation)

OPERATION MODES:

Inline Code Mode (testing):
• Use code parameter to test rules on snippets
• Language parameter REQUIRED
• Example: { id: "r", language: "js", pattern: "var $N = $V", code: "var x = 1;" }

File Mode (scanning):
• Use paths or omit for entire workspace
• Language parameter REQUIRED
• Example: { id: "r", language: "js", pattern: "var $N = $V", paths: ["src/"] }

JSX/TSX Patterns:
• Set language to 'jsx' or 'tsx'
• Element matching: "<$COMPONENT $$$ATTRS>" or "<$TAG>$$$CHILDREN</$TAG>"
• Attribute matching: "<Button onClick={$HANDLER}>"
• WARNING: Broad patterns like "<$TAG>" match thousands of elements - add constraints

LIMITATIONS:
• Paths must be within workspace root (security constraint)
• Constraints support regex and equals only
• Fix templates cannot perform complex transformations
• Temporary YAML files created and cleaned up automatically

REFERENCE - MCP to ast-grep CLI Mapping:
id, language, pattern/rule, severity, message, where, fix → YAML file (temp)
paths → positional arguments
code → temp file with extension
timeoutMs → process timeout (not a CLI flag)

Example: { id: "no-var", pattern: "var $N = $V", language: "js", paths: ["src/"] }
CLI: ast-grep scan --rule <temp-rule.yml> --json=stream src/`,

      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique rule identifier in kebab-case. Example: "no-console-log", "prefer-const"'
          },
          language: {
            type: 'string',
            description: 'Programming language (js/ts/py/rust/go/java/cpp). Required for all rules.'
          },
          pattern: {
            type: 'string',
            description: 'Simple AST pattern string. Use either pattern OR rule, not both.'
          },
          rule: {
            type: 'object',
            description: 'Structural rule object (kind/has/inside/all/any/not). Use either pattern OR rule, not both.'
          },
          message: {
            type: 'string',
            description: 'Human-readable issue description. Defaults to rule ID if omitted.'
          },
          severity: {
            type: 'string',
            enum: ['error', 'warning', 'info'],
            description: 'Finding severity. error=critical, warning=default, info=suggestion.'
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
                  description: 'Regex pattern to match metavariable content'
                },
                equals: {
                  type: 'string',
                  description: 'Exact string to match metavariable content'
                }
              },
              required: ['metavariable']
            },
            description: 'Constraints on pattern metavariables. Each must reference a metavariable from pattern.'
          },
          fix: {
            type: 'string',
            description: 'Fix template using pattern metavariables. Can reorder, duplicate, or omit variables.'
          },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File/directory paths to scan within workspace. Omit for entire workspace.'
          },
          code: {
            type: 'string',
            description: 'Inline code to scan. Use for testing rules before file scanning.'
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (1000-300000). Default: 30000. Increase for large repos.'
          }
        },
        required: ['id', 'language'],
        additionalProperties: false
      }
    };
  }
}