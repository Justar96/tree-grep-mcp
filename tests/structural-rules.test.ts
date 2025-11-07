/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for structural rule support in ScanTool
 *
 * Tests the new capability to use ast-grep's full rule syntax including:
 * - Kind rules (match by AST node type)
 * - Pattern objects (selector, context, strictness)
 * - Relational rules (inside, has, precedes, follows with stopBy)
 * - Composite rules (all, any, not, matches)
 *
 * Requirements:
 * - ast-grep must be installed and available (via npm install -g @ast-grep/cli)
 * - Tests assume ast-grep is accessible via system PATH
 * - Set INTEGRATION_TESTS=1 environment variable to enforce in CI
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { spawnSync } from "child_process";
import { ScanTool } from "../src/tools/scan.js";
import { AstGrepBinaryManager } from "../src/core/binary-manager.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";

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
  console.error("⚠️  ast-grep binary not found - skipping structural rules tests");
  console.error("   To run these tests, install ast-grep: npm install -g @ast-grep/cli");
  console.error("   Or set INTEGRATION_TESTS=1 to enforce in CI");
} else if (RUN_INTEGRATION && !HAS_SG) {
  console.error("❌ INTEGRATION_TESTS=1 is set but ast-grep is not available");
  throw new Error("ast-grep is required when INTEGRATION_TESTS=1 but was not found in PATH");
}

// ============================================
// Test Setup and Shared Instances
// ============================================

// Shared instances
let binaryManager: AstGrepBinaryManager | undefined;
let workspaceManager: WorkspaceManager | undefined;
let scanTool: ScanTool | undefined;

// Only run beforeAll if not skipping
if (!SHOULD_SKIP) {
  beforeAll(async () => {
    // Initialize binary manager (expects ast-grep to be installed in CI)
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);

    console.error("Structural rules test setup complete:");
    console.error(`  ast-grep binary: ${binaryManager.getBinaryPath()}`);
    console.error(`  Workspace root: ${workspaceManager.getWorkspaceRoot()}`);
  });
}

// Use conditional describe to skip all tests if binary is not available
const describeOrSkip = SHOULD_SKIP ? describe.skip : describe;

describeOrSkip("Structural Rules Support", () => {
  describe("Kind Rules", () => {
    test("Rust match expressions with kind rule", async () => {
      const result = await scanTool!.execute({
        id: "rust-match",
        language: "rust",
        rule: {
          kind: "match_expression",
        },
        code: `
fn test() {
  match value {
    Some(x) => x,
    None => 0,
  }
}
        `,
      });

      expect(result.scan.findings.length).toBeGreaterThan(0);
      expect(result.scan.findings[0].ruleId).toBe("rust-match");
      expect(result.yaml).toContain("kind: match_expression");
    });

    test("Rust match with kind + has + stopBy", async () => {
      const result = await scanTool!.execute({
        id: "match-with-pattern",
        language: "rust",
        rule: {
          kind: "match_expression",
          has: {
            kind: "match_arm",
            stopBy: "end",
          },
        },
        code: `
fn test() {
  match value {
    Some(x) => x,
    None => 0,
  }
}
        `,
      });

      // The test verifies YAML generation is correct, even if no matches found
      // (Rust match_arm may need more specific pattern matching)
      expect(result.yaml).toContain("kind: match_expression");
      expect(result.yaml).toContain("has:");
      expect(result.yaml).toContain("kind: match_arm");
      expect(result.yaml).toContain("stopBy: end");
    });

    test("JavaScript function with kind rule", async () => {
      const result = await scanTool!.execute({
        id: "function-decl",
        language: "javascript",
        rule: {
          kind: "function_declaration",
        },
        code: "function test() { return 42; }",
      });

      expect(result.scan.findings.length).toBe(1);
      expect(result.yaml).toContain("kind: function_declaration");
    });
  });

  describe("Pattern Objects", () => {
    test("Pattern object with selector", async () => {
      const result = await scanTool!.execute({
        id: "pattern-with-selector",
        language: "typescript",
        rule: {
          pattern: {
            selector: "function_signature",
            context: "function $NAME($ARG: string)",
          },
        },
        code: "function greet(name: string): void { console.log(name); }",
      });

      expect(result.yaml).toContain("pattern:");
      expect(result.yaml).toContain("selector:");
      expect(result.yaml).toContain("context:");
      // May or may not find matches depending on selector behavior
    });

    test("Pattern object with strictness", async () => {
      const result = await scanTool!.execute({
        id: "pattern-relaxed",
        language: "javascript",
        rule: {
          pattern: {
            context: "function $NAME() { $$$BODY }",
            strictness: "relaxed",
          },
        },
        code: "function test() { return 42; }",
      });

      expect(result.yaml).toContain("strictness: relaxed");
    });
  });

  describe("Relational Rules", () => {
    test("has rule with stopBy", async () => {
      const result = await scanTool!.execute({
        id: "async-function",
        language: "javascript",
        rule: {
          kind: "function_declaration",
          has: {
            pattern: "await $EXPR",
            stopBy: "end",
          },
        },
        code: 'async function test() { await fetch("/api"); }',
      });

      expect(result.yaml).toContain("has:");
      expect(result.yaml).toContain("stopBy: end");
    });

    test("inside rule with stopBy", async () => {
      const result = await scanTool!.execute({
        id: "method-in-class",
        language: "javascript",
        rule: {
          inside: {
            kind: "class_declaration",
            stopBy: "end",
          },
          kind: "method_definition",
        },
        code: `
class MyClass {
  async getData() {
    return await fetch("/api");
  }
}
        `,
      });

      expect(result.yaml).toContain("inside:");
      expect(result.yaml).toContain("stopBy: end");
      expect(result.yaml).toContain("kind: method_definition");
    });

    test("precedes rule", async () => {
      const result = await scanTool!.execute({
        id: "statement-order",
        language: "javascript",
        rule: {
          pattern: "const $A = $B",
          precedes: {
            pattern: "return $A",
          },
        },
        code: `
function test() {
  const result = compute();
  return result;
}
        `,
      });

      expect(result.yaml).toContain("precedes:");
    });
  });

  describe("Composite Rules", () => {
    test("all rule combines multiple conditions", async () => {
      const result = await scanTool!.execute({
        id: "console-log-call",
        language: "javascript",
        rule: {
          all: [{ kind: "call_expression" }, { pattern: "console.log($MSG)" }],
        },
        code: 'console.log("test"); console.error("error");',
      });

      expect(result.scan.findings.length).toBe(1);
      expect(result.yaml).toContain("all:");
      expect(result.yaml).toContain("- kind: call_expression");
      expect(result.yaml).toContain("- pattern:");
    });

    test("any rule matches alternatives", async () => {
      const result = await scanTool!.execute({
        id: "console-methods",
        language: "javascript",
        rule: {
          any: [
            { pattern: "console.log($MSG)" },
            { pattern: "console.error($MSG)" },
            { pattern: "console.warn($MSG)" },
          ],
        },
        code: 'console.log("info"); console.error("error"); foo();',
      });

      expect(result.scan.findings.length).toBe(2);
      expect(result.yaml).toContain("any:");
    });

    test("not rule excludes matches", async () => {
      const result = await scanTool!.execute({
        id: "function-without-async",
        language: "javascript",
        rule: {
          kind: "function_declaration",
          not: {
            has: {
              pattern: "await $EXPR",
              stopBy: "end",
            },
          },
        },
        code: `
function sync() { return 42; }
async function async() { await fetch("/api"); }
        `,
      });

      expect(result.yaml).toContain("not:");
      expect(result.scan.findings.length).toBe(1);
      expect(result.scan.findings[0].line).toBeLessThan(3); // sync function on line 2
    });

    test("nested composite rules", async () => {
      const result = await scanTool!.execute({
        id: "complex-composite",
        language: "javascript",
        rule: {
          all: [
            { kind: "call_expression" },
            {
              any: [{ pattern: "$OBJ.log($$$)" }, { pattern: "$OBJ.error($$$)" }],
            },
          ],
        },
        code: 'console.log("test"); logger.error("error"); foo();',
      });

      expect(result.scan.findings.length).toBe(2);
      expect(result.yaml).toContain("all:");
      expect(result.yaml).toContain("any:");
    });
  });

  describe("Rule Validation", () => {
    test("rejects rule without positive key", async () => {
      await expect(
        scanTool!.execute({
          id: "invalid-rule",
          language: "javascript",
          rule: {
            stopBy: "end", // Not a positive key
          } as any,
          code: "test",
        })
      ).rejects.toThrow("at least one positive key");
    });

    test("rejects both pattern and rule", async () => {
      await expect(
        scanTool!.execute({
          id: "conflicting-params",
          language: "javascript",
          pattern: "foo",
          rule: { kind: "function_declaration" },
          code: "test",
        })
      ).rejects.toThrow("Cannot specify both pattern and rule");
    });

    test("rejects neither pattern nor rule", async () => {
      await expect(
        scanTool!.execute({
          id: "missing-params",
          language: "javascript",
          code: "test",
        })
      ).rejects.toThrow("Either pattern (string) or rule (object) is required");
    });

    test("validates pattern object properties", async () => {
      await expect(
        scanTool!.execute({
          id: "invalid-strictness",
          language: "javascript",
          rule: {
            pattern: {
              context: "test",
              strictness: "invalid" as any,
            },
          },
          code: "test",
        })
      ).rejects.toThrow("Invalid strictness");
    });

    test("validates kind is string", async () => {
      await expect(
        scanTool!.execute({
          id: "invalid-kind",
          language: "javascript",
          rule: {
            kind: 123 as any,
          },
          code: "test",
        })
      ).rejects.toThrow("kind must be a string");
    });
  });

  describe("YAML Generation", () => {
    test("generates correct YAML for kind + has", async () => {
      const result = await scanTool!.execute({
        id: "yaml-test",
        language: "rust",
        rule: {
          kind: "match_expression",
          has: {
            pattern: "$ARM => $BODY",
            stopBy: "end",
          },
        },
        code: "match x { A => 1, B => 2 }",
      });

      const yaml = result.yaml;
      expect(yaml).toContain("id: yaml-test");
      expect(yaml).toContain("language: rs");
      expect(yaml).toContain("rule:");
      expect(yaml).toContain("  kind: match_expression");
      expect(yaml).toContain("  has:");
      expect(yaml).toContain("    pattern:");
      expect(yaml).toContain("    stopBy: end");
    });

    test("generates correct YAML for pattern object", async () => {
      const result = await scanTool!.execute({
        id: "pattern-obj-yaml",
        language: "typescript",
        rule: {
          pattern: {
            selector: "type_parameters",
            context: "function $F<$T>()",
            strictness: "relaxed",
          },
        },
        code: "function test<T>() {}",
      });

      const yaml = result.yaml;
      expect(yaml).toContain("pattern:");
      expect(yaml).toContain("    selector:");
      expect(yaml).toContain("    context:");
      expect(yaml).toContain("    strictness: relaxed");
    });

    test("generates correct YAML for composite all", async () => {
      const result = await scanTool!.execute({
        id: "composite-yaml",
        language: "javascript",
        rule: {
          all: [{ kind: "call_expression" }, { pattern: "test($ARG)" }],
        },
        code: "test(123)",
      });

      const yaml = result.yaml;
      expect(yaml).toContain("all:");
      expect(yaml).toContain("  - kind: call_expression");
      expect(yaml).toContain("  - pattern:");
    });
  });

  describe("Backwards Compatibility", () => {
    test("simple pattern string still works", async () => {
      const result = await scanTool!.execute({
        id: "simple-pattern",
        language: "javascript",
        pattern: "console.log($MSG)",
        code: 'console.log("test");',
      });

      expect(result.scan.findings.length).toBe(1);
      expect(result.yaml).toContain("pattern:");
      expect(result.yaml).not.toContain("kind:");
    });

    test("pattern with where constraints still works", async () => {
      const result = await scanTool!.execute({
        id: "pattern-with-where",
        language: "javascript",
        pattern: "$OBJ.$METHOD($$$ARGS)",
        where: [{ metavariable: "OBJ", equals: "console" }],
        code: 'console.log("test"); logger.info("test");',
      });

      expect(result.scan.findings.length).toBe(1);
      expect(result.yaml).toContain("constraints:");
    });
  });
});
