import { AstGrepBinaryManager } from '../core/binary-manager.js';
import { WorkspaceManager } from '../core/workspace-manager.js';
import { ValidationError, ExecutionError } from '../types/errors.js';
import { PatternValidator, ParameterValidator } from '../utils/validation.js';

/**
 * Direct replace tool that calls ast-grep run --rewrite with minimal overhead
 */
export class ReplaceTool {
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

    // Log pattern warnings if any - log each warning individually for better test assertions
    if (patternValidation.warnings && patternValidation.warnings.length > 0) {
      for (const warning of patternValidation.warnings) {
        console.error(`Warning: ${warning}`);
      }
    }

    // Validate replacement
    // Note: Empty string is valid (deletes matched pattern)
    if (params.replacement === undefined || params.replacement === null || typeof params.replacement !== 'string') {
      throw new ValidationError('Replacement is required and must be a string');
    }

    // Only validate replacement pattern if non-empty
    // Empty replacement is valid for pattern deletion
    if (params.replacement.length > 0) {
      const replacementValidation = PatternValidator.validatePattern(params.replacement, params.language);
      if (!replacementValidation.valid) {
        throw new ValidationError(
          `Invalid replacement: ${replacementValidation.errors.join('; ')}`,
          { errors: replacementValidation.errors }
        );
      }
    }

    // Validate metavariable consistency between pattern and replacement
    // This ensures all metavariables used in replacement are defined in pattern
    // Example: pattern="foo($A)" with replacement="bar($B)" will fail
    // Unused pattern metavariables generate warnings (may be intentional)
    const metavarValidation = PatternValidator.compareMetavariables(params.pattern, params.replacement);
    if (!metavarValidation.valid) {
      throw new ValidationError(
        `Metavariable mismatch: ${metavarValidation.errors.join('; ')}`,
        { errors: metavarValidation.errors }
      );
    }

    // Capture warnings for API consumers
    const warnings = metavarValidation.warnings && metavarValidation.warnings.length > 0
      ? metavarValidation.warnings
      : undefined;

    // Log warnings if any - log each warning individually for better test assertions
    if (warnings) {
      for (const warning of warnings) {
        console.error(`Warning: ${warning}`);
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
        const errorDetail = errors.length > 0 ? `: ${errors[0]}` : '';
        throw new ValidationError(`Invalid paths${errorDetail}`, { errors });
      }
      args.push(...resolvedPaths);
    }

