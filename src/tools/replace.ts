import { AstGrepBinaryManager } from '../core/binary-manager.js';
import { WorkspaceManager } from '../core/workspace-manager.js';
import { ValidationError, ExecutionError } from '../types/errors.js';

/**
 * Direct replace tool that calls ast-grep run --rewrite with minimal overhead
 */
export class ReplaceTool {
  constructor(
    private binaryManager: AstGrepBinaryManager,
    private workspaceManager: WorkspaceManager
  ) {}

  async execute(params: any): Promise<any> {
    // Basic validation - only what's absolutely necessary
    if (!params.pattern || typeof params.pattern !== 'string') {
      throw new ValidationError('Pattern is required');
    }
    if (!params.replacement) {
      throw new ValidationError('Replacement is required');
    }

    // Guardrail: discourage bare $$$ which ast-grep doesn't expand in rewrite
    const hasBareMultiInPattern = /\$\$\$(?![A-Za-z_][A-Za-z0-9_]*)/.test(params.pattern);
    const hasBareMultiInReplacement = /\$\$\$(?![A-Za-z_][A-Za-z0-9_]*)/.test(params.replacement);
    if (hasBareMultiInPattern || hasBareMultiInReplacement) {
      throw new ValidationError('Use named multi-node metavariables like $$$BODY instead of bare $$$ in pattern/replacement');
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

    // Build ast-grep command directly
    const args = ['run', '--pattern', params.pattern.trim(), '--rewrite', params.replacement];

    // Add language if provided
    if (params.language) {
      args.push('--lang', normalizeLang(params.language));
    }

    // Handle dry-run vs actual replacement
    if (!params.dryRun) {
      args.push('--update-all');
    }
    // Note: ast-grep run --rewrite outputs diff format by default (perfect for dry-run)

    // Handle inline code vs file paths
    let executeOptions: any = {
      cwd: this.workspaceManager.getWorkspaceRoot(),
      timeout: params.timeoutMs || 60000
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
        throw new ValidationError('Invalid paths', { errors });
      }
      args.push(...resolvedPaths);
    }

    try {
      const result = await this.binaryManager.executeAstGrep(args, executeOptions);
      return this.parseResults(result.stdout, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ExecutionError(`Replace failed: ${message}`);
    }
  }

  private parseResults(stdout: string, params: any): any {
    const changes: any[] = [];

    if (!stdout.trim()) {
      return {
        changes,
        summary: {
          totalChanges: 0,
          filesModified: 0,
          dryRun: params.dryRun !== false
        }
      };
    }

    // Parse diff output - very simple approach
    const lines = stdout.split('\n');
    let currentFile = '';
    let changeCount = 0;
    let diffContent = '';

    for (const line of lines) {
      if (line && !line.startsWith('@@') && !line.includes('│') && !line.startsWith(' ')) {
        // Looks like a file header
        if (currentFile && changeCount > 0) {
          changes.push({
            file: currentFile,
            matches: changeCount,
            preview: params.dryRun !== false ? diffContent : undefined,
            applied: params.dryRun === false
          });
        }
        currentFile = line.trim();
        changeCount = 0;
        diffContent = line + '\n';
      } else if (line.includes('│-') || line.includes('│+')) {
        if (line.includes('│-')) changeCount++;
        diffContent += line + '\n';
      } else {
        diffContent += line + '\n';
      }
    }

    // Don't forget the last file
    if (currentFile && (changeCount > 0 || diffContent.trim())) {
      changes.push({
        file: currentFile,
        matches: Math.max(changeCount, 1),
        preview: params.dryRun !== false ? diffContent : undefined,
        applied: params.dryRun === false
      });
    }

    return {
      changes,
      summary: {
        totalChanges: changes.reduce((sum, c) => sum + c.matches, 0),
        filesModified: changes.length,
        dryRun: params.dryRun !== false
      }
    };
  }

  static getSchema() {
    return {
      name: 'ast_replace',
      description: 'Direct ast-grep replace with metavariable support. Use $NAME for single nodes, $$$NAME for multi-nodes (NEVER bare $$$).',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'AST pattern to match. Examples: console.log($ARG), var $NAME = $VALUE, function $NAME($PARAMS) { $$$BODY }. CRITICAL: Use named multi-node metavariables like $$$BODY, never bare $$$.'
          },
          replacement: {
            type: 'string',
            description: 'Replacement template using same metavariables. Examples: logger.info($ARG), const $NAME = $VALUE, const $NAME = ($PARAMS) => { $$$BODY }. Must use same metavariable names as pattern.'
          },
          code: {
            type: 'string',
            description: 'Apply replacement to inline code (recommended for testing). When using this, language parameter is REQUIRED.'
          },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths to modify within workspace (default: current directory). Paths are validated for security.'
          },
          language: {
            type: 'string',
            description: 'Programming language: javascript/js, typescript/ts, python, java, etc. REQUIRED when using code parameter.'
          },
          dryRun: {
            type: 'boolean',
            default: true,
            description: 'Show diff preview without making changes (default: true). Set false to apply changes.'
          },
          timeoutMs: {
            type: 'number',
            default: 60000,
            description: 'Timeout in milliseconds (default: 60000)'
          }
        },
        required: ['pattern', 'replacement']
      }
    };
  }
}