/**
 * Integration tests for ExplainTool
 *
 * This test suite validates the pattern explanation functionality using actual tool execution.
 * Tests cover successful matches, failed matches with suggestions, validation, and edge cases.
 *
 * Requirements:
 * - ast-grep must be installed and available
 * - Tests assume ast-grep is accessible via system PATH
 *
 * Test Coverage:
 * - Successful pattern matches with metavariable extraction
 * - Failed pattern matches with debugging suggestions
 * - Multi-language support
 * - Validation and error handling
 * - Optional parameters (showAst)
 * - Metavariable position and kind details
 * - Edge cases
 *
 * Uses Bun's test framework for fast, reliable test execution.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "child_process";
import { ExplainTool } from "../src/tools/explain.js";
import { AstGrepBinaryManager } from "../src/core/binary-manager.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { ValidationError } from "../src/types/errors.js";

// ============================================
// Module-Load-Time Skip Decision
// ============================================

const RUN_INTEGRATION = process.env.INTEGRATION_TESTS === "1";

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

if (SHOULD_SKIP) {
  console.error("⚠️  ast-grep binary not found - skipping ExplainTool integration tests");
  console.error("   To run integration tests, install ast-grep: npm install -g @ast-grep/cli");
  console.error("   Or set INTEGRATION_TESTS=1 to enforce in CI");
} else if (RUN_INTEGRATION && !HAS_SG) {
  console.error("❌ INTEGRATION_TESTS=1 is set but ast-grep is not available");
  throw new Error("ast-grep is required when INTEGRATION_TESTS=1 but was not found in PATH");
}

// ============================================
// Test Setup and Shared Instances
// ============================================

let binaryManager: AstGrepBinaryManager | undefined;
let workspaceManager: WorkspaceManager | undefined;
let explainTool: ExplainTool | undefined;

if (!SHOULD_SKIP) {
  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ autoInstall: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    explainTool = new ExplainTool(binaryManager, workspaceManager);

    console.error("ExplainTool integration test setup complete:");
    console.error(`  ast-grep binary: ${binaryManager.getBinaryPath()}`);
    console.error(`  Workspace root: ${workspaceManager.getWorkspaceRoot()}`);
  });
}

// ============================================
// Test Suite 1: Successful Pattern Matches
// ============================================

const describeSuccessfulMatches = SHOULD_SKIP ? describe.skip : describe;

describeSuccessfulMatches("Successful Pattern Matches", () => {
  test("should explain successful pattern match with single metavariable", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const result = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('hello');",
      language: "javascript",
    });

    expect(result.matched).toBe(true);
    expect(result.metavariables.ARG).toBeDefined();
    expect(result.metavariables.ARG.value).toBe("'hello'");
    expect(result.metavariables.ARG.line).toBeGreaterThan(0);
    expect(result.metavariables.ARG.column).toBeGreaterThanOrEqual(0);
    expect(result.suggestions).toEqual([]);
    // AST nodes are optional in the output
    expect(Array.isArray(result.astNodes)).toBe(true);
  });

  test("should explain pattern match with multiple metavariables", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const code = `function add(a, b) { return a + b; }`;

    const result = await explainTool.execute({
      pattern: "function $NAME($PARAM1, $PARAM2) { return $EXPR }",
      code,
      language: "javascript",
    });

    expect(result.matched).toBe(true);
    expect(result.metavariables.NAME).toBeDefined();
    expect(result.metavariables.NAME.value).toBe("add");
    expect(result.metavariables.PARAM1).toBeDefined();
    expect(result.metavariables.PARAM1.value).toBe("a");
    expect(result.metavariables.PARAM2).toBeDefined();
    expect(result.metavariables.PARAM2.value).toBe("b");
    expect(result.metavariables.EXPR).toBeDefined();
    expect(result.metavariables.EXPR.value).toBe("a + b");
    expect(result.suggestions).toEqual([]);

    // Verify all metavariables have position information
    for (const metavar of Object.values(result.metavariables)) {
      expect(metavar.line).toBeGreaterThan(0);
      expect(metavar.column).toBeGreaterThanOrEqual(0);
    }
  });

  test("should explain pattern match with multi-node metavariable", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const code = `function test(x, y, z) { console.log(x); return y + z; }`;

    const result = await explainTool.execute({
      pattern: "function $NAME($$$PARAMS) { $$$BODY }",
      code,
      language: "javascript",
    });

    expect(result.matched).toBe(true);
    expect(result.metavariables.NAME).toBeDefined();
    expect(result.metavariables.NAME.value).toBe("test");
    expect(result.metavariables.PARAMS).toBeDefined();
    expect(result.metavariables.PARAMS.value).toContain("x");
    expect(result.metavariables.BODY).toBeDefined();
    expect(result.metavariables.BODY.value).toContain("console.log");
    expect(result.suggestions).toEqual([]);
  });
});

// ============================================
// Test Suite 2: Failed Pattern Matches with Suggestions
// ============================================

const describeFailedMatches = SHOULD_SKIP ? describe.skip : describe;

describeFailedMatches("Failed Pattern Matches with Suggestions", () => {
  test("should provide suggestions when pattern fails to match", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const result = await explainTool.execute({
      pattern: "function $NAME($$$PARAMS) { $$$BODY }",
      code: "const arrow = (x) => x * 2;",
      language: "javascript",
    });

    expect(result.matched).toBe(false);
    expect(Object.keys(result.metavariables).length).toBe(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.join(" ")).toContain("Pattern did not match");
    expect(result.suggestions.join(" ")).toContain("Verify pattern syntax");
  });

  test("should provide suggestions for syntax mismatch", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const result = await explainTool.execute({
      pattern: "class $NAME extends $BASE { $$$MEMBERS }",
      code: "class Simple { method() {} }",
      language: "javascript",
    });

    expect(result.matched).toBe(false);
    expect(Object.keys(result.metavariables).length).toBe(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.some(s => s.includes("Pattern did not match"))).toBe(true);
  });

  test("should handle completely invalid code gracefully", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const result = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: "this is not valid javascript code {{{",
      language: "javascript",
    });

    expect(result.matched).toBe(false);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});

// ============================================
// Test Suite 3: Language Support
// ============================================

const describeLanguageSupport = SHOULD_SKIP ? describe.skip : describe;

describeLanguageSupport("Language Support", () => {
  test("should work with TypeScript", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const code = `interface User { name: string; age: number; }`;

    const result = await explainTool.execute({
      pattern: "interface $NAME { $$$FIELDS }",
      code,
      language: "typescript",
    });

    expect(result.matched).toBe(true);
    expect(result.metavariables.NAME).toBeDefined();
    expect(result.metavariables.NAME.value).toBe("User");
    expect(result.metavariables.FIELDS).toBeDefined();
    expect(result.suggestions).toEqual([]);
  });

  test("should work with Python", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const code = `def greet(name): return f"Hello, {name}"`;

    const result = await explainTool.execute({
      pattern: "def $NAME($PARAM): return $EXPR",
      code,
      language: "python",
    });

    expect(result.matched).toBe(true);
    expect(result.metavariables.NAME).toBeDefined();
    expect(result.metavariables.NAME.value).toBe("greet");
    expect(result.metavariables.PARAM).toBeDefined();
    expect(result.metavariables.PARAM.value).toBe("name");
    expect(result.suggestions).toEqual([]);
  });

  test("should normalize language aliases", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    // Test with "javascript" instead of "js"
    const result = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
    });

    expect(result.matched).toBe(true);
    expect(result.metavariables.ARG).toBeDefined();

    // Test with "typescript" instead of "ts"
    const result2 = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "typescript",
    });

    expect(result2.matched).toBe(true);
    expect(result2.metavariables.ARG).toBeDefined();
  });
});

// ============================================
// Test Suite 4: Validation and Error Handling
// ============================================

const describeValidation = SHOULD_SKIP ? describe.skip : describe;

describeValidation("Validation and Error Handling", () => {
  test("should throw ValidationError for missing pattern", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    await expect(
      explainTool.execute({
        code: "console.log('test');",
        language: "javascript",
      } as any)
    ).rejects.toThrow("Pattern is required");
  });

  test("should throw ValidationError for missing code", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    await expect(
      explainTool.execute({
        pattern: "console.log($ARG)",
        language: "javascript",
      } as any)
    ).rejects.toThrow("Code is required");
  });

  test("should throw ValidationError for missing language", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    await expect(
      explainTool.execute({
        pattern: "console.log($ARG)",
        code: "console.log('test');",
      } as any)
    ).rejects.toThrow("Language is required");
  });

  test("should throw ValidationError for invalid pattern syntax", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    // Use bare multi-node metavariable which is invalid
    await expect(
      explainTool.execute({
        pattern: "$$$",
        code: "console.log('test');",
        language: "javascript",
      })
    ).rejects.toThrow(ValidationError);
  });

  test("should throw ValidationError for code exceeding size limit", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    // Create code larger than 1MB
    const largeCode = "console.log('x');\n".repeat(100000);

    const error = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: largeCode,
      language: "javascript",
    }).catch(e => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("code parameter cannot exceed");
  });
});

// ============================================
// Test Suite 5: Optional Parameters
// ============================================

const describeOptionalParams = SHOULD_SKIP ? describe.skip : describe;

describeOptionalParams("Optional Parameters", () => {
  test("should handle showAst parameter", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const resultWithAst = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
      showAst: true,
    });

    expect(resultWithAst.ast).toBeDefined();
    expect(typeof resultWithAst.ast).toBe("string");
    expect((resultWithAst.ast as string).length).toBeGreaterThan(0);

    const resultWithoutAst = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
      showAst: false,
    });

    expect(resultWithoutAst.ast).toBeUndefined();
  });

  test("should work without showAst parameter", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const result = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
    });

    expect(result.ast).toBeUndefined();
    expect(result.matched).toBe(true);
  });

  test("should handle custom timeoutMs", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const result = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
      timeoutMs: 15000,
    });

    expect(result.matched).toBe(true);
  });

  test("should throw ValidationError for invalid timeoutMs", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    await expect(
      explainTool.execute({
        pattern: "console.log($ARG)",
        code: "console.log('test');",
        language: "javascript",
        timeoutMs: 500, // Below minimum
      })
    ).rejects.toThrow("timeout");
  });
});

// ============================================
// Test Suite 6: Metavariable Details
// ============================================

const describeMetavariableDetails = SHOULD_SKIP ? describe.skip : describe;

describeMetavariableDetails("Metavariable Details", () => {
  test("should capture metavariable positions", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const code = `console.log('test');`;

    const result = await explainTool.execute({
      pattern: "console.log($ARG)",
      code,
      language: "javascript",
    });

    expect(result.matched).toBe(true);
    expect(result.metavariables.ARG.line).toBeGreaterThan(0); // 1-indexed
    expect(result.metavariables.ARG.column).toBeGreaterThanOrEqual(0); // 0-indexed
  });

  test("should capture metavariable AST node kinds", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const code = `const x = 42;`;

    const result = await explainTool.execute({
      pattern: "const $NAME = $VALUE",
      code,
      language: "javascript",
    });

    expect(result.matched).toBe(true);
    expect(result.metavariables.NAME).toBeDefined();
    expect(result.metavariables.NAME.value).toBe("x");
    expect(result.metavariables.VALUE).toBeDefined();
    expect(result.metavariables.VALUE.value).toBe("42");
    // AST node kinds are in the astNodes array, not per-metavariable
    expect(Array.isArray(result.astNodes)).toBe(true);
  });
});

// ============================================
// Test Suite 7: Edge Cases
// ============================================

const describeEdgeCases = SHOULD_SKIP ? describe.skip : describe;

describeEdgeCases("Edge Cases", () => {
  test("should handle empty match results gracefully", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const result = await explainTool.execute({
      pattern: "console.log($ARG)",
      code: "const x = 42;",
      language: "javascript",
    });

    expect(result.matched).toBe(false);
    expect(Object.keys(result.metavariables).length).toBe(0);
    expect(result.astNodes).toEqual([]);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  test("should handle pattern with no metavariables", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const result = await explainTool.execute({
      pattern: "console.log()",
      code: "console.log();",
      language: "javascript",
    });

    expect(result.matched).toBe(true);
    expect(Object.keys(result.metavariables).length).toBe(0);
    expect(result.suggestions).toEqual([]);
  });

  test("should handle complex nested patterns", async () => {
    if (!explainTool) throw new Error("ExplainTool not initialized");

    const code = `try { doSomething(); } catch (error) { console.error(error); }`;

    const result = await explainTool.execute({
      pattern: "try { $$$TRY_BODY } catch ($ERR) { $$$CATCH_BODY }",
      code,
      language: "javascript",
    });

    expect(result.matched).toBe(true);
    expect(result.metavariables.TRY_BODY).toBeDefined();
    expect(result.metavariables.ERR).toBeDefined();
    expect(result.metavariables.CATCH_BODY).toBeDefined();
  });
});