    try {
      const result = await this.binaryManager.executeAstGrep(args, executeOptions);
      return this.parseResults(result.stdout, params, warnings);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ExecutionError(`Replace failed: ${message}`);
    }
  }

  private parseResults(stdout: string, params: any, warnings?: string[]): any {
    const changes: any[] = [];

    if (!stdout.trim()) {
      return {
        changes,
        skippedLines: 0,
        summary: {
          totalChanges: 0,
          filesModified: 0,
          skippedLines: 0,
          dryRun: params.dryRun !== false,
          ...(warnings && warnings.length > 0 ? { warnings } : {})
        }
      };
    }

    // Parse diff output - very simple approach
    const lines = stdout.split('\n');
    let skippedLines = 0;
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
      } else if (line.includes('│ -') || line.includes('│ +') || line.includes('│-') || line.includes('│+')) {
        // Change lines can have format: "3    │ -code" or "   3 │ +code"
        if (line.includes('│ -') || line.includes('│-')) changeCount++;
        diffContent += line + '\n';
      } else if (/^\s*\d+\s+\d+\s*│/.test(line)) {
        // Valid context line with line numbers (e.g., "1  1 │ code" or "1  1│ code")
        diffContent += line + '\n';
      } else if (line.trim() === '' || /^\s+$/.test(line) || line.startsWith('@@') ||
                 line.startsWith('diff --git') || line.startsWith('index') ||
                 line.startsWith('---') || line.startsWith('+++')) {
        // Valid formatting: empty lines, whitespace, diff markers, or diff metadata
        diffContent += line + '\n';
      } else {
        // Unexpected line that doesn't match any known diff pattern
        skippedLines++;
        console.error(`Warning: Skipped unexpected diff line: ${line.substring(0, 100)}...`);
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

    // Log summary warning if any lines were skipped
    if (skippedLines > 0) {
      console.error(`Warning: Skipped ${skippedLines} unexpected diff lines out of ${lines.length} total lines`);
    }

    return {
      changes,
      skippedLines,
      summary: {
        totalChanges: changes.reduce((sum, c) => sum + c.matches, 0),
        filesModified: changes.length,
        skippedLines,
        dryRun: params.dryRun !== false,
        ...(warnings && warnings.length > 0 ? { warnings } : {})
      }
    };
  }

  static getSchema() {
    return {
      name: 'ast_replace',
      description: `Structural code replacement using AST pattern matching. SAFE BY DEFAULT - runs in preview mode (dryRun: true) unless explicitly set to false. Returns diff preview and change statistics.

QUICK START:
Preview replacement on inline code (safe, language REQUIRED):
{ "pattern": "console.log($ARG)", "replacement": "logger.info($ARG)", "code": "console.log('test');", "language": "javascript" }

Preview replacement on files (safe):
{ "pattern": "var $NAME = $VALUE", "replacement": "const $NAME = $VALUE", "paths": ["src/"], "dryRun": true }

Apply changes after reviewing preview:
{ "pattern": "var $NAME = $VALUE", "replacement": "const $NAME = $VALUE", "paths": ["src/"], "dryRun": false }

WHEN TO USE:
• Automated refactoring (rename functions, change APIs, update patterns)
• Code modernization (convert old syntax to new syntax)
• Bulk updates across multiple files
• Testing patterns before creating rules with ast_run_rule

WHEN NOT TO USE:
• Simple text replacement → Use sed/ripgrep
• Need conditional replacements based on metavariable values → Use ast_run_rule with constraints
• Adding new elements without existing structure → Manual editing required

METAVARIABLE CONSISTENCY:
Pattern and replacement must use consistent metavariable names:
• $VAR in pattern → reuse $VAR in replacement
• $$$ARGS in pattern → reuse $$$ARGS in replacement
• Can reorder, duplicate, or omit metavariables in replacement
• $_ (anonymous) can appear in pattern but NOT in replacement
• Multi-node metavariables MUST be named (bare $$$ rejected)

COMMON REPLACEMENT PATTERNS:

1. Simple renaming:
   Pattern: "oldFunction($$$ARGS)"
   Replacement: "newFunction($$$ARGS)"

2. API migration:
   Pattern: "jQuery($SELECTOR).click($HANDLER)"
   Replacement: "document.querySelector($SELECTOR).addEventListener('click', $HANDLER)"

3. Syntax modernization:
   Pattern: "var $NAME = $VALUE"
   Replacement: "const $NAME = $VALUE"

4. Function to arrow function:
   Pattern: "function $NAME($$$PARAMS) { $$$BODY }"
   Replacement: "const $NAME = ($$$PARAMS) => { $$$BODY }"

5. Adding arguments:
   Pattern: "logger.log($MSG)"
   Replacement: "logger.log('INFO', $MSG)"

6. Reordering:
   Pattern: "compare($A, $B)"
   Replacement: "compare($B, $A)"

7. Wrapping expressions (be specific to avoid matching everything):
   Pattern: "fetch($URL)"
   Replacement: "await fetch($URL)"

ERROR RECOVERY:

If replacement fails, check these common issues:

1. "Language required for inline code"
   → Add language parameter when using code parameter
   → Example: { pattern: "$P", replacement: "$R", code: "test", language: "javascript" }

2. "Metavariable mismatch: $VAR used in replacement but not in pattern"
   → Ensure all replacement metavariables are defined in pattern
   → Example: pattern="foo($A)" replacement="bar($B)" is INVALID
   → Fix: pattern="foo($A)" replacement="bar($A)"

3. "Invalid pattern/replacement: Use named multi-node metavariables like $$ARGS"
   → Replace "$$$" with "$$$NAME"
   → Pattern and replacement must use same names

4. "Invalid paths"
   → Use relative paths within workspace
   → Paths validated against workspace root for security

5. Warning: "Metavariable $X in pattern is not used in replacement"
   → Not an error, but may be unintentional
   → Pattern captures $X but replacement omits it
   → Example: pattern="foo($A, $B)" replacement="bar($A)" (drops $B)

6. Timeout errors
   → Increase timeoutMs (default: 60000ms, max: 300000ms)
   → Narrow paths to specific directories
   → Break large replacements into smaller passes
   → Recommended by repo size:
     Small (<1K files): 60000ms (default)
     Medium (1K-10K): 120000-180000ms
     Large (>10K): 180000-300000ms

7. Empty changes array (no matches)
   → Pattern is valid but matched nothing (not an error)
   → Verify pattern syntax matches language AST
   → Try pattern on inline code first to test

DRY-RUN BEHAVIOR:
• dryRun: true (DEFAULT) → Shows diff preview, NO files modified, safe to run
• dryRun: false → Applies changes to files IMMEDIATELY, use after reviewing preview
• Output includes diff preview (when dryRun=true) or confirmation (when dryRun=false)
• ALWAYS review dry-run output before setting dryRun=false

LIMITATIONS:
• Replacement must be valid syntax for target language
• Cannot add structural elements without matching existing ones
• Complex transformations may require multiple passes
• Metavariables must be complete AST nodes ($OBJ.$PROP, not $VAR.prop)
• Paths must be within workspace root (security constraint)

OPERATION MODES:

Inline Code Mode (for testing):
• Use code parameter with language (REQUIRED)
• Safe way to test patterns before applying to files
• Example: { pattern: "console.log($A)", replacement: "logger.info($A)", code: "console.log('test');", language: "javascript" }

File Mode (for actual changes):
• Specify paths or omit for entire workspace
• Language optional but recommended for performance
• ALWAYS test with dryRun=true first
• Example: { pattern: "var $N = $V", replacement: "const $N = $V", paths: ["src/"], dryRun: true }

OUTPUT STRUCTURE:
• changes: Array of { file, matches, preview (if dryRun), applied (if not dryRun) }
• summary: { totalChanges, filesModified, dryRun, warnings (if any) }
• Diff preview shows exact line changes when dryRun=true
• Change counts are estimates - review diff preview for accuracy

PERFORMANCE:
• Default timeout: 60000ms (higher than search due to rewriting overhead)
• Specify language for faster parsing
• Use specific paths vs entire workspace
• Break large replacements into smaller targeted passes

REFERENCE - MCP to ast-grep CLI Mapping:
pattern → --pattern <value>
replacement → --rewrite <value>
language → --lang <value>
code → --stdin (with stdin input)
paths → positional arguments
dryRun: false → --update-all flag
dryRun: true (default) → no flag (preview mode)
timeoutMs → process timeout (not a CLI flag)

Example: { pattern: "var $N = $V", replacement: "const $N = $V", paths: ["src/"], dryRun: true }
CLI: ast-grep run --pattern "var $N = $V" --rewrite "const $N = $V" src/ (no --update-all = preview)`,

      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'AST pattern to match. Must use same metavariable names as replacement.'
          },
          replacement: {
            type: 'string',
            description: 'Replacement template. Reuses pattern metavariables. Can reorder, duplicate, or omit variables.'
          },
          code: {
            type: 'string',
            description: 'Inline code to modify. Requires language parameter. Use for testing patterns safely.'
          },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File/directory paths to modify within workspace. Omit for entire workspace. Security validated.'
          },
          language: {
            type: 'string',
            description: 'Programming language (js/ts/py/java/rust/go/cpp). Required for inline code, recommended for paths.'
          },
          dryRun: {
            type: 'boolean',
            description: 'If true or omitted, preview only (no files modified). If false, apply changes after review.'
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (1000-300000). Default: 60000. Increase for large repos.'
          }
        },
        required: ['pattern', 'replacement'],
        additionalProperties: false
      }
    };
  }
}