import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AstGrepBinaryManager } from '../core/binary-manager.js';
import { WorkspaceManager } from '../core/workspace-manager.js';
import { ValidationError, ExecutionError } from '../types/errors.js';

/**
 * Rule builder that generates YAML and runs ast-grep scan
 */
export class ScanTool {
  constructor(
    private workspaceManager: WorkspaceManager,
    private binaryManager: AstGrepBinaryManager
  ) {}

  async execute(params: any): Promise<any> {
    // Basic validation
    if (!params.id || !params.language || !params.pattern) {
      throw new ValidationError('id, language, and pattern are required');
    }

    const normalizeLang = (lang: string) => {
      const map: Record<string, string> = {
        javascript: 'js',
        typescript: 'ts',
        jsx: 'jsx',
        tsx: 'tsx',
      };
      const lower = (lang || '').toLowerCase();
      return map[lower] || lang;
    };

    // Generate simple YAML rule
    const yaml = this.buildYaml({ ...params, language: normalizeLang(params.language) });

    // Create temporary rule file
    const tempDir = os.tmpdir();
    const rulesFile = path.join(tempDir, `rule-${Date.now()}.yml`);

    let tempCodeFileForCleanup: string | null = null;
    try {
      await fs.writeFile(rulesFile, yaml, 'utf8');

      // Build scan command
      const args = ['scan', '--rule', rulesFile, '--json=stream'];

      // Add paths or inline code via temp file
      let tempCodeFile: string | null = null;
      if (params.code) {
        const extMap: Record<string, string> = { js: 'js', ts: 'ts', jsx: 'jsx', tsx: 'tsx' };
        const ext = extMap[normalizeLang(params.language)] || 'js';
        tempCodeFile = path.join(os.tmpdir(), `astgrep-inline-${Date.now()}.${ext}`);
        await fs.writeFile(tempCodeFile, params.code, 'utf8');
        args.push(tempCodeFile);
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

      const findings = this.parseFindings(result.stdout);

      const resultObj = {
        yaml,
        scan: {
          findings,
          summary: {
            totalFindings: findings.length,
            errors: findings.filter(f => f.severity === 'error').length,
            warnings: findings.filter(f => f.severity === 'warning').length
          }
        }
      };

      return resultObj;

    } finally {
      // Cleanup
      try { await fs.unlink(rulesFile); } catch {}
      if (tempCodeFileForCleanup) {
        try { await fs.unlink(tempCodeFileForCleanup); } catch {}
      }
    }
  }

  private buildYaml(params: any): string {
    const lines = [
      `id: ${params.id}`,
      `message: ${JSON.stringify(params.message || params.id)}`,
      `severity: ${params.severity || 'warning'}`,
      `language: ${params.language}`,
      'rule:',
      `  pattern: ${JSON.stringify(params.pattern)}`
    ];

    // Add simple constraints if provided
    if (params.where && params.where.length > 0) {
      lines.push('  constraints:');
      for (const constraint of params.where) {
        lines.push(`    ${constraint.metavariable}:`);
        if (constraint.regex) {
          lines.push(`      regex: ${JSON.stringify(constraint.regex)}`);
        } else if (constraint.equals) {
          const escaped = constraint.equals.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          lines.push(`      regex: ${JSON.stringify('^' + escaped + '$')}`);
        }
      }
    }

    // Add fix if provided
    if (params.fix) {
      lines.push(`fix: ${JSON.stringify(params.fix)}`);
    }

    return lines.join('\n');
  }

  private parseFindings(stdout: string): any[] {
    const findings: any[] = [];

    if (!stdout.trim()) return findings;

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
        // Skip malformed lines
      }
    }

    return findings;
  }

  static getSchema() {
    return {
      name: 'ast_run_rule',
      description: '🔍 Generate and run ast-grep scanning rules. Supports pattern matching, constraints, and fix templates. Use `code` parameter for inline code or `paths` for file scanning.',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'Unique rule identifier (e.g., "no-console-log", "require-const")'
          },
          language: {
            type: 'string',
            description: 'Programming language: javascript/js, typescript/ts, python, rust, go, java, etc. Case-insensitive.'
          },
          pattern: {
            type: 'string',
            description: 'AST pattern with metavariables: console.log($ARG), function $NAME($PARAMS) { $$$BODY }. Use $VAR for single nodes, $$$NAME for multiple nodes (must be named).'
          },
          message: {
            type: 'string',
            description: 'Human-readable message describing the issue (defaults to rule id if not provided)'
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
                metavariable: { type: 'string' },
                regex: { type: 'string' },
                equals: { type: 'string' }
              },
              required: ['metavariable']
            },
            description: 'Constraints on metavariables. Each constraint filters matches based on metavariable content using regex or exact equals matching.'
          },
          fix: {
            type: 'string',
            description: 'Optional fix template using same metavariables as pattern (e.g., "logger.info($ARG)" for console.log fix)'
          },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Paths to scan (defaults to current directory)'
          },
          code: {
            type: 'string',
            description: 'Inline code to scan instead of files'
          },
          timeoutMs: {
            type: 'number',
            default: 30000,
            description: 'Timeout in milliseconds'
          }
        },
        required: ['id', 'language', 'pattern']
      }
    };
  }
}