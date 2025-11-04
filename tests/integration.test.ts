/**
 * Integration tests for real-world workflows using SearchTool, ReplaceTool, and ScanTool
 * 
 * This test suite validates end-to-end functionality using actual tool execution.
 * Tests use both inline code samples and file-based fixtures for comprehensive coverage.
 * 
 * Requirements:
 * - ast-grep must be installed and available (via npm install -g @ast-grep/cli)
 * - Tests assume ast-grep is accessible via system PATH
 * - Set INTEGRATION_TESTS=1 environment variable to enforce in CI
 * 
 * Test Coverage:
 * - Search-then-replace workflows (4 tests: inline + file-based)
 * - Rule creation with constraints and fixes (4 tests)
 * - Multi-language support (6 tests for JS, TS, Python, Rust with aliases)
 * - Error handling (10 tests for validation errors)
 * - Edge cases and robustness (7 tests)
 * 
 * Skipping Behavior:
 * - Tests gracefully skip if ast-grep is not available (unless INTEGRATION_TESTS=1 is set)
 * - Skip decision is made at module load time, not at runtime
 * - Use describe.skip to properly skip entire test suites
 * 
 * Uses Bun's test framework for fast, reliable test execution.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { spawnSync } from 'child_process';
import { SearchTool } from '../src/tools/search.js';
import { ReplaceTool } from '../src/tools/replace.js';
import { ScanTool } from '../src/tools/scan.js';
import { AstGrepBinaryManager } from '../src/core/binary-manager.js';
import { WorkspaceManager } from '../src/core/workspace-manager.js';
import { ValidationError, ExecutionError, BinaryError } from '../src/types/errors.js';

// ============================================
// Module-Load-Time Skip Decision
// ============================================

// Check if INTEGRATION_TESTS=1 is set (CI enforcement mode)
const RUN_INTEGRATION = process.env.INTEGRATION_TESTS === '1';

// Synchronously check if ast-grep is available
function checkAstGrepAvailable(): boolean {
  try {
    const result = spawnSync('ast-grep', ['--version'], { stdio: 'ignore' });
    return result.status === 0;
  } catch {
    return false;
  }
}

const HAS_SG = checkAstGrepAvailable();
const SHOULD_SKIP = !RUN_INTEGRATION && !HAS_SG;

// Log skip decision at module load time
if (SHOULD_SKIP) {
  console.error('⚠️  ast-grep binary not found - skipping integration tests');
  console.error('   To run integration tests, install ast-grep: npm install -g @ast-grep/cli');
  console.error('   Or set INTEGRATION_TESTS=1 to enforce in CI');
} else if (RUN_INTEGRATION && !HAS_SG) {
  console.error('❌ INTEGRATION_TESTS=1 is set but ast-grep is not available');
  throw new Error('ast-grep is required when INTEGRATION_TESTS=1 but was not found in PATH');
}

// ============================================
// Test Setup and Shared Instances
// ============================================

// Only declare these when not skipping
let binaryManager: AstGrepBinaryManager | undefined;
let workspaceManager: WorkspaceManager | undefined;
let searchTool: SearchTool | undefined;
let replaceTool: ReplaceTool | undefined;
let scanTool: ScanTool | undefined;

// Only run beforeAll if not skipping
if (!SHOULD_SKIP) {
  beforeAll(async () => {
    // Initialize binary manager with system installation
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();

    // Initialize workspace manager (uses process.cwd() by default)
    workspaceManager = new WorkspaceManager();

    // Create tool instances
    searchTool = new SearchTool(binaryManager, workspaceManager);
    replaceTool = new ReplaceTool(binaryManager, workspaceManager);
    scanTool = new ScanTool(workspaceManager, binaryManager);

    console.error('Integration test setup complete:');
    console.error(`  ast-grep binary: ${binaryManager.getBinaryPath()}`);
    console.error(`  Workspace root: ${workspaceManager.getWorkspaceRoot()}`);
  });
}

// ============================================
// Search-Then-Replace Workflow Tests
// ============================================

const describeSearchReplace = SHOULD_SKIP ? describe.skip : describe;

describeSearchReplace('Search-Then-Replace Workflow', () => {
  test('JavaScript console.log to logger.info (inline)', async () => {
    // Ensure tools are initialized
    if (!searchTool || !replaceTool) throw new Error('Tools not initialized');

    // Define inline JavaScript code with multiple console.log calls
    const code = `
function processData(data) {
  console.log("Processing data:", data);
  const result = data.map(x => x * 2);
  console.log("Result:", result);
  return result;
}

console.log("Starting application");
`;

      // Step 1: Search for console.log patterns
      const searchResult = await searchTool.execute({
        pattern: 'console.log($$$ARGS)',
        code,
        language: 'javascript'
      });

      // Comment 5: Use relational checks and capture counts for comparison
      expect(searchResult.matches.length).toBeGreaterThanOrEqual(1);
      expect(searchResult.summary.skippedLines).toBe(0);
      const searchCount = searchResult.summary.totalMatches;

      // Step 2: Replace with logger.info in dry-run mode
      const replaceResult = await replaceTool.execute({
        pattern: 'console.log($$$ARGS)',
        replacement: 'logger.info($$$ARGS)',
        code,
        language: 'javascript',
        dryRun: true
      });

      // Comment 4 & 5: Improved assertions with diff markers and count comparison
      expect(replaceResult.summary.dryRun).toBe(true);
      expect(replaceResult.summary.totalChanges).toBe(searchCount);
      expect(replaceResult.summary.filesModified).toBeGreaterThan(0);
      expect(replaceResult.changes.length).toBeGreaterThan(0);
      expect(replaceResult.changes[0].preview).toBeDefined();
      // Comment 4: Verify diff markers in preview
      expect(replaceResult.changes[0].preview).toContain('│-');
      expect(replaceResult.changes[0].preview).toContain('│+');
      expect(replaceResult.changes[0].matches).toBeGreaterThan(0);
      expect(replaceResult.summary.skippedLines).toBe(0);
    });

    // Comment 1: Add file-based test using fixtures
    test('JavaScript console.log to logger.info (file-based)', async () => {
      // Step 1: Search in fixture files
      const searchResult = await searchTool.execute({
        pattern: 'console.log($$$ARGS)',
        paths: ['tests/fixtures/js/'],
        language: 'javascript'
      });

      // Comment 5: Use relational checks
      expect(searchResult.matches.length).toBeGreaterThanOrEqual(1);
      expect(searchResult.summary.skippedLines).toBe(0);
      const searchCount = searchResult.summary.totalMatches;

      // Step 2: Replace in fixture files (dry-run)
      const replaceResult = await replaceTool.execute({
        pattern: 'console.log($$$ARGS)',
        replacement: 'logger.info($$$ARGS)',
        paths: ['tests/fixtures/js/'],
        language: 'javascript',
        dryRun: true
      });

      // Comment 4 & 5: Verify counts match and check diff markers
      expect(replaceResult.summary.dryRun).toBe(true);
      expect(replaceResult.summary.totalChanges).toBe(searchCount);
      expect(replaceResult.summary.filesModified).toBeGreaterThan(0);
      expect(replaceResult.changes.length).toBeGreaterThan(0);
      if (replaceResult.changes[0].preview) {
        expect(replaceResult.changes[0].preview).toContain('│-');
        expect(replaceResult.changes[0].preview).toContain('│+');
      }
      expect(replaceResult.changes[0].matches).toBeGreaterThan(0);
    });

    test('TypeScript var to const modernization', async () => {
      // Define inline TypeScript code with var declarations
      const code = `
var userName = "Alice";
var userAge = 30;
const isActive = true;
var userEmail = "alice@example.com";
`;

      // Search for var declarations
      const searchResult = await searchTool.execute({
        pattern: 'var $NAME = $VALUE',
        code,
        language: 'typescript'
      });

      // Comment 5: Use relational checks and capture count
      expect(searchResult.matches.length).toBeGreaterThanOrEqual(1);
      const searchCount = searchResult.summary.totalMatches;

      // Replace with const in dry-run mode
      const replaceResult = await replaceTool.execute({
        pattern: 'var $NAME = $VALUE',
        replacement: 'const $NAME = $VALUE',
        code,
        language: 'typescript',
        dryRun: true
      });

      // Comment 4 & 5: Improved assertions
      expect(replaceResult.summary.totalChanges).toBe(searchCount);
      expect(replaceResult.changes.length).toBeGreaterThan(0);
      expect(replaceResult.changes[0].preview).toBeDefined();
      expect(replaceResult.changes[0].preview).toContain('│-');
      expect(replaceResult.changes[0].preview).toContain('│+');
      expect(replaceResult.changes[0].matches).toBeGreaterThan(0);
    });

    test('Verify metavariable preservation and reordering', async () => {
      // Use pattern with multiple metavariables
      const code = `
function add(a, b) {
  return a + b;
}

function multiply(x, y) {
  return x * y;
}
`;

      // Search for function definitions
      const searchResult = await searchTool.execute({
        pattern: 'function $NAME($ARG1, $ARG2) { $$$BODY }',
        code,
        language: 'javascript'
      });

      // Comment 5: Use relational check
      expect(searchResult.matches.length).toBeGreaterThanOrEqual(1);
      const searchCount = searchResult.summary.totalMatches;

      // Replace with reordered arguments (demonstration only - not typical use case)
      const replaceResult = await replaceTool.execute({
        pattern: 'function $NAME($ARG1, $ARG2) { $$$BODY }',
        replacement: 'function $NAME($ARG2, $ARG1) { $$$BODY }',
        code,
        language: 'javascript',
        dryRun: true
      });

    // Comment 4 & 5: Verify with count comparison and diff markers
    expect(replaceResult.summary.totalChanges).toBe(searchCount);
    expect(replaceResult.changes[0].preview).toBeDefined();
    expect(replaceResult.changes[0].preview).toContain('│-');
    expect(replaceResult.changes[0].preview).toContain('│+');
    expect(replaceResult.changes[0].matches).toBeGreaterThan(0);
  });
});

// ============================================
// Rule Creation with Constraints and Fixes Tests
// ============================================

const describeRuleCreation = SHOULD_SKIP ? describe.skip : describe;

describeRuleCreation('Rule Creation with Constraints and Fixes', () => {
  test('Basic rule with fix (no constraints)', async () => {
    const result = await scanTool.execute({
      id: 'no-var',
      language: 'javascript',
      pattern: 'var $NAME = $VALUE',
      message: 'Use const or let instead of var',
      severity: 'warning',
      fix: 'const $NAME = $VALUE',
      code: 'var x = 1; const y = 2; var z = 3;'
    });

    // Assert YAML structure
    expect(result.yaml).toContain('id: no-var');
    expect(result.yaml).toContain('pattern:');
    expect(result.yaml).toContain('fix:');

    // Assert findings
    expect(result.scan.findings.length).toBe(2);
    expect(result.scan.findings[0].severity).toBe('warning');
    expect(result.scan.findings[0].fix).toBeDefined();
    expect(result.scan.summary.warnings).toBe(2);
    expect(result.scan.summary.skippedLines).toBe(0);
  });

  test('Rule with regex constraint', async () => {
    const result = await scanTool.execute({
      id: 'test-var-only',
      language: 'javascript',
      pattern: 'const $NAME = $VALUE',
      where: [
        { metavariable: 'NAME', regex: '^test' }
      ],
      code: 'const testVar = 1; const myVar = 2; const testData = 3;'
    });

    // Should only match names starting with 'test'
    expect(result.scan.findings.length).toBe(2);
    expect(result.yaml).toContain('constraints:');
    expect(result.yaml).toContain('regex:');
  });

  test('Rule with equals constraint (converted to anchored regex)', async () => {
    const result = await scanTool.execute({
      id: 'console-log-only',
      language: 'javascript',
      pattern: '$OBJ.$METHOD($$$ARGS)',
      where: [
        { metavariable: 'OBJ', equals: 'console' },
        { metavariable: 'METHOD', equals: 'log' }
      ],
      code: 'console.log("a"); console.error("b"); logger.log("c");'
    });

    // Should only match console.log
    expect(result.scan.findings.length).toBe(1);
    expect(result.yaml).toContain('constraints:');
    // equals is converted to anchored regex ^console$
    expect(result.yaml).toContain('^console$');
    expect(result.yaml).toContain('^log$');
  });

  test('Rule with fix template using metavariables', async () => {
    const result = await scanTool.execute({
      id: 'reorder-assert',
      language: 'javascript',
      pattern: 'assertEquals($EXPECTED, $ACTUAL)',
      fix: 'assertEquals($ACTUAL, $EXPECTED)',
      message: 'Arguments are in wrong order',
      code: 'assertEquals(5, result); assertEquals("hello", output);'
    });

      // Comment 5: Use relational checks
      expect(result.scan.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.scan.findings[0].fix).toBeDefined();
    expect(result.yaml).toContain('fix:');
  });
});

// ============================================
// Multi-Language Support Tests
// ============================================

const describeMultiLanguage = SHOULD_SKIP ? describe.skip : describe;

describeMultiLanguage('Multi-Language Support', () => {
  test('JavaScript function calls', async () => {
      const code = `
const result = processData(input);
logger.log("Processing");
calculate(1, 2, 3);
`;

      const result = await searchTool.execute({
        pattern: '$FUNC($$$ARGS)',
        code,
        language: 'javascript'
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.summary.skippedLines).toBe(0);
    });

    // Comment 1: Add file-based test for TypeScript
    test('TypeScript class definitions (file-based)', async () => {
      const result = await searchTool.execute({
        pattern: 'class $NAME { $$$MEMBERS }',
        paths: ['tests/fixtures/ts/'],
        language: 'typescript'
      });

      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.summary.skippedLines).toBe(0);
    });

    // Comment 6: Test Python with both full name and alias
    test('Python function definitions with both aliases', async () => {
      const code = `
def greet(name):
    print(f"Hello, {name}")

def calculate(x, y):
    return x + y
`;

      // Test with full name 'python' (canonical form that works with ast-grep)
      const result1 = await searchTool.execute({
        pattern: 'def $NAME($$$PARAMS): $$$BODY',
        code,
        language: 'python'
      });

      // Test with alias 'py' (may or may not work depending on ast-grep version)
      const result2 = await searchTool.execute({
        pattern: 'def $NAME($$$PARAMS): $$$BODY',
        code,
        language: 'py'
      });

      // Both should work after normalization
      expect(result1.matches.length).toBeGreaterThan(0);
      expect(result2.matches.length).toBeGreaterThan(0);
      expect(result1.summary.skippedLines).toBe(0);
      expect(result2.summary.skippedLines).toBe(0);
    });

    // Comment 6: Test Rust with both full name and alias
    test('Rust function definitions with both aliases', async () => {
      const code = `
fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn main() {
    println!("Hello");
}
`;

      // Test with full name 'rust' (canonical form that works with ast-grep)
      const result1 = await searchTool.execute({
        pattern: 'fn $NAME($$$PARAMS) { $$$BODY }',
        code,
        language: 'rust'
      });

      // Test with alias 'rs' (may or may not work depending on ast-grep version)
      const result2 = await searchTool.execute({
        pattern: 'fn $NAME($$$PARAMS) { $$$BODY }',
        code,
        language: 'rs'
      });

      // Both should work after normalization
      expect(result1.matches.length).toBeGreaterThan(0);
      expect(result2.matches.length).toBeGreaterThan(0);
      expect(result1.summary.skippedLines).toBe(0);
      expect(result2.summary.skippedLines).toBe(0);
    });

    // Comment 3: Test JavaScript alias normalization
    test('Language normalization (javascript -> js)', async () => {
      const code = 'const x = 1;';

      // Test with full name
      const result1 = await searchTool.execute({
        pattern: 'const $NAME = $VALUE',
        code,
        language: 'javascript'
      });

      // Test with alias
      const result2 = await searchTool.execute({
        pattern: 'const $NAME = $VALUE',
        code,
        language: 'js'
      });

      // Both should work and return identical results
      expect(result1.matches.length).toBe(result2.matches.length);
      expect(result1.summary.skippedLines).toBe(0);
      expect(result2.summary.skippedLines).toBe(0);
    });

    // Comment 3: Extended TypeScript alias normalization test
    test('TypeScript language normalization (typescript -> ts)', async () => {
      const code = 'const x: number = 1;';

      // Test with full name 'typescript'
      const result1 = await searchTool.execute({
        pattern: 'const $NAME: $TYPE = $VALUE',
        code,
        language: 'typescript'
      });

      // Test with alias 'ts'
      const result2 = await searchTool.execute({
        pattern: 'const $NAME: $TYPE = $VALUE',
        code,
        language: 'ts'
      });

      // Both should return identical match counts and zero skipped lines
      expect(result1.matches.length).toBe(result2.matches.length);
      expect(result1.summary.totalMatches).toBe(result2.summary.totalMatches);
    expect(result1.summary.skippedLines).toBe(0);
    expect(result2.summary.skippedLines).toBe(0);
  });
});

// ============================================
// Error Handling Tests
// ============================================

const describeErrorHandling = SHOULD_SKIP ? describe.skip : describe;

describeErrorHandling('Error Handling', () => {
  test('Invalid pattern: bare $ metavariable', async () => {
    try {
      await searchTool.execute({
        pattern: 'foo($$$)',
        code: 'foo(1, 2, 3)',
        language: 'javascript'
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/bare \$\$\$/i);
    }
  });

  test('Invalid metavariable name (lowercase)', async () => {
    try {
      await searchTool.execute({
        pattern: 'foo($invalid)',
        code: 'foo(1)',
        language: 'javascript'
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/UPPER_CASE|invalid metavariable/i);
    }
  });

  test('Metavariable mismatch in replacement', async () => {
    try {
      await replaceTool.execute({
        pattern: 'foo($A)',
        replacement: 'bar($B)',
        code: 'foo(1)',
        language: 'javascript'
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('$B');
      expect((error as ValidationError).message).toMatch(/not defined in pattern/i);
    }
  });

  test('Invalid context parameter (exceeds max)', async () => {
    try {
      await searchTool.execute({
        pattern: 'foo($A)',
        code: 'foo(1)',
        language: 'javascript',
        context: 150
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/100|exceed/i);
    }
  });

  test('Invalid maxMatches parameter (below minimum)', async () => {
    try {
      await searchTool.execute({
        pattern: 'foo($A)',
        code: 'foo(1)',
        language: 'javascript',
        maxMatches: 0
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/at least 1|positive/i);
    }
  });

  test('Invalid timeout parameter (below minimum)', async () => {
    try {
      await searchTool.execute({
        pattern: 'foo($A)',
        code: 'foo(1)',
        language: 'javascript',
        timeoutMs: 500
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/1000|at least/i);
    }
  });

  test('Missing language for inline code', async () => {
    try {
      await searchTool.execute({
        pattern: 'foo($A)',
        code: 'foo(1)'
        // Missing language parameter
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/language required/i);
    }
  });

  test('Invalid rule ID format (not kebab-case)', async () => {
    try {
      await scanTool.execute({
        id: 'Invalid_Rule_ID',
        language: 'javascript',
        pattern: 'foo($A)',
        code: 'foo(1)'
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/kebab-case/i);
    }
  });

  test('Constraint references undefined metavariable', async () => {
    try {
      await scanTool.execute({
        id: 'test-rule',
        language: 'javascript',
        pattern: 'foo($A)',
        where: [
          { metavariable: 'B', regex: 'test' }
        ],
        code: 'foo(1)'
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('B');
      expect((error as ValidationError).message).toMatch(/not in the pattern/i);
      expect((error as ValidationError).message).toContain('Available metavariables: A');
    }
  });

  test('Fix template uses undefined metavariable', async () => {
    try {
      await scanTool.execute({
        id: 'test-rule',
        language: 'javascript',
        pattern: 'foo($A)',
        fix: 'bar($B)',
        code: 'foo(1)'
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('$B');
    expect((error as ValidationError).message).toMatch(/not in the pattern/i);
    expect((error as ValidationError).message).toContain('Available metavariables: A');
  });
});

// ============================================
// Edge Cases and Robustness Tests
// ============================================

const describeEdgeCases = SHOULD_SKIP ? describe.skip : describe;

describeEdgeCases('Edge Cases and Robustness', () => {
  test('Empty search results (pattern matches nothing)', async () => {
    const result = await searchTool.execute({
      pattern: 'nonExistentFunction($$$ARGS)',
      code: 'const x = 1; const y = 2;',
      language: 'javascript'
    });

    expect(result.matches).toEqual([]);
    expect(result.summary.totalMatches).toBe(0);
    expect(result.summary.skippedLines).toBe(0);
  });

  test('Empty replacement results (pattern matches nothing)', async () => {
    const result = await replaceTool.execute({
      pattern: 'nonExistentFunction($$$ARGS)',
      replacement: 'newFunction($$$ARGS)',
      code: 'const x = 1; const y = 2;',
      language: 'javascript',
      dryRun: true
    });

    expect(result.changes).toEqual([]);
    expect(result.summary.totalChanges).toBe(0);
    expect(result.summary.dryRun).toBe(true);
  });

  test('Large inline code (near 1MB limit)', async () => {
    // Generate code approaching 1MB
    const lineCount = 10000;
    const line = 'const variable_' + 'x'.repeat(50) + ' = 1;\n';
    const largeCode = line.repeat(lineCount);

    // Should process successfully
    const result = await searchTool.execute({
      pattern: 'const $NAME = $VALUE',
      code: largeCode,
      language: 'javascript',
      maxMatches: 100
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.summary.truncated).toBe(true); // Should be truncated to maxMatches
  });

  test('Code exceeding 1MB throws ValidationError', async () => {
    // Generate code exceeding 1MB
    const largeCode = 'a'.repeat(1048577);

    try {
      await searchTool.execute({
        pattern: 'const $NAME = $VALUE',
        code: largeCode,
        language: 'javascript'
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/1MB|exceed|too large/i);
    }
  });

  test('Anonymous metavariable $_ is accepted', async () => {
    const result = await searchTool.execute({
      pattern: 'foo($_, $_, $_)',
      code: 'foo(1, 2, 3); foo("a", "b", "c");',
      language: 'javascript'
    });

    expect(result.matches.length).toBe(2);
    expect(result.summary.skippedLines).toBe(0);
  });

  test('Context parameter boundary values (0 and 100)', async () => {
    const code = 'console.log("test");';

    // Test minimum boundary
    const result1 = await searchTool.execute({
      pattern: 'console.log($$$ARGS)',
      code,
      language: 'javascript',
      context: 0
    });
    expect(result1.matches.length).toBe(1);

    // Test maximum boundary
    const result2 = await searchTool.execute({
      pattern: 'console.log($$$ARGS)',
      code,
      language: 'javascript',
      context: 100
    });
    expect(result2.matches.length).toBe(1);
  });

  test('MaxMatches truncation', async () => {
    // Create code with many matches
    const lines = Array(20).fill('console.log("test");').join('\n');

    const result = await searchTool.execute({
      pattern: 'console.log($$$ARGS)',
      code: lines,
      language: 'javascript',
      maxMatches: 5
    });

    expect(result.matches.length).toBe(5);
    expect(result.summary.truncated).toBe(true);
    expect(result.summary.totalMatches).toBeGreaterThan(5);
  });
});

/**
 * Integration Test Coverage Summary
 * 
 * Total test cases: 31 comprehensive integration tests (including file-based tests)
 * 
 * Test Categories:
 * 1. Search-Then-Replace Workflows (4 tests)
 *    - JavaScript console.log to logger.info (inline)
 *    - JavaScript console.log to logger.info (file-based with fixtures)
 *    - TypeScript var to const modernization
 *    - Metavariable preservation and reordering
 * 
 * 2. Rule Creation with Constraints and Fixes (4 tests)
 *    - Basic rule with fix
 *    - Rule with regex constraint
 *    - Rule with equals constraint
 *    - Fix template using metavariables
 * 
 * 3. Multi-Language Support (6 tests)
 *    - JavaScript function calls
 *    - TypeScript class definitions (file-based with fixtures)
 *    - Python function definitions with both aliases ('python' and 'py')
 *    - Rust function definitions with both aliases ('rust' and 'rs')
 *    - Language normalization (javascript -> js)
 *    - TypeScript language normalization (typescript -> ts)
 * 
 * 4. Error Handling (10 tests)
 *    - Invalid patterns and metavariables
 *    - Parameter validation
 *    - Constraint validation
 *    - Fix template validation
 * 
 * 5. Edge Cases and Robustness (7 tests)
 *    - Empty results
 *    - Large code handling
 *    - Anonymous metavariables
 *    - Boundary values
 *    - Truncation behavior
 * 
 * Test Requirements:
 * - ast-grep must be installed globally or available in PATH
 * - Run with: bun test tests/integration.test.ts or npm run test:integration
 * - Tests use both inline code and file-based fixtures (tests/fixtures/)
 * - Tests are independent and can run in any order
 * - Tests gracefully skip if ast-grep is not available (unless INTEGRATION_TESTS=1 is set)
 * 
 * Environment Variables:
 * - INTEGRATION_TESTS=1: Require ast-grep to be installed (fail hard if missing, useful for CI)
 * 
 * Verification Comments Implemented (Original):
 * 1. ✅ File-based fixtures added (tests/fixtures/js, ts, py, rs)
 * 2. ✅ Graceful skipping when ast-grep is missing (with INTEGRATION_TESTS=1 override for CI)
 * 3. ✅ TypeScript alias normalization coverage extended
 * 4. ✅ Diff preview assertions improved with │- and │+ markers
 * 5. ✅ Assertions made less brittle with relational checks and count comparisons
 * 6. ✅ Python and Rust tested with both full names and short aliases
 * 
 * Verification Comment Implemented (Revised):
 * 1. ✅ Module-load-time skip decision using synchronous check (spawnSync)
 *    - Skip decision made before describe blocks execute
 *    - Uses describe.skip to properly skip entire test suites
 *    - Tools only instantiated when tests will actually run
 *    - CI-enforced mode with INTEGRATION_TESTS=1 fails fast if ast-grep missing
 *    - Deterministic skipping at registration time, not runtime
 */
