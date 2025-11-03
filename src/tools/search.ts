import { AstGrepBinaryManager } from '../core/binary-manager.js';
import { WorkspaceManager } from '../core/workspace-manager.js';
import { ValidationError, ExecutionError } from '../types/errors.js';

/**
 * Direct search tool that calls ast-grep run with minimal overhead
 */
export class SearchTool {
  constructor(
    private binaryManager: AstGrepBinaryManager,
    private workspaceManager: WorkspaceManager
  ) {}

  async execute(params: any): Promise<any> {
    // Basic validation - only what's absolutely necessary
    if (!params.pattern || typeof params.pattern !== 'string') {
      throw new ValidationError('Pattern is required');
    }

    // Normalize language aliases when provided
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

    // Guardrail: warn about bare $$$ in patterns
    const hasBareMulti = /\$\$\$(?![A-Za-z_][A-Za-z0-9_]*)/.test(params.pattern);
    if (hasBareMulti) {
      // Keep simple error to align with minimal philosophy
      throw new ValidationError('Use named multi-node metavariables like $$$BODY instead of bare $$$');
    }

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
        throw new ValidationError('Invalid paths', { errors });
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

    if (!stdout.trim()) {
      return { matches, summary: { totalMatches: 0, executionTime: 0 } };
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
        // Skip malformed lines
      }
    }

    return {
      matches: matches.slice(0, params.maxMatches || 100),
      summary: {
        totalMatches: matches.length,
        executionTime: 0 // We don't need precise timing
      }
    };
  }

  static getSchema() {
    return {
      name: 'ast_search',
      description: 'Fast, reliable AST pattern matching using ast-grep. Searches code structure, not text. Perfect for finding function calls, class definitions, and code patterns.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'AST pattern to search for. METAVARIABLE RULES:\n' +
              '• $VAR - matches single expressions/identifiers\n' +
              '• $_ - anonymous single metavariable\n' +
              '• $$$NAME - matches multiple nodes (must be named)\n' +
              '• NEVER use bare $$$ (will be rejected)\n\n' +
              'EXAMPLES BY ARGUMENT COUNT:\n' +
              '• console.log($ARG) - exactly 1 argument\n' +
              '• console.log($A, $B) - exactly 2 arguments\n' +
              '• console.log($A, $B, $C) - exactly 3 arguments\n' +
              '• console.log($$$ARGS) - any number of arguments\n' +
              '• console.log($FIRST, $$$REST) - first + remaining args\n\n' +
              'OTHER PATTERNS:\n' +
              '• function $NAME($$$PARAMS) { $$$BODY } - functions\n' +
              '• class $NAME { $$$METHODS } - classes\n' +
              '• $OBJ.$METHOD($$$ARGS) - method calls\n' +
              '• if ($COND) { $$$BODY } - conditionals'
          },
          code: {
            type: 'string',
            description: 'Search inline code directly. When using this, you MUST also specify language parameter. Recommended for testing specific code snippets.'
          },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File or directory paths to search. If not specified, searches current directory. Can be specific files like ["src/index.js"] or directories like ["src/", "tests/"].'
          },
          language: {
            type: 'string',
            description: 'Programming language. Required when using code parameter. Supported: javascript, typescript, python, java, rust, go, etc. Also accepts aliases: js, ts, py.'
          },
          context: {
            type: 'number',
            default: 3,
            description: 'Number of lines to show before and after each match for context'
          },
          maxMatches: {
            type: 'number',
            default: 100,
            description: 'Maximum number of matches to return (prevents overwhelming output)'
          },
          timeoutMs: {
            type: 'number',
            default: 30000,
            description: 'Search timeout in milliseconds'
          }
        },
        required: ['pattern'],
        additionalProperties: false
      }
    };
  }
}