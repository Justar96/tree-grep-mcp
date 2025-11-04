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

    // Validate replacement
    if (!params.replacement || typeof params.replacement !== 'string') {
      throw new ValidationError('Replacement is required and must be a string');
    }

    const replacementValidation = PatternValidator.validatePattern(params.replacement, params.language);
    if (!replacementValidation.valid) {
      throw new ValidationError(
        `Invalid replacement: ${replacementValidation.errors.join('; ')}`,
        { errors: replacementValidation.errors }
      );
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

    // Log warnings if any
    if (warnings) {
      console.error('Metavariable warnings:', warnings.join('; '));
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
      } else if (line.includes('│-') || line.includes('│+')) {
        if (line.includes('│-')) changeCount++;
        diffContent += line + '\n';
      } else if (/^\s*\d+\s+\d+│/.test(line)) {
        // Valid context line with Windows-style line numbers (e.g., "1 1│ code")
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
      description: `Perform structural code replacements using AST pattern matching.

WARNING: This tool can modify files! Always use dryRun=true (default) first.

WHEN TO USE THIS TOOL:
• Automated refactoring (rename functions, change APIs, update patterns)
• Code modernization (convert old syntax to new syntax)
• Bulk updates across multiple files
• Testing replacement patterns before creating formal rules

WORKFLOW RECOMMENDATION:
1. Test pattern with ast_search first to see what matches
2. Run ast_replace with dryRun=true (default) to preview changes
3. Review the diff output carefully
4. Run with dryRun=false only after confirming changes are correct

METAVARIABLE RULES:
• Pattern and replacement MUST use the same metavariable names
• $VAR in pattern can be used as $VAR in replacement
• $$$MULTI in pattern can be used as $$$MULTI in replacement
• You can reorder, duplicate, or omit metavariables in replacement
• NEVER use bare $$$ - always name multi-node metavariables

ADDITIONAL METAVARIABLE CONSTRAINTS:
1. $_ (anonymous) cannot be referenced in replacements - use only for matching in patterns
2. $NAME must be used as a complete AST node unit and must be named (not bare $)
3. All metavariables must correspond to complete, valid AST nodes in the target language
4. Multi-node $$$NAME must always be named - bare $$$ is rejected

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

5. Adding/removing arguments:
   Pattern: "logger.log($MSG)"
   Replacement: "logger.log('INFO', $MSG)"

6. Wrapping code:
   Pattern: "$EXPR"
   Replacement: "await $EXPR"
   (Note: Be specific with pattern to avoid matching everything!)

7. Reordering:
   Pattern: "compare($A, $B)"
   Replacement: "compare($B, $A)"

PATH VALIDATION:
• All paths are validated to be within the workspace root (prevents directory escape attacks)
• Omitting paths parameter defaults to current workspace root directory (".")
• Paths can be relative (e.g., "src/") or absolute (must be within workspace)
• Invalid paths (outside workspace, non-existent) will fail with ValidationError
• Example: paths: ["src/components"] applies changes only to that directory
• Example: omit paths entirely to apply changes to the entire workspace

MODES OF OPERATION:

1. Inline Code Mode (RECOMMENDED FOR TESTING):
   - Use code parameter with language
   - **IMPORTANT: Language is REQUIRED when using code parameter - the tool will fail with ValidationError if omitted**
   - Safe way to test replacement patterns
   - Minimal working example:
     {
       pattern: "console.log($ARG)",
       replacement: "logger.info($ARG)",
       code: "console.log('test');",
       language: "javascript"
     }
   - Without language parameter: ValidationError: "Language required for inline code"

2. File Mode (FOR ACTUAL CHANGES):
   - Specify paths or omit for current directory
   - Language is optional but recommended
   - ALWAYS test with dryRun=true first
   - Example: {
       pattern: "var $NAME = $VALUE",
       replacement: "const $NAME = $VALUE",
       paths: ["src/"],
       language: "javascript",
       dryRun: false  // Only after reviewing dry-run output!
     }

DRY-RUN BEHAVIOR:
• dryRun=true (DEFAULT): Shows diff preview, no files modified
• dryRun=false: Applies changes to files immediately
• Output includes file paths, number of changes, and diff preview
• Review ALL changes before setting dryRun=false

DIFF PARSING CAVEATS:
• Diff previews are parsed heuristically and may miscount changes in edge cases
• Change counts are approximate - verify with raw CLI diff output when precision matters
• For large-scale replacements, prefer smaller targeted passes to validate changes
• The parser tracks '│-' markers to estimate change counts
• Edge cases: Complex diffs with unusual formatting may have inaccurate counts
• Recommendation: Review the full diff preview text, not just the count

OUTPUT FORMAT:
• changes: Array of change objects with file, matches, preview, and applied status
• skippedLines: Top-level count of any unexpected diff lines that were skipped during parsing
• summary: Statistics object with totalChanges, filesModified, skippedLines, dryRun, warnings
• skippedLines is available both at top-level and in summary for consistency

COMMON PITFALLS:
• Forgetting to set language parameter (required for inline code)
• Using different metavariable names in pattern vs replacement
• Not testing with dryRun first
• Overly broad patterns that match unintended code
• Using bare $$$ instead of named $$$ARGS

ERROR PREVENTION:
• Tool validates metavariable naming (rejects bare $$$)
• Workspace path validation prevents escaping project directory
• Timeout protection for large-scale replacements
• Diff preview helps catch unintended changes

MCP→CLI PARAMETER MAPPING:
This tool maps MCP parameters to ast-grep CLI flags as follows:
• pattern → --pattern <value>
• replacement → --rewrite <value>
• language → --lang <value>
• code → --stdin (with stdin input)
• paths → positional arguments (file/directory paths)
• dryRun → if false, adds --update-all flag
• timeoutMs → process timeout (not a CLI flag)

Example CLI equivalent:
  MCP: { pattern: "var $N = $V", replacement: "const $N = $V", paths: ["src/"], dryRun: true }
  CLI: ast-grep run --pattern "var $N = $V" --rewrite "const $N = $V" src/
  (dry-run is default; add --update-all to apply changes)

TIMEOUT GUIDANCE:
• Default timeout: 60000ms (60 seconds) - higher than search due to rewriting overhead
• Timeouts include file parsing, pattern matching, rewriting, and I/O operations
• Recommended timeouts by repo size:
  - Small repos (<1000 files): 60000ms (default)
  - Medium repos (1000-10000 files): 120000-180000ms
  - Large repos (>10000 files): 180000-300000ms
• If timeouts occur: narrow paths, specify language, or break into smaller replacement passes
• Maximum allowed: 300000ms (5 minutes)

LIMITATIONS:
• Cannot add/remove structural elements (e.g., can't add new function parameters without matching existing ones)
• Replacement must be valid syntax in target language
• Complex transformations may require multiple passes
• Some edge cases may need manual review`,

      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'AST pattern to match. Use $VAR for single nodes, $$$NAME for multiple. Examples: "console.log($ARG)", "var $NAME = $VALUE"'
          },
          replacement: {
            type: 'string',
            description: 'Replacement template using same metavariables as pattern. Examples: "logger.info($ARG)", "const $NAME = $VALUE"'
          },
          code: {
            type: 'string',
            description: 'Apply replacement to inline code (requires language). Recommended for testing before applying to files.'
          },
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths to modify (default: current directory). Paths validated for security.'
          },
          language: {
            type: 'string',
            description: 'Programming language (required for inline code): javascript/js, typescript/ts, python/py, etc.'
          },
          dryRun: {
            type: 'boolean',
            default: true,
            description: 'Preview changes without modifying files (default: true). Set false to apply changes after reviewing preview.'
          },
          timeoutMs: {
            type: 'number',
            default: 60000,
            description: 'Timeout in milliseconds (1000-300000)'
          }
        },
        required: ['pattern', 'replacement']
      }
    };
  }
}