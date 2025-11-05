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

import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "child_process";
import { SearchTool } from "../src/tools/search.js";
import { ReplaceTool } from "../src/tools/replace.js";
import { ScanTool } from "../src/tools/scan.js";
import { AstGrepBinaryManager } from "../src/core/binary-manager.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { ValidationError } from "../src/types/errors.js";

// ============================================
// Module-Load-Time Skip Decision
// ============================================

// Check if INTEGRATION_TESTS=1 is set (CI enforcement mode)
const RUN_INTEGRATION = process.env.INTEGRATION_TESTS === "1";

// Synchronously check if ast-grep is available
function checkAstGrepAvailable(): boolean {
  try {
    const result = spawnSync("ast-grep", ["--version"], { stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}

const HAS_SG = checkAstGrepAvailable();
const SHOULD_SKIP = !RUN_INTEGRATION && !HAS_SG;

// Log skip decision at module load time
if (SHOULD_SKIP) {
  console.error("⚠️  ast-grep binary not found - skipping integration tests");
  console.error("   To run integration tests, install ast-grep: npm install -g @ast-grep/cli");
  console.error("   Or set INTEGRATION_TESTS=1 to enforce in CI");
} else if (RUN_INTEGRATION && !HAS_SG) {
  console.error("❌ INTEGRATION_TESTS=1 is set but ast-grep is not available");
  throw new Error("ast-grep is required when INTEGRATION_TESTS=1 but was not found in PATH");
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
    // Initialize binary manager (expects ast-grep to be installed in CI)
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();

    // Initialize workspace manager (uses process.cwd() by default)
    workspaceManager = new WorkspaceManager();

    // Create tool instances
    searchTool = new SearchTool(binaryManager, workspaceManager);
    replaceTool = new ReplaceTool(binaryManager, workspaceManager);
    scanTool = new ScanTool(workspaceManager, binaryManager);

    console.error("Integration test setup complete:");
    console.error(`  ast-grep binary: ${binaryManager.getBinaryPath()}`);
    console.error(`  Workspace root: ${workspaceManager.getWorkspaceRoot()}`);
  });
}

// ============================================
// Search-Then-Replace Workflow Tests
// ============================================

const describeSearchReplace = SHOULD_SKIP ? describe.skip : describe;

describeSearchReplace("Search-Then-Replace Workflow", () => {
  test("JavaScript console.log to logger.info (inline)", async () => {
    // Ensure tools are initialized
    if (!searchTool || !replaceTool) throw new Error("Tools not initialized");

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
    const searchResult = await searchTool!.execute({
      pattern: "console.log($$$ARGS)",
      code,
      language: "javascript",
    });

    // Comment 5: Use relational checks and capture counts for comparison
    expect(searchResult.matches.length).toBeGreaterThanOrEqual(1);
    expect(searchResult.summary.skippedLines).toBe(0);
    const searchCount = searchResult.summary.totalMatches;

    // Step 2: Replace with logger.info in dry-run mode
    const replaceResult = await replaceTool!.execute({
      pattern: "console.log($$$ARGS)",
      replacement: "logger.info($$$ARGS)",
      code,
      language: "javascript",
      dryRun: true,
    });

    // Comment 4 & 5: Improved assertions with diff markers and count comparison
    expect(replaceResult.summary.dryRun).toBe(true);
    expect(replaceResult.summary.totalChanges).toBe(searchCount);
    expect(replaceResult.summary.filesModified).toBeGreaterThan(0);
    expect(replaceResult.changes.length).toBeGreaterThan(0);
    expect(replaceResult.changes[0].preview).toBeDefined();
    // Comment 4: Verify diff markers in preview
    expect(replaceResult.changes[0].preview).toContain("│-");
    expect(replaceResult.changes[0].preview).toContain("│+");
    expect(replaceResult.changes[0].matches).toBeGreaterThan(0);
    expect(replaceResult.summary.skippedLines).toBe(0);
  });

  // Comment 1: Add file-based test using fixtures
  test("JavaScript console.log to logger.info (file-based)", async () => {
    // Step 1: Search in fixture files
    const searchResult = await searchTool!.execute({
      pattern: "console.log($$$ARGS)",
      paths: ["tests/fixtures/js/"],
      language: "javascript",
    });

    // Comment 5: Use relational checks
    expect(searchResult.matches.length).toBeGreaterThanOrEqual(1);
    expect(searchResult.summary.skippedLines).toBe(0);
    const searchCount = searchResult.summary.totalMatches;

    // Step 2: Replace in fixture files (dry-run)
    const replaceResult = await replaceTool!.execute({
      pattern: "console.log($$$ARGS)",
      replacement: "logger.info($$$ARGS)",
      paths: ["tests/fixtures/js/"],
      language: "javascript",
      dryRun: true,
    });

    // Comment 4 & 5: Verify counts match and check diff markers
    expect(replaceResult.summary.dryRun).toBe(true);
    expect(replaceResult.summary.totalChanges).toBe(searchCount);
    expect(replaceResult.summary.filesModified).toBeGreaterThan(0);
    expect(replaceResult.changes.length).toBeGreaterThan(0);
    if (replaceResult.changes[0].preview) {
      expect(replaceResult.changes[0].preview).toContain("│-");
      expect(replaceResult.changes[0].preview).toContain("│+");
    }
    expect(replaceResult.changes[0].matches).toBeGreaterThan(0);
  });

  test("TypeScript var to const modernization", async () => {
    // Define inline TypeScript code with var declarations
    const code = `
var userName = "Alice";
var userAge = 30;
const isActive = true;
var userEmail = "alice@example.com";
`;

    // Search for var declarations
    const searchResult = await searchTool!.execute({
      pattern: "var $NAME = $VALUE",
      code,
      language: "typescript",
    });

    // Comment 5: Use relational checks and capture count
    expect(searchResult.matches.length).toBeGreaterThanOrEqual(1);
    const searchCount = searchResult.summary.totalMatches;

    // Replace with const in dry-run mode
    const replaceResult = await replaceTool!.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code,
      language: "typescript",
      dryRun: true,
    });

    // Comment 4 & 5: Improved assertions
    expect(replaceResult.summary.totalChanges).toBe(searchCount);
    expect(replaceResult.changes.length).toBeGreaterThan(0);
    expect(replaceResult.changes[0].preview).toBeDefined();
    expect(replaceResult.changes[0].preview).toContain("│-");
    expect(replaceResult.changes[0].preview).toContain("│+");
    expect(replaceResult.changes[0].matches).toBeGreaterThan(0);
  });

  test("Verify metavariable preservation and reordering", async () => {
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
    const searchResult = await searchTool!.execute({
      pattern: "function $NAME($ARG1, $ARG2) { $$$BODY }",
      code,
      language: "javascript",
    });

    // Comment 5: Use relational check
    expect(searchResult.matches.length).toBeGreaterThanOrEqual(1);
    const searchCount = searchResult.summary.totalMatches;

    // Replace with reordered arguments (demonstration only - not typical use case)
    const replaceResult = await replaceTool!.execute({
      pattern: "function $NAME($ARG1, $ARG2) { $$$BODY }",
      replacement: "function $NAME($ARG2, $ARG1) { $$$BODY }",
      code,
      language: "javascript",
      dryRun: true,
    });

    // Comment 4 & 5: Verify diff markers and that changes were made
    // Note: totalChanges counts diff lines, not semantic matches, so it may be > searchCount
    expect(replaceResult.summary.totalChanges).toBeGreaterThanOrEqual(searchCount);
    expect(replaceResult.changes[0].preview).toBeDefined();
    expect(replaceResult.changes[0].preview).toContain("│-");
    expect(replaceResult.changes[0].preview).toContain("│+");
    expect(replaceResult.changes[0].matches).toBeGreaterThan(0);
  });
});

// ============================================
// Rule Creation with Constraints and Fixes Tests
// ============================================

const describeRuleCreation = SHOULD_SKIP ? describe.skip : describe;

describeRuleCreation("Rule Creation with Constraints and Fixes", () => {
  test("Basic rule with fix (no constraints)", async () => {
    const result = await scanTool!.execute({
      id: "no-var",
      language: "javascript",
      pattern: "var $NAME = $VALUE",
      message: "Use const or let instead of var",
      severity: "warning",
      fix: "const $NAME = $VALUE",
      code: "var x = 1; const y = 2; var z = 3;",
    });

    // Assert YAML structure
    expect(result.yaml).toContain("id: no-var");
    expect(result.yaml).toContain("pattern:");
    expect(result.yaml).toContain("fix:");

    // Assert findings
    expect(result.scan.findings.length).toBe(2);
    expect(result.scan.findings[0].severity).toBe("warning");
    // Note: ast-grep doesn't return 'fix' in individual findings, only in the YAML rule
    expect(result.scan.summary.warnings).toBe(2);
    expect(result.scan.summary.skippedLines).toBe(0);
  });

  test("Rule with regex constraint", async () => {
    const result = await scanTool!.execute({
      id: "test-var-only",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      where: [{ metavariable: "NAME", regex: "^test" }],
      code: "const testVar = 1; const myVar = 2; const testData = 3;",
    });

    // Should only match names starting with 'test'
    expect(result.scan.findings.length).toBe(2);
    expect(result.yaml).toContain("constraints:");
    expect(result.yaml).toContain("regex:");
  });

  test("Rule with equals constraint (converted to anchored regex)", async () => {
    const result = await scanTool!.execute({
      id: "console-log-only",
      language: "javascript",
      pattern: "$OBJ.$METHOD($$$ARGS)",
      where: [
        { metavariable: "OBJ", equals: "console" },
        { metavariable: "METHOD", equals: "log" },
      ],
      code: 'console.log("a"); console.error("b"); logger.log("c");',
    });

    // Should only match console.log
    expect(result.scan.findings.length).toBe(1);
    expect(result.yaml).toContain("constraints:");
    // equals is converted to anchored regex ^console$
    expect(result.yaml).toContain("^console$");
    expect(result.yaml).toContain("^log$");
  });

  test("Rule with fix template using metavariables", async () => {
    const result = await scanTool!.execute({
      id: "reorder-assert",
      language: "javascript",
      pattern: "assertEquals($EXPECTED, $ACTUAL)",
      fix: "assertEquals($ACTUAL, $EXPECTED)",
      message: "Arguments are in wrong order",
      code: 'assertEquals(5, result); assertEquals("hello", output);',
    });

    // Comment 5: Use relational checks
    expect(result.scan.findings.length).toBeGreaterThanOrEqual(1);
    // Note: ast-grep doesn't return 'fix' in individual findings, only in the YAML rule
    expect(result.yaml).toContain("fix:");
  });
});

// ============================================
// Multi-Language Support Tests
// ============================================

const describeMultiLanguage = SHOULD_SKIP ? describe.skip : describe;

describeMultiLanguage("Multi-Language Support", () => {
  test("JavaScript function calls", async () => {
    const code = `
const result = processData(input);
logger.log("Processing");
calculate(1, 2, 3);
`;

    const result = await searchTool!.execute({
      pattern: "$FUNC($$$ARGS)",
      code,
      language: "javascript",
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.summary.skippedLines).toBe(0);
  });

  // Comment 1: Add file-based test for TypeScript
  test("TypeScript class definitions (file-based)", async () => {
    const result = await searchTool!.execute({
      pattern: "class $NAME { $$$MEMBERS }",
      paths: ["tests/fixtures/ts/"],
      language: "typescript",
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.summary.skippedLines).toBe(0);
  });

  // Comment 6: Test Python with both full name and alias
  test("Python function definitions with both aliases", async () => {
    const code = `
def greet(name):
    print(f"Hello, {name}")

def calculate(x, y):
    return x + y
`;

    // Test with full name 'python' (canonical form that works with ast-grep)
    const result1 = await searchTool!.execute({
      pattern: "def $NAME($$$PARAMS): $$$BODY",
      code,
      language: "python",
    });

    // Test with alias 'py' (may or may not work depending on ast-grep version)
    const result2 = await searchTool!.execute({
      pattern: "def $NAME($$$PARAMS): $$$BODY",
      code,
      language: "py",
    });

    // Both should work after normalization
    expect(result1.matches.length).toBeGreaterThan(0);
    expect(result2.matches.length).toBeGreaterThan(0);
    expect(result1.summary.skippedLines).toBe(0);
    expect(result2.summary.skippedLines).toBe(0);
  });

  // Comment 6: Test Rust with both full name and alias
  test("Rust function definitions with both aliases", async () => {
    const code = `
fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn main() {
    println!("Hello");
}
`;

    // Test with full name 'rust' (canonical form that works with ast-grep)
    const result1 = await searchTool!.execute({
      pattern: "fn $NAME($$$PARAMS) { $$$BODY }",
      code,
      language: "rust",
    });

    // Test with alias 'rs' (may or may not work depending on ast-grep version)
    const result2 = await searchTool!.execute({
      pattern: "fn $NAME($$$PARAMS) { $$$BODY }",
      code,
      language: "rs",
    });

    // Both should work after normalization
    expect(result1.matches.length).toBeGreaterThan(0);
    expect(result2.matches.length).toBeGreaterThan(0);
    expect(result1.summary.skippedLines).toBe(0);
    expect(result2.summary.skippedLines).toBe(0);
  });

  // Comment 3: Test JavaScript alias normalization
  test("Language normalization (javascript -> js)", async () => {
    const code = "const x = 1;";

    // Test with full name
    const result1 = await searchTool!.execute({
      pattern: "const $NAME = $VALUE",
      code,
      language: "javascript",
    });

    // Test with alias
    const result2 = await searchTool!.execute({
      pattern: "const $NAME = $VALUE",
      code,
      language: "js",
    });

    // Both should work and return identical results
    expect(result1.matches.length).toBe(result2.matches.length);
    expect(result1.summary.skippedLines).toBe(0);
    expect(result2.summary.skippedLines).toBe(0);
  });

  // Comment 3: Extended TypeScript alias normalization test
  test("TypeScript language normalization (typescript -> ts)", async () => {
    const code = "const x: number = 1;";

    // Test with full name 'typescript'
    const result1 = await searchTool!.execute({
      pattern: "const $NAME: $TYPE = $VALUE",
      code,
      language: "typescript",
    });

    // Test with alias 'ts'
    const result2 = await searchTool!.execute({
      pattern: "const $NAME: $TYPE = $VALUE",
      code,
      language: "ts",
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

describeErrorHandling("Error Handling", () => {
  test("Invalid pattern: bare $ metavariable", async () => {
    try {
      await searchTool!.execute({
        pattern: "foo($$$)",
        code: "foo(1, 2, 3)",
        language: "javascript",
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/bare \$\$\$/i);
    }
  });

  test("Invalid metavariable name (lowercase)", async () => {
    try {
      await searchTool!.execute({
        pattern: "foo($invalid)",
        code: "foo(1)",
        language: "javascript",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/UPPER_CASE|invalid metavariable/i);
    }
  });

  test("Metavariable mismatch in replacement", async () => {
    try {
      await replaceTool!.execute({
        pattern: "foo($A)",
        replacement: "bar($B)",
        code: "foo(1)",
        language: "javascript",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("$B");
      expect((error as ValidationError).message).toMatch(/not defined in pattern/i);
    }
  });

  test("Invalid context parameter (exceeds max)", async () => {
    try {
      await searchTool!.execute({
        pattern: "foo($A)",
        code: "foo(1)",
        language: "javascript",
        context: 150,
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/100|exceed/i);
    }
  });

  test("Invalid maxMatches parameter (below minimum)", async () => {
    try {
      await searchTool!.execute({
        pattern: "foo($A)",
        code: "foo(1)",
        language: "javascript",
        maxMatches: 0,
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/at least 1|positive/i);
    }
  });

  test("Invalid timeout parameter (below minimum)", async () => {
    try {
      await searchTool!.execute({
        pattern: "foo($A)",
        code: "foo(1)",
        language: "javascript",
        timeoutMs: 500,
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/1000|at least/i);
    }
  });

  test("Missing language for inline code", async () => {
    try {
      await searchTool!.execute({
        pattern: "foo($A)",
        code: "foo(1)",
        // Missing language parameter
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/language required/i);
    }
  });

  test("Invalid rule ID format (not kebab-case)", async () => {
    try {
      await scanTool!.execute({
        id: "Invalid_Rule_ID",
        language: "javascript",
        pattern: "foo($A)",
        code: "foo(1)",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/kebab-case/i);
    }
  });

  test("Constraint references undefined metavariable", async () => {
    try {
      await scanTool!.execute({
        id: "test-rule",
        language: "javascript",
        pattern: "foo($A)",
        where: [{ metavariable: "B", regex: "test" }],
        code: "foo(1)",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("B");
      expect((error as ValidationError).message).toMatch(/not in the pattern/i);
      expect((error as ValidationError).message).toContain("Available metavariables: A");
    }
  });

  test("Fix template uses undefined metavariable", async () => {
    try {
      await scanTool!.execute({
        id: "test-rule",
        language: "javascript",
        pattern: "foo($A)",
        fix: "bar($B)",
        code: "foo(1)",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("'B'");
      expect((error as ValidationError).message).toMatch(/not in the pattern/i);
      expect((error as ValidationError).message).toContain("Available metavariables: A");
    }
  });
});

// ============================================
// Edge Cases and Robustness Tests
// ============================================

const describeEdgeCases = SHOULD_SKIP ? describe.skip : describe;

describeEdgeCases("Edge Cases and Robustness", () => {
  test("Empty search results (pattern matches nothing)", async () => {
    const result = await searchTool!.execute({
      pattern: "nonExistentFunction($$$ARGS)",
      code: "const x = 1; const y = 2;",
      language: "javascript",
    });

    expect(result.matches).toEqual([]);
    expect(result.summary.totalMatches).toBe(0);
    expect(result.summary.skippedLines).toBe(0);
  });

  test("Empty replacement results (pattern matches nothing)", async () => {
    const result = await replaceTool!.execute({
      pattern: "nonExistentFunction($$$ARGS)",
      replacement: "newFunction($$$ARGS)",
      code: "const x = 1; const y = 2;",
      language: "javascript",
      dryRun: true,
    });

    expect(result.changes).toEqual([]);
    expect(result.summary.totalChanges).toBe(0);
    expect(result.summary.dryRun).toBe(true);
  });

  test("Large inline code (near 1MB limit)", async () => {
    // Generate code approaching 1MB
    const lineCount = 10000;
    const line = "const variable_" + "x".repeat(50) + " = 1;\n";
    const largeCode = line.repeat(lineCount);

    // Should process successfully
    const result = await searchTool!.execute({
      pattern: "const $NAME = $VALUE",
      code: largeCode,
      language: "javascript",
      maxMatches: 100,
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.summary.truncated).toBe(true); // Should be truncated to maxMatches
  });

  test("Code exceeding 1MB throws ValidationError", async () => {
    // Generate code exceeding 1MB
    const largeCode = "a".repeat(1048577);

    try {
      await searchTool!.execute({
        pattern: "const $NAME = $VALUE",
        code: largeCode,
        language: "javascript",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/1MB|exceed|too large/i);
    }
  });

  test("Anonymous metavariable $_ is accepted", async () => {
    const result = await searchTool!.execute({
      pattern: "foo($_, $_, $_)",
      code: 'foo(1, 2, 3); foo("a", "b", "c");',
      language: "javascript",
    });

    expect(result.matches.length).toBe(2);
    expect(result.summary.skippedLines).toBe(0);
  });

  test("Context parameter boundary values (0 and 100)", async () => {
    const code = 'console.log("test");';

    // Test minimum boundary
    const result1 = await searchTool!.execute({
      pattern: "console.log($$$ARGS)",
      code,
      language: "javascript",
      context: 0,
    });
    expect(result1.matches.length).toBe(1);

    // Test maximum boundary
    const result2 = await searchTool!.execute({
      pattern: "console.log($$$ARGS)",
      code,
      language: "javascript",
      context: 100,
    });
    expect(result2.matches.length).toBe(1);
  });

  test("MaxMatches truncation", async () => {
    // Create code with many matches
    const lines = Array(20).fill('console.log("test");').join("\n");

    const result = await searchTool!.execute({
      pattern: "console.log($$$ARGS)",
      code: lines,
      language: "javascript",
      maxMatches: 5,
    });

    expect(result.matches.length).toBe(5);
    expect(result.summary.truncated).toBe(true);
    expect(result.summary.totalMatches).toBeGreaterThan(5);
  });
});

// ============================================
// Windows Path Handling Tests
// ============================================
const describeWindowsPaths = SHOULD_SKIP ? describe.skip : describe;

describeWindowsPaths("Windows Path Handling", () => {
  test("WorkspaceManager normalizes Windows backslash paths", () => {
    if (!workspaceManager) throw new Error("WorkspaceManager not initialized");

    // Test that validatePaths normalizes backslashes to forward slashes
    const result = workspaceManager.validatePaths(["src\\fixtures"]);
    expect(result.valid).toBe(true);
    expect(result.resolvedPaths.length).toBe(1);
    // Resolved path should use forward slashes
    expect(result.resolvedPaths[0]).toContain("/");
    // Should not contain backslashes (except on Windows in the absolute portion)
    if (process.platform !== "win32") {
      expect(result.resolvedPaths[0]).not.toContain("\\");
    }
  });

  test("WorkspaceManager normalizes Windows mixed separator paths", () => {
    if (!workspaceManager) throw new Error("WorkspaceManager not initialized");

    // Test mixed separators: backslash and forward slash
    const result = workspaceManager.validatePaths(["src\\fixtures/test.js"]);
    expect(result.valid).toBe(true);
    expect(result.resolvedPaths.length).toBe(1);
    // Should normalize all separators to forward slashes
    expect(result.resolvedPaths[0]).toMatch(/src\/fixtures\/test\.js/);
  });

  test("search with paths parameter using Windows backslashes", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test with backslash paths - should succeed without ValidationError
    const result = await searchTool!.execute({
      pattern: "import",
      paths: ["tests\\fixtures"],
      language: "javascript",
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.totalMatches).toBeGreaterThanOrEqual(0);
    // No ValidationError should be thrown
  });

  test("search with paths parameter using Windows forward slashes", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test with forward slash paths (normalized form)
    const result = await searchTool!.execute({
      pattern: "import",
      paths: ["tests/fixtures"],
      language: "javascript",
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.totalMatches).toBeGreaterThanOrEqual(0);
  });

  test("search with paths parameter using mixed separators", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test with mixed separators
    const result = await searchTool!.execute({
      pattern: "import",
      paths: ["tests\\fixtures/sample.js"],
      language: "javascript",
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.totalMatches).toBeGreaterThanOrEqual(0);
  });

  test("replace with paths parameter using Windows backslashes", async () => {
    if (!replaceTool) throw new Error("ReplaceTool not initialized");

    // Test replace with backslash paths in dry-run mode
    const result = await replaceTool!.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      paths: ["tests\\fixtures"],
      language: "javascript",
      dryRun: true,
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.filesModified).toBeGreaterThanOrEqual(0);
    expect(result.summary.dryRun).toBe(true);
  });

  test("replace with paths parameter using forward slashes", async () => {
    if (!replaceTool) throw new Error("ReplaceTool not initialized");

    // Test replace with forward slash paths
    const result = await replaceTool!.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      paths: ["tests/fixtures"],
      language: "javascript",
      dryRun: true,
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.filesModified).toBeGreaterThanOrEqual(0);
    expect(result.summary.dryRun).toBe(true);
  });

  test("scan with paths parameter using Windows backslashes", async () => {
    if (!scanTool) throw new Error("ScanTool not initialized");

    // Test scan with backslash paths
    const result = await scanTool.execute({
      id: "test-rule",
      pattern: "console.log($ARG)",
      language: "javascript",
      paths: ["tests\\fixtures"],
    });

    expect(result).toBeDefined();
    expect(result.yaml).toBeDefined();
    expect(result.scan).toBeDefined();
    expect(result.scan.summary.totalFindings).toBeGreaterThanOrEqual(0);
  });

  test("WorkspaceManager handles UNC paths (Windows only)", () => {
    if (!workspaceManager) throw new Error("WorkspaceManager not initialized");

    // Skip on non-Windows platforms or guard the test
    if (process.platform !== "win32") {
      // On non-Windows, UNC paths won't be meaningful but shouldn't crash
      const result = workspaceManager.validatePaths(["\\\\server\\share\\folder"]);
      // Should either normalize or reject gracefully
      expect(result).toBeDefined();
      return;
    }

    // On Windows, test UNC path normalization
    const result = workspaceManager.validatePaths(["\\\\server\\share\\folder"]);
    expect(result).toBeDefined();
    if (result.valid) {
      // If valid, should be normalized to forward slashes
      expect(result.resolvedPaths[0]).toContain("//server/share/folder");
    }
    // UNC paths may not be reachable, so we just test they don't crash
  });

  test("Windows absolute drive-letter paths are accepted and normalized on Windows", async () => {
    // Only run this test on Windows
    if (process.platform !== "win32") {
      return;
    }

    if (!searchTool) throw new Error("SearchTool not initialized");
    if (!replaceTool) throw new Error("ReplaceTool not initialized");
    if (!scanTool) throw new Error("ScanTool not initialized");
    if (!workspaceManager) throw new Error("WorkspaceManager not initialized");

    // Test 1: SearchTool with backslash path
    const searchResult1 = await searchTool.execute({
      pattern: "import",
      paths: ["C:\\Users\\project\\src"],
      language: "javascript",
    });

    expect(searchResult1).toBeDefined();
    expect(searchResult1.summary).toBeDefined();
    expect(searchResult1.summary.totalMatches).toBeGreaterThanOrEqual(0);
    // No ValidationError should be thrown

    // Test 2: SearchTool with mixed separators
    const searchResult2 = await searchTool.execute({
      pattern: "import",
      paths: ["C:\\Users/project\\src"],
      language: "javascript",
    });

    expect(searchResult2).toBeDefined();
    expect(searchResult2.summary).toBeDefined();
    expect(searchResult2.summary.totalMatches).toBeGreaterThanOrEqual(0);

    // Test 3: ReplaceTool with backslash path (dry-run)
    const replaceResult1 = await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      paths: ["C:\\Users\\project\\src"],
      language: "javascript",
      dryRun: true,
    });

    expect(replaceResult1).toBeDefined();
    expect(replaceResult1.summary).toBeDefined();
    expect(replaceResult1.summary.filesModified).toBeGreaterThanOrEqual(0);
    expect(replaceResult1.summary.dryRun).toBe(true);

    // Test 4: ReplaceTool with mixed separators (dry-run)
    const replaceResult2 = await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      paths: ["C:\\Users/project\\src"],
      language: "javascript",
      dryRun: true,
    });

    expect(replaceResult2).toBeDefined();
    expect(replaceResult2.summary).toBeDefined();
    expect(replaceResult2.summary.filesModified).toBeGreaterThanOrEqual(0);
    expect(replaceResult2.summary.dryRun).toBe(true);

    // Test 5: ScanTool with backslash path
    const scanResult = await scanTool!.execute({
      id: "test-windows-path",
      pattern: "console.log($ARG)",
      language: "javascript",
      paths: ["C:\\Users\\project\\src"],
    });

    expect(scanResult).toBeDefined();
    expect(scanResult.yaml).toBeDefined();
    expect(scanResult.scan).toBeDefined();
    expect(scanResult.scan.summary).toBeDefined();
    expect(scanResult.scan.summary.totalFindings).toBeGreaterThanOrEqual(0);

    // Test 6: WorkspaceManager validates and normalizes to forward slashes
    const validateResult1 = workspaceManager.validatePaths(["C:\\Users\\project\\src"]);
    expect(validateResult1).toBeDefined();
    if (validateResult1.valid) {
      expect(validateResult1.resolvedPaths.length).toBe(1);
      // Should start with C:/ (normalized)
      expect(validateResult1.resolvedPaths[0]).toMatch(/^C:\//);
      // Should use forward slashes throughout
      const pathPortion = validateResult1.resolvedPaths[0].substring(3); // After C:/
      expect(pathPortion).not.toContain("\\");
    }

    // Test 7: WorkspaceManager with mixed separators
    const validateResult2 = workspaceManager.validatePaths(["C:\\Users/project\\src"]);
    expect(validateResult2).toBeDefined();
    if (validateResult2.valid) {
      expect(validateResult2.resolvedPaths.length).toBe(1);
      // Should be normalized to forward slashes
      expect(validateResult2.resolvedPaths[0]).toMatch(/^C:\//);
      // Should not contain backslashes (except possibly in Windows absolute prefix)
      const pathPortion = validateResult2.resolvedPaths[0].substring(3);
      expect(pathPortion).not.toContain("\\");
    }

    // Test 8: Verify different drive letters work
    const validateResult3 = workspaceManager.validatePaths(["D:\\Projects\\app"]);
    expect(validateResult3).toBeDefined();
    if (validateResult3.valid) {
      expect(validateResult3.resolvedPaths[0]).toMatch(/^D:\//);
    }
  });
});

// ============================================
// Cross-Platform Path Resolution Tests
// ============================================
const describeCrossPlatform = SHOULD_SKIP ? describe.skip : describe;

describeCrossPlatform("Cross-Platform Path Resolution", () => {
  test("platform detection works correctly", () => {
    // Verify platform can be detected
    const isWindows = process.platform === "win32";
    expect(typeof isWindows).toBe("boolean");
  });

  test('search with paths: ["."] uses workspace root', async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test that current directory path works
    const result = await searchTool!.execute({
      pattern: "import",
      paths: ["."],
      language: "javascript",
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.totalMatches).toBeGreaterThanOrEqual(0);
  });

  test('search with paths: ["src/"] includes trailing separator', async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test path with trailing separator
    const result = await searchTool!.execute({
      pattern: "import",
      paths: ["src/"],
      language: "javascript",
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.totalMatches).toBeGreaterThanOrEqual(0);
  });

  test('search with paths: ["src"] without trailing separator', async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test path without trailing separator
    const result = await searchTool!.execute({
      pattern: "import",
      paths: ["src"],
      language: "javascript",
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.totalMatches).toBeGreaterThanOrEqual(0);
  });

  test('search with paths: [""] empty string uses current directory', async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test empty string path (should default to current directory)
    const result = await searchTool!.execute({
      pattern: "import",
      paths: [""],
      language: "javascript",
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.totalMatches).toBeGreaterThanOrEqual(0);
  });

  test('search with paths: [".."] throws ValidationError (outside workspace)', async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test that parent directory is rejected (outside workspace)
    try {
      await searchTool!.execute({
        pattern: "import",
        paths: [".."],
        language: "javascript",
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("outside workspace");
    }
  });

  test("mixed separator paths produce consistent results", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test backslash version
    const result1 = await searchTool!.execute({
      pattern: "import",
      paths: ["tests\\fixtures"],
      language: "javascript",
    });

    // Test forward slash version (normalized)
    const result2 = await searchTool!.execute({
      pattern: "import",
      paths: ["tests/fixtures"],
      language: "javascript",
    });

    // Both should succeed and produce same results
    expect(result1.summary.totalMatches).toBe(result2.summary.totalMatches);
  });

  test("Windows absolute path on POSIX throws ValidationError", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Only run this test on non-Windows platforms
    if (process.platform === "win32") {
      // Skip on Windows - would need actual C: drive paths
      return;
    }

    // On POSIX, Windows absolute paths should be rejected
    try {
      await searchTool!.execute({
        pattern: "import",
        paths: ["C:\\Users\\project\\src"],
        language: "javascript",
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("Windows absolute path");
      expect((error as ValidationError).message).toContain("not supported on non-Windows");
    }
  });

  test("replace operation with path parameter", async () => {
    if (!replaceTool) throw new Error("ReplaceTool not initialized");

    const result = await replaceTool!.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "let $NAME = $VALUE",
      paths: ["tests/fixtures"],
      language: "javascript",
      dryRun: true,
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.filesModified).toBeGreaterThanOrEqual(0);
  });

  test("scan with path parameter", async () => {
    if (!scanTool) throw new Error("ScanTool not initialized");

    const result = await scanTool.execute({
      id: "cross-platform-test",
      pattern: "console.$METHOD($$$ARGS)",
      language: "javascript",
      message: "Console usage detected",
      paths: ["tests/fixtures"],
    });

    expect(result).toBeDefined();
    expect(result.scan.summary.totalFindings).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// Path Validation Error Tests (Windows)
// ============================================

describeCrossPlatform("Path Validation with Windows Paths", () => {
  test("blocked path C:\\Windows\\System32 throws ValidationError", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Guard: Only test on Windows where this path exists
    if (process.platform !== "win32") {
      // On non-Windows, C:\Windows\System32 would be rejected as Windows absolute path
      try {
        await searchTool!.execute({
          pattern: "import",
          paths: ["C:\\Windows\\System32"],
          language: "javascript",
        });
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        // Should mention Windows absolute path not supported on non-Windows
        expect((error as ValidationError).message).toContain("Windows absolute path");
      }
      return;
    }

    // On Windows, test that system directory is blocked
    try {
      await searchTool!.execute({
        pattern: "import",
        paths: ["C:\\Windows\\System32"],
        language: "javascript",
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const message = (error as ValidationError).message;
      // Error should contain original input path
      expect(message).toContain("C:\\Windows\\System32");
      // Should mention blocking or access denied
      expect(message.toLowerCase()).toMatch(/block|access|system directory/);
    }
  });

  test("path escaping workspace via ..\\..\\..\\etc throws ValidationError", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test that excessive parent directory traversal is rejected
    try {
      await searchTool!.execute({
        pattern: "import",
        paths: ["..\\..\\..\\etc"],
        language: "javascript",
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const message = (error as ValidationError).message;
      // Error should reference the original input
      expect(message).toContain("..\\..\\..\\etc");
      // Should mention workspace boundary violation
      expect(message.toLowerCase()).toMatch(/outside|workspace|boundary/);
    }
  });

  test("path escaping workspace via ../../../etc throws ValidationError", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test forward-slash version of parent directory escape
    try {
      await searchTool!.execute({
        pattern: "import",
        paths: ["../../../etc"],
        language: "javascript",
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const message = (error as ValidationError).message;
      // Should mention outside workspace
      expect(message.toLowerCase()).toMatch(/outside|workspace/);
    }
  });

  test("validation error handling is consistent", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Test with invalid pattern to verify error handling
    try {
      await searchTool!.execute({
        pattern: "", // Empty pattern should fail
        code: "test code",
        language: "javascript",
      });
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/Pattern.*empty|Pattern.*required/i);
    }
  });

  test("error messages are clear and actionable", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    try {
      await searchTool!.execute({
        pattern: "$$$", // Bare $$$ should fail
        code: "test code",
        language: "javascript",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const message = (error as ValidationError).message;
      expect(message).toContain("$$$");
      // Error message should reference the issue
    }
  });

  test("invalid metavariable placement detected in integration", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    try {
      await searchTool!.execute({
        pattern: "use$HOOK", // Invalid embedded metavariable
        code: "test code",
        language: "javascript",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("Invalid metavariable placement");
    }
  });

  test("language-specific warnings logged for inline code", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Pattern with decorator should generate warnings (but not fail)
    const result = await searchTool!.execute({
      pattern: "@Component",
      code: "@Component class Foo {}",
      language: "typescript",
    });

    // Should succeed but with warnings logged
    expect(result.matches).toBeDefined();
    // Warnings are logged to console.error, not returned in result
  });

  test("complexity warnings for patterns with many metavariables", async () => {
    if (!searchTool) throw new Error("SearchTool not initialized");

    // Use a valid but complex pattern (11 metavariables)
    const pattern =
      "function $NAME($A, $B, $C, $D) { const $E = $F; const $G = $H; return $I + $J; }";
    const code = "function test(a, b, c, d) { const x = 1; const y = 2; return x + y; }";

    // Should succeed but with complexity warnings logged
    const result = await searchTool!.execute({
      pattern,
      code,
      language: "javascript",
    });

    expect(result.matches).toBeDefined();
    // Warnings about complexity are logged, not returned
  });

  test("replace validation includes both pattern and replacement", async () => {
    if (!replaceTool) throw new Error("ReplaceTool not initialized");

    try {
      await replaceTool!.execute({
        pattern: "", // Empty pattern
        replacement: "foo",
        code: "test",
        language: "javascript",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("Pattern");
    }
  });

  test("scan validates rule ID format", async () => {
    if (!scanTool) throw new Error("ScanTool not initialized");

    try {
      await scanTool!.execute({
        id: "Invalid_Rule_ID", // Should be kebab-case
        pattern: "$VAR",
        language: "javascript",
        code: "test",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("Rule ID");
    }
  });

  test("scan validates required language parameter", async () => {
    if (!scanTool) throw new Error("ScanTool not initialized");

    try {
      await scanTool!.execute({
        id: "test-rule",
        pattern: "$VAR",
        language: "", // Empty language should fail
        code: "test",
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("language");
    }
  });
});

// ============================================
// Timeout Handling Tests
// ============================================

const describeTimeoutHandling = SHOULD_SKIP ? describe.skip : describe;

describeTimeoutHandling("Timeout Handling", () => {
  test("Search with very short timeout (error expected)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    // Use a timeout too short to complete (1 second)
    const result = await searchTool.execute({
      pattern: "const $NAME = $VALUE",
      paths: ["."],
      language: "javascript",
      timeoutMs: 1000,
    });

    // Even with short timeout, small searches should complete
    // This test verifies timeout parameter is accepted and used
    expect(result.matches).toBeDefined();
  });

  test("Process cleanup on timeout (error expected, no lingering processes)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    // Create a large temporary directory with many files to force timeout
    const { mkdtemp, writeFile, rm } = await import("fs/promises");
    const { join } = await import("path");
    const { tmpdir } = await import("os");
    const { spawnSync } = await import("child_process");

    const tempDir = await mkdtemp(join(tmpdir(), "astgrep-timeout-test-"));

    try {
      // Create 1000 JavaScript files to slow down ast-grep
      const fileCount = 1000;
      const fileCreationPromises: Promise<void>[] = [];

      for (let i = 0; i < fileCount; i++) {
        const filePath = join(tempDir, `file${i}.js`);
        const content = `
// File ${i}
const x${i} = 1;
const y${i} = 2;
const z${i} = 3;
function test${i}() {
  return x${i} + y${i} + z${i};
}
`.repeat(50); // Make each file large
        fileCreationPromises.push(writeFile(filePath, content));
      }

      await Promise.all(fileCreationPromises);

      // Count ast-grep processes before test
      let beforeCount = 0;
      try {
        const psResult = spawnSync("ps", ["aux"], { encoding: "utf-8" });
        if (psResult.stdout) {
          beforeCount = psResult.stdout
            .split("\n")
            .filter((line) => line.includes("ast-grep")).length;
        }
      } catch {
        // ps command might not be available on all platforms
      }

      // Execute search with very short timeout (1-2 seconds)
      let timeoutOccurred = false;
      try {
        await searchTool.execute({
          pattern: "const $NAME = $VALUE",
          paths: [tempDir],
          language: "javascript",
          timeoutMs: 1500, // Very short timeout to force failure
        });
      } catch (error) {
        // Timeout error expected
        timeoutOccurred = true;
        expect(error).toBeDefined();
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Should mention timeout or termination
        expect(errorMessage.toLowerCase()).toMatch(/timeout|terminated|killed|signal/i);
      }

      // Give OS time to clean up processes
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Count ast-grep processes after test
      let afterCount = 0;
      try {
        const psResult = spawnSync("ps", ["aux"], { encoding: "utf-8" });
        if (psResult.stdout) {
          afterCount = psResult.stdout
            .split("\n")
            .filter((line) => line.includes("ast-grep")).length;
        }
      } catch {
        // ps command might not be available
      }

      // Verify no lingering processes (allow small tolerance for timing)
      expect(afterCount).toBeLessThanOrEqual(beforeCount + 1);

      // Verify subsequent quick search succeeds immediately (no blocking)
      const quickResult = await searchTool.execute({
        pattern: "const $NAME = $VALUE",
        code: "const x = 1;",
        language: "javascript",
        timeoutMs: 5000,
      });

      expect(quickResult.matches.length).toBeGreaterThan(0);
      expect(quickResult.summary.totalMatches).toBeGreaterThan(0);

      // If CI or strict environment, assert timeout actually occurred
      if (process.env.CI === "1" || process.env.INTEGRATION_TESTS === "1") {
        expect(timeoutOccurred).toBe(true);
      }
    } finally {
      // Cleanup temp directory
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch {
        // Best effort cleanup
      }
    }
  });

  test("Replace with custom timeout", async () => {
    if (!replaceTool) throw new Error("Tools not initialized");

    const result = await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1; var y = 2;",
      language: "javascript",
      timeoutMs: 90000,
    });

    expect(result.summary.dryRun).toBe(true);
    expect(result.changes).toBeDefined();
  });

  test("Scan with custom timeout", async () => {
    if (!scanTool) throw new Error("Tools not initialized");

    const result = await scanTool.execute({
      id: "timeout-test",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      timeoutMs: 45000,
    });

    expect(result.yaml).toBeTruthy();
    expect(result.scan).toBeDefined();
  });

  test("Timeout validation (below minimum)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    try {
      await searchTool.execute({
        pattern: "const $NAME = $VALUE",
        code: "const x = 1;",
        language: "javascript",
        timeoutMs: 500, // Below minimum (1000ms)
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/1000|timeout|minimum/i);
    }
  });

  test("Timeout validation (above maximum)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    try {
      await searchTool.execute({
        pattern: "const $NAME = $VALUE",
        code: "const x = 1;",
        language: "javascript",
        timeoutMs: 400000, // Above maximum (300000ms)
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/300000|timeout|maximum/i);
    }
  });
});

// ============================================
// Stdin vs File Mode Behavior Tests
// ============================================

const describeStdinVsFileMode = SHOULD_SKIP ? describe.skip : describe;

describeStdinVsFileMode("Stdin vs File Mode Behavior", () => {
  test("ScanTool temp file cleanup after inline code execution", async () => {
    if (!scanTool) throw new Error("Tools not initialized");

    // Get temp directory
    const { tmpdir } = await import("os");
    const { readdir } = await import("fs/promises");
    const tempDir = tmpdir();

    // Count temp files before execution
    let beforeRuleFiles: string[] = [];
    let beforeCodeFiles: string[] = [];
    try {
      const allFiles = await readdir(tempDir);
      beforeRuleFiles = allFiles.filter((f) => f.startsWith("rule-") && f.endsWith(".yml"));
      beforeCodeFiles = allFiles.filter((f) => f.startsWith("astgrep-inline-"));
    } catch {
      // Temp dir might be inaccessible on some systems
    }

    // Execute ScanTool with inline code (creates temp rule + temp code file)
    const result = await scanTool.execute({
      id: "temp-file-test",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('test'); console.log('hello');",
    });

    expect(result.yaml).toBeDefined();
    expect(result.scan.findings).toBeDefined();

    // Give OS time to flush file operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Count temp files after execution
    let afterRuleFiles: string[] = [];
    let afterCodeFiles: string[] = [];
    try {
      const allFiles = await readdir(tempDir);
      afterRuleFiles = allFiles.filter((f) => f.startsWith("rule-") && f.endsWith(".yml"));
      afterCodeFiles = allFiles.filter((f) => f.startsWith("astgrep-inline-"));
    } catch {
      // Temp dir might be inaccessible
    }

    // Verify no new temp files remain (allowing for concurrent tests)
    expect(afterRuleFiles.length).toBeLessThanOrEqual(beforeRuleFiles.length + 1);
    expect(afterCodeFiles.length).toBeLessThanOrEqual(beforeCodeFiles.length + 1);

    // Execute again to verify cleanup is consistent
    await scanTool.execute({
      id: "temp-file-test-2",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      code: "const x = 1; const y = 2;",
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Count again
    let finalRuleFiles: string[] = [];
    let finalCodeFiles: string[] = [];
    try {
      const allFiles = await readdir(tempDir);
      finalRuleFiles = allFiles.filter((f) => f.startsWith("rule-") && f.endsWith(".yml"));
      finalCodeFiles = allFiles.filter((f) => f.startsWith("astgrep-inline-"));
    } catch {
      // Temp dir might be inaccessible
    }

    // Should not accumulate temp files over multiple executions
    expect(finalRuleFiles.length).toBeLessThanOrEqual(beforeRuleFiles.length + 2);
    expect(finalCodeFiles.length).toBeLessThanOrEqual(beforeCodeFiles.length + 2);
  });

  test("ScanTool temp file cleanup on error", async () => {
    if (!scanTool) throw new Error("Tools not initialized");

    const { tmpdir } = await import("os");
    const { readdir } = await import("fs/promises");
    const tempDir = tmpdir();

    // Count temp files before
    let beforeRuleFiles: string[] = [];
    try {
      const allFiles = await readdir(tempDir);
      beforeRuleFiles = allFiles.filter((f) => f.startsWith("rule-") && f.endsWith(".yml"));
    } catch {
      // Ignore
    }

    // Execute with invalid pattern to trigger error
    try {
      await scanTool.execute({
        id: "error-test",
        language: "javascript",
        pattern: "$$$", // Invalid bare $$$
        code: "const x = 1;",
      });
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
      // Error expected
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Count temp files after error
    let afterRuleFiles: string[] = [];
    try {
      const allFiles = await readdir(tempDir);
      afterRuleFiles = allFiles.filter((f) => f.startsWith("rule-") && f.endsWith(".yml"));
    } catch {
      // Ignore
    }

    // Even on error, temp files should be cleaned up (finally block)
    expect(afterRuleFiles.length).toBeLessThanOrEqual(beforeRuleFiles.length + 1);
  });

  test("Search with stdin mode (code parameter)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    const result = await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test'); console.log('hello');",
      language: "javascript",
    });

    expect(result.matches.length).toBeGreaterThanOrEqual(2);
    expect(result.summary.skippedLines).toBe(0);
  });

  test("Search with file mode (paths parameter)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    const result = await searchTool.execute({
      pattern: "const $NAME = $VALUE",
      paths: ["tests/fixtures/js/"],
      language: "javascript",
    });

    expect(result.matches.length).toBeGreaterThanOrEqual(0);
    expect(result.summary.skippedLines).toBe(0);
  });

  test("Replace with stdin mode (code parameter)", async () => {
    if (!replaceTool) throw new Error("Tools not initialized");

    const result = await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1; var y = 2; var z = 3;",
      language: "javascript",
    });

    // totalChanges counts diff lines, not semantic matches
    // For inline code with 3 var declarations, expect at least 1 change
    expect(result.summary.totalChanges).toBeGreaterThanOrEqual(1);
    expect(result.changes.length).toBeGreaterThanOrEqual(1);
    expect(result.changes[0].matches).toBeGreaterThanOrEqual(1);
    expect(result.summary.dryRun).toBe(true);
  });

  test("Replace with file mode (paths parameter)", async () => {
    if (!replaceTool) throw new Error("Tools not initialized");

    const result = await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      paths: ["tests/fixtures/js/"],
      language: "javascript",
      dryRun: true,
    });

    expect(result.summary.dryRun).toBe(true);
    expect(result.changes).toBeDefined();
  });

  test("Scan with inline code (creates temp file)", async () => {
    if (!scanTool) throw new Error("Tools not initialized");

    const result = await scanTool.execute({
      id: "stdin-test",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('inline test');",
    });

    expect(result.yaml).toContain("pattern:");
    expect(result.scan.findings).toBeDefined();
  });

  test("Language required for stdin mode", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    try {
      await searchTool.execute({
        pattern: "$VAR",
        code: "test",
        // language omitted - should fail
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/language.*required/i);
    }
  });
});

// ============================================
// Context Parameter Edge Cases Tests
// ============================================

const describeContextParameter = SHOULD_SKIP ? describe.skip : describe;

describeContextParameter("Context Parameter Edge Cases", () => {
  test("Context = 0 (no context lines)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    const result = await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "line1\nconsole.log('test');\nline3",
      language: "javascript",
      context: 0,
    });

    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    // Context arrays should be empty
    if (result.matches.length > 0) {
      expect(result.matches[0].context?.before?.length || 0).toBeLessThanOrEqual(0);
      expect(result.matches[0].context?.after?.length || 0).toBeLessThanOrEqual(0);
    }
  });

  test("Context = 3 (default context lines)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    const result = await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "line1\nline2\nline3\nconsole.log('test');\nline5\nline6\nline7",
      language: "javascript",
      context: 3,
    });

    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    // Context should include up to 3 lines before/after
    if (result.matches.length > 0) {
      const beforeLines = result.matches[0].context?.before?.length || 0;
      const afterLines = result.matches[0].context?.after?.length || 0;
      expect(beforeLines).toBeLessThanOrEqual(3);
      expect(afterLines).toBeLessThanOrEqual(3);
    }
  });

  test("Context = 100 (maximum allowed)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    const result = await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
      context: 100,
    });

    expect(result.matches.length).toBeGreaterThanOrEqual(1);
  });

  test("Context validation (negative value)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    try {
      await searchTool.execute({
        pattern: "$VAR",
        code: "test",
        language: "javascript",
        context: -1,
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/context|non-negative/i);
    }
  });

  test("Context validation (above maximum)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    try {
      await searchTool.execute({
        pattern: "$VAR",
        code: "test",
        language: "javascript",
        context: 150,
      });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toMatch(/100|context|exceed/i);
    }
  });
});

// ============================================
// Dry-Run vs Update-All Behavior Tests
// ============================================

const describeDryRunBehavior = SHOULD_SKIP ? describe.skip : describe;

describeDryRunBehavior("Dry-Run vs Update-All Behavior", () => {
  test("Replace with dryRun=true (default) shows preview", async () => {
    if (!replaceTool) throw new Error("Tools not initialized");

    const result = await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "javascript",
      dryRun: true,
    });

    expect(result.summary.dryRun).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes[0].preview).toBeDefined();
    expect(result.changes[0].applied).toBe(false);
  });

  test("Replace with dryRun=false (inline code safe)", async () => {
    if (!replaceTool) throw new Error("Tools not initialized");

    const result = await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "javascript",
      dryRun: false,
    });

    expect(result.summary.dryRun).toBe(false);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes[0].applied).toBe(true);
  });

  test("Replace with dryRun omitted defaults to true", async () => {
    if (!replaceTool) throw new Error("Tools not initialized");

    const result = await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "javascript",
      // dryRun omitted
    });

    expect(result.summary.dryRun).toBe(true);
    expect(result.changes[0].applied).toBe(false);
  });

  test("Replace preview contains diff markers", async () => {
    if (!replaceTool) throw new Error("Tools not initialized");

    const result = await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1; var y = 2;",
      language: "javascript",
      dryRun: true,
    });

    expect(result.summary.dryRun).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes[0].preview).toBeDefined();
    expect(result.changes[0].preview).toContain("│");
    // Check for removal/addition markers
    const hasRemoval =
      result.changes[0].preview?.includes("│-") || result.changes[0].preview?.includes("│ -");
    const hasAddition =
      result.changes[0].preview?.includes("│+") || result.changes[0].preview?.includes("│ +");
    expect(hasRemoval || hasAddition).toBe(true);
  });
});

// ============================================
// JSON Stream Format Verification Tests
// ============================================

const describeJSONStreamFormat = SHOULD_SKIP ? describe.skip : describe;

describeJSONStreamFormat("JSON Stream Format Verification", () => {
  test("Search returns JSONL format (one match per line)", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    const result = await searchTool.execute({
      pattern: "const $NAME = $VALUE",
      code: "const x = 1; const y = 2; const z = 3;",
      language: "javascript",
    });

    // Verify matches are parsed correctly from JSONL
    expect(result.matches.length).toBeGreaterThanOrEqual(3);
    expect(result.summary.skippedLines).toBe(0);

    // Verify each match has required fields
    for (const match of result.matches) {
      expect(match.file).toBeDefined();
      expect(match.line).toBeGreaterThanOrEqual(1);
      expect(match.column).toBeGreaterThanOrEqual(0);
      expect(match.text).toBeDefined();
    }
  });

  test("Scan returns JSONL format (one finding per line)", async () => {
    if (!scanTool) throw new Error("Tools not initialized");

    const result = await scanTool.execute({
      id: "jsonl-test",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('a'); console.log('b'); console.log('c');",
    });

    // Verify findings are parsed correctly from JSONL
    expect(result.scan.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.scan.summary.skippedLines).toBe(0);

    // Verify each finding has required fields
    for (const finding of result.scan.findings) {
      expect(finding.file).toBeDefined();
      expect(finding.line).toBeGreaterThanOrEqual(1);
      expect(finding.column).toBeGreaterThanOrEqual(0);
      expect(finding.ruleId).toBe("jsonl-test");
    }
  });

  test("Search with no matches returns empty results", async () => {
    if (!searchTool) throw new Error("Tools not initialized");

    const result = await searchTool.execute({
      pattern: "thisPatternWillNeverMatch($XYZ)",
      code: "const x = 1;",
      language: "javascript",
    });

    expect(result.matches.length).toBe(0);
    expect(result.summary.totalMatches).toBe(0);
    expect(result.summary.skippedLines).toBe(0);
  });

  test("Scan with no matches returns empty findings", async () => {
    if (!scanTool) throw new Error("Tools not initialized");

    const result = await scanTool.execute({
      id: "no-match-test",
      language: "javascript",
      pattern: "thisPatternWillNeverMatch($XYZ)",
      code: "const x = 1;",
    });

    expect(result.scan.findings.length).toBe(0);
    expect(result.scan.summary.totalFindings).toBe(0);
    expect(result.scan.summary.skippedLines).toBe(0);
  });

  test("Replace with no matches returns empty changes", async () => {
    if (!replaceTool) throw new Error("Tools not initialized");

    const result = await replaceTool.execute({
      pattern: "thisPatternWillNeverMatch($XYZ)",
      replacement: "newPattern($XYZ)",
      code: "const x = 1;",
      language: "javascript",
    });

    expect(result.changes.length).toBe(0);
    expect(result.summary.totalChanges).toBe(0);
    expect(result.summary.filesModified).toBe(0);
  });
});

/**
 * Integration Test Coverage Summary
 *
 * Total test cases: 87 comprehensive integration tests (including CLI flag mapping and end-to-end tests)
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
 * 6. Timeout Handling (5 tests)
 *    - Custom timeout parameters for search/replace/scan
 *    - Timeout validation (below minimum, above maximum)
 *
 * 7. Stdin vs File Mode Behavior (7 tests)
 *    - Search with stdin mode (code parameter)
 *    - Search with file mode (paths parameter)
 *    - Replace with stdin/file modes
 *    - Scan with inline code (temp file creation)
 *    - Language required validation for stdin mode
 *
 * 8. Context Parameter Edge Cases (5 tests)
 *    - Context = 0 (no context lines)
 *    - Context = 3 (default context lines)
 *    - Context = 100 (maximum allowed)
 *    - Context validation (negative, above maximum)
 *
 * 9. Dry-Run vs Update-All Behavior (4 tests)
 *    - Replace with dryRun=true (default) shows preview
 *    - Replace with dryRun=false (inline code safe)
 *    - Replace with dryRun omitted defaults to true
 *    - Preview contains diff markers
 *
 * 10. JSON Stream Format Verification (5 tests)
 *     - Search returns JSONL format (one match per line)
 *     - Scan returns JSONL format (one finding per line)
 *     - No matches returns empty results
 *     - Field validation for matches/findings
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
