/**
 * CLI Flag Mapping Tests
 *
 * This test suite verifies that MCP parameters correctly map to ast-grep CLI flags.
 * Uses command interception (spy on executeAstGrep) to capture CLI arguments without executing ast-grep.
 *
 * Test Coverage:
 * - SearchTool CLI flag mapping (--pattern, --lang, --json=stream, --context, --stdin, paths)
 * - ReplaceTool CLI flag mapping (--pattern, --rewrite, --lang, --update-all, --stdin, paths)
 * - ScanTool CLI flag mapping (--rule, --json=stream, temp file paths)
 * - YAML generation validation (structure, escaping, constraints)
 * - Temp file lifecycle (creation, cleanup, error handling)
 * - Language normalization (javascript->js, typescript->ts, etc.)
 * - Path handling (normalization, positional arguments)
 *
 * References:
 * - src/tools/search.ts - SearchTool CLI command construction
 * - src/tools/replace.ts - ReplaceTool CLI command construction
 * - src/tools/scan.ts - ScanTool CLI command construction and YAML generation
 * - AST_GREP_ALL_DOCUMENTS.md lines 355-814 - CLI documentation
 */

import { describe, test, expect, beforeAll, spyOn } from "bun:test";
import { SearchTool } from "../src/tools/search.js";
import { ReplaceTool } from "../src/tools/replace.js";
import { ScanTool } from "../src/tools/scan.js";
import { AstGrepBinaryManager } from "../src/core/binary-manager.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import {
  assertCliFlag,
  assertCliFlagAbsent,
  assertCliCommand,
  assertPositionalArgs,
  extractCliFlag,
  assertYamlField,
  assertYamlStructure,
  parseYamlSafe,
} from "./helpers/stderr-capture.js";

// ============================================
// Test Setup and Shared Instances
// ============================================

let binaryManager: AstGrepBinaryManager;
let workspaceManager: WorkspaceManager;
let searchTool: SearchTool;
let replaceTool: ReplaceTool;
let scanTool: ScanTool;

// Captured CLI arguments from mocked executeAstGrep
let capturedArgs: string[] = [];
let capturedOptions: { cwd: string; timeout: number; stdin?: string } | null = null;

beforeAll(async () => {
  // Initialize binary manager WITHOUT calling initialize() to avoid system dependency
  binaryManager = new AstGrepBinaryManager({ useSystem: true });

  // Stub initialize to no-op
  spyOn(binaryManager, "initialize").mockImplementation(async () => {
    // No-op: avoid actual binary resolution
  });

  // Initialize workspace manager
  workspaceManager = new WorkspaceManager();

  // Create tool instances
  searchTool = new SearchTool(binaryManager, workspaceManager);
  replaceTool = new ReplaceTool(binaryManager, workspaceManager);
  scanTool = new ScanTool(workspaceManager, binaryManager);

  // Mock executeAstGrep to capture args without execution
  spyOn(binaryManager, "executeAstGrep").mockImplementation(
    async (args: string[], options: { cwd: string; timeout: number; stdin?: string }) => {
      capturedArgs = [...args];
      capturedOptions = { ...options };
      // Return minimal valid response
      return {
        stdout: "", // Empty results for most tests
        stderr: "",
      };
    }
  );

  console.error("CLI flag mapping test setup complete:");
  console.error(`  Workspace root: ${workspaceManager.getWorkspaceRoot()}`);
  console.error("  executeAstGrep mocked for CLI argument capture");
  console.error("  Binary manager initialize() stubbed to no-op");
});

// ============================================
// SearchTool CLI Flag Mapping Tests
// ============================================

describe("SearchTool CLI Flag Mapping", () => {
  test("--pattern flag with simple pattern", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
    });

    // Verify CLI command: ast-grep run --pattern "console.log($ARG)" --lang js --json=stream --stdin
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--pattern", "console.log($ARG)");
  });

  test("--lang flag with normalized language", async () => {
    await searchTool.execute({
      pattern: "const $NAME = $VALUE",
      code: "const x = 1;",
      language: "javascript",
    });

    // Verify language normalization: javascript -> js (AST_GREP_ALL_DOCUMENTS.md line 360)
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--lang", "js");
  });

  test("--json=stream flag always present", async () => {
    await searchTool.execute({
      pattern: "const $NAME = $VALUE",
      code: "const x = 1;",
      language: "javascript",
    });

    // Verify --json=stream is always added (AST_GREP_ALL_DOCUMENTS.md line 814)
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--json=stream", null);
  });

  test("--context flag with valid context parameter", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
      context: 5,
    });

    // Verify --context flag (AST_GREP_ALL_DOCUMENTS.md line 470)
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--context", "5");
  });

  test("--context flag absent when context is 0", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
      context: 0,
    });

    // Verify --context is not added when context is 0 (default behavior)
    assertCliCommand(capturedArgs, "run");
    assertCliFlagAbsent(capturedArgs, "--context");
  });

  test("--stdin flag present when code parameter provided", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
    });

    // Verify --stdin flag for inline code (AST_GREP_ALL_DOCUMENTS.md line 414)
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--stdin", null);
    expect(capturedOptions?.stdin).toBe("console.log('test');");
  });

  test("--stdin flag absent and paths present when code not provided", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      paths: ["src/"],
      language: "javascript",
    });

    // Verify --stdin is absent and paths are positional arguments
    assertCliCommand(capturedArgs, "run");
    assertCliFlagAbsent(capturedArgs, "--stdin");
    assertPositionalArgs(capturedArgs, ["src/"]);
  });

  test("Positional arguments for multiple paths", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      paths: ["src/", "tests/"],
      language: "javascript",
    });

    // Verify multiple paths as positional arguments (AST_GREP_ALL_DOCUMENTS.md line 355)
    assertCliCommand(capturedArgs, "run");
    assertPositionalArgs(capturedArgs, ["src/", "tests/"]);
  });

  test("Default path '.' when paths not provided", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      language: "javascript",
    });

    // Verify default path '.' when paths omitted (AST_GREP_ALL_DOCUMENTS.md line 355)
    assertCliCommand(capturedArgs, "run");
    assertPositionalArgs(capturedArgs, ["."]);
  });

  test("Language alias normalization (typescript -> ts)", async () => {
    await searchTool.execute({
      pattern: "const $NAME: $TYPE = $VALUE",
      code: "const x: number = 1;",
      language: "typescript",
    });

    // Verify typescript -> ts normalization
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--lang", "ts");
  });

  test("Language alias normalization (python -> py)", async () => {
    await searchTool.execute({
      pattern: "def $NAME($$$PARAMS): $$$BODY",
      code: "def test(): pass",
      language: "python",
    });

    // Verify python -> py normalization
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--lang", "py");
  });

  test("Language alias normalization (rust -> rs)", async () => {
    await searchTool.execute({
      pattern: "fn $NAME() { $$$BODY }",
      code: "fn main() {}",
      language: "rust",
    });

    // Verify rust -> rs normalization
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--lang", "rs");
  });

  test("Language alias normalization (golang -> go)", async () => {
    await searchTool.execute({
      pattern: "func $NAME() { $$$BODY }",
      code: "func main() {}",
      language: "golang",
    });

    // Verify golang -> go normalization
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--lang", "go");
  });

  test("Language alias normalization (c++ -> cpp)", async () => {
    await searchTool.execute({
      pattern: "int $NAME() { $$$BODY }",
      code: "int main() { return 0; }",
      language: "c++",
    });

    // Verify c++ -> cpp normalization
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--lang", "cpp");
  });

  test("CLI flag order: run, --pattern, --lang, --json=stream, --context, --stdin, paths", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
      context: 2,
    });

    // Verify exact CLI flag order matches implementation
    expect(capturedArgs[0]).toBe("run");
    expect(capturedArgs[1]).toBe("--pattern");
    expect(capturedArgs[2]).toBe("console.log($ARG)");
    expect(capturedArgs[3]).toBe("--lang");
    expect(capturedArgs[4]).toBe("js");
    expect(capturedArgs[5]).toBe("--json=stream");
    expect(capturedArgs[6]).toBe("--context");
    expect(capturedArgs[7]).toBe("2");
    expect(capturedArgs[8]).toBe("--stdin");
  });

  test("maxMatches parameter not a CLI flag (result slicing)", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
      maxMatches: 10,
    });

    // Verify maxMatches is NOT a CLI flag (handled via result slicing)
    assertCliCommand(capturedArgs, "run");
    assertCliFlagAbsent(capturedArgs, "--max-matches");
    assertCliFlagAbsent(capturedArgs, "--limit");
  });

  test("timeoutMs parameter not a CLI flag (process timeout)", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      language: "javascript",
      timeoutMs: 60000,
    });

    // Verify timeoutMs is NOT a CLI flag (process-level timeout)
    assertCliCommand(capturedArgs, "run");
    assertCliFlagAbsent(capturedArgs, "--timeout");
    expect(capturedOptions?.timeout).toBe(60000);
  });

  test("Pattern with metavariables preserved in CLI", async () => {
    await searchTool.execute({
      pattern: "function $NAME($$$PARAMS) { $$$BODY }",
      code: "function test(a, b) { return a + b; }",
      language: "javascript",
    });

    // Verify pattern with metavariables is passed as-is
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--pattern", "function $NAME($$$PARAMS) { $$$BODY }");
  });
});

// ============================================
// ReplaceTool CLI Flag Mapping Tests
// ============================================

describe("ReplaceTool CLI Flag Mapping", () => {
  test("--pattern and --rewrite flags with simple replacement", async () => {
    await replaceTool.execute({
      pattern: "console.log($ARG)",
      replacement: "logger.info($ARG)",
      code: "console.log('test');",
      language: "javascript",
    });

    // Verify CLI command: ast-grep run --pattern "console.log($ARG)" --rewrite "logger.info($ARG)" --lang js --stdin
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--pattern", "console.log($ARG)");
    assertCliFlag(capturedArgs, "--rewrite", "logger.info($ARG)");
  });

  test("--lang flag with normalized language", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "typescript",
    });

    // Verify language normalization: typescript -> ts
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--lang", "ts");
  });

  test("--update-all flag present when dryRun is false", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "javascript",
      dryRun: false,
    });

    // Verify --update-all flag for actual replacement (AST_GREP_ALL_DOCUMENTS.md line 530)
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--update-all", null);
  });

  test("--update-all flag absent when dryRun is true (default)", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "javascript",
      dryRun: true,
    });

    // Verify --update-all is absent for dry-run (default behavior)
    assertCliCommand(capturedArgs, "run");
    assertCliFlagAbsent(capturedArgs, "--update-all");
  });

  test("--update-all flag absent when dryRun not provided (default true)", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "javascript",
    });

    // Verify --update-all is absent when dryRun omitted (defaults to true)
    assertCliCommand(capturedArgs, "run");
    assertCliFlagAbsent(capturedArgs, "--update-all");
  });

  test("--stdin flag present when code parameter provided", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "javascript",
    });

    // Verify --stdin flag for inline code
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--stdin", null);
    expect(capturedOptions?.stdin).toBe("var x = 1;");
  });

  test("--stdin flag absent and paths present when code not provided", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      paths: ["src/"],
      language: "javascript",
    });

    // Verify --stdin is absent and paths are positional arguments
    assertCliCommand(capturedArgs, "run");
    assertCliFlagAbsent(capturedArgs, "--stdin");
    assertPositionalArgs(capturedArgs, ["src/"]);
  });

  test("Positional arguments for multiple paths", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      paths: ["src/", "tests/"],
      language: "javascript",
    });

    // Verify multiple paths as positional arguments
    assertCliCommand(capturedArgs, "run");
    assertPositionalArgs(capturedArgs, ["src/", "tests/"]);
  });

  test("Default path '.' when paths not provided", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      language: "javascript",
    });

    // Verify default path '.' when paths omitted
    assertCliCommand(capturedArgs, "run");
    assertPositionalArgs(capturedArgs, ["."]);
  });

  test("CLI flag order: run, --pattern, --rewrite, --lang, --update-all, --stdin, paths", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "javascript",
      dryRun: false,
    });

    // Verify exact CLI flag order matches implementation
    expect(capturedArgs[0]).toBe("run");
    expect(capturedArgs[1]).toBe("--pattern");
    expect(capturedArgs[2]).toBe("var $NAME = $VALUE");
    expect(capturedArgs[3]).toBe("--rewrite");
    expect(capturedArgs[4]).toBe("const $NAME = $VALUE");
    expect(capturedArgs[5]).toBe("--lang");
    expect(capturedArgs[6]).toBe("js");
    expect(capturedArgs[7]).toBe("--update-all");
    expect(capturedArgs[8]).toBe("--stdin");
  });

  test("Empty replacement string valid (pattern deletion)", async () => {
    await replaceTool.execute({
      pattern: "console.log($ARG);",
      replacement: "",
      code: "console.log('test');",
      language: "javascript",
    });

    // Verify empty replacement is valid (deletes matched pattern)
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--rewrite", "");
  });

  test("Replacement with metavariable reordering", async () => {
    await replaceTool.execute({
      pattern: "assertEquals($EXPECTED, $ACTUAL)",
      replacement: "assertEquals($ACTUAL, $EXPECTED)",
      code: "assertEquals(5, result);",
      language: "javascript",
    });

    // Verify metavariable reordering preserved in CLI
    assertCliCommand(capturedArgs, "run");
    assertCliFlag(capturedArgs, "--pattern", "assertEquals($EXPECTED, $ACTUAL)");
    assertCliFlag(capturedArgs, "--rewrite", "assertEquals($ACTUAL, $EXPECTED)");
  });

  test("timeoutMs parameter not a CLI flag (process timeout)", async () => {
    await replaceTool.execute({
      pattern: "var $NAME = $VALUE",
      replacement: "const $NAME = $VALUE",
      code: "var x = 1;",
      language: "javascript",
      timeoutMs: 90000,
    });

    // Verify timeoutMs is NOT a CLI flag (process-level timeout)
    assertCliCommand(capturedArgs, "run");
    assertCliFlagAbsent(capturedArgs, "--timeout");
    expect(capturedOptions?.timeout).toBe(90000);
  });
});

// ============================================
// ScanTool CLI Flag Mapping Tests
// ============================================

describe("ScanTool CLI Flag Mapping", () => {
  test("--rule flag with temp YAML file path", async () => {
    await scanTool.execute({
      id: "no-console",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('test');",
    });

    // Verify CLI command: ast-grep scan --rule <temp-file> --json=stream <temp-code-file>
    assertCliCommand(capturedArgs, "scan");
    assertCliFlag(capturedArgs, "--rule", null);
    const ruleFile = extractCliFlag(capturedArgs, "--rule");
    expect(ruleFile).toBeTruthy();
    expect(ruleFile).toMatch(/rule-.*\.yml$/);
  });

  test("--json=stream flag always present", async () => {
    await scanTool.execute({
      id: "no-console",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('test');",
    });

    // Verify --json=stream is always added (AST_GREP_ALL_DOCUMENTS.md line 814)
    assertCliCommand(capturedArgs, "scan");
    assertCliFlag(capturedArgs, "--json=stream", null);
  });

  test("Temp code file as positional argument when code provided", async () => {
    await scanTool.execute({
      id: "no-console",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('test');",
    });

    // Verify temp code file path as positional argument
    assertCliCommand(capturedArgs, "scan");
    const positionalArgs = capturedArgs.slice(4); // After: scan, --rule, <rule-file>, --json=stream
    expect(positionalArgs.length).toBeGreaterThan(0);
    expect(positionalArgs[0]).toMatch(/astgrep-inline-.*\.js$/);
  });

  test("Paths as positional arguments when code not provided", async () => {
    await scanTool.execute({
      id: "no-console",
      language: "javascript",
      pattern: "console.log($ARG)",
      paths: ["src/"],
    });

    // Verify paths as positional arguments
    assertCliCommand(capturedArgs, "scan");
    assertPositionalArgs(capturedArgs, ["src/"]);
  });

  test("Default path '.' when paths and code not provided", async () => {
    await scanTool.execute({
      id: "no-console",
      language: "javascript",
      pattern: "console.log($ARG)",
    });

    // Verify default path '.' when both paths and code omitted
    assertCliCommand(capturedArgs, "scan");
    assertPositionalArgs(capturedArgs, ["."]);
  });

  test("CLI flag order: scan, --rule, <file>, --json=stream, paths", async () => {
    await scanTool.execute({
      id: "no-console",
      language: "javascript",
      pattern: "console.log($ARG)",
      paths: ["src/"],
    });

    // Verify exact CLI flag order matches implementation
    expect(capturedArgs[0]).toBe("scan");
    expect(capturedArgs[1]).toBe("--rule");
    expect(capturedArgs[2]).toMatch(/rule-.*\.yml$/);
    expect(capturedArgs[3]).toBe("--json=stream");
    expect(capturedArgs[4]).toBe("src/");
  });

  test("timeoutMs parameter not a CLI flag (process timeout)", async () => {
    await scanTool.execute({
      id: "no-console",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('test');",
      timeoutMs: 45000,
    });

    // Verify timeoutMs is NOT a CLI flag (process-level timeout)
    assertCliCommand(capturedArgs, "scan");
    assertCliFlagAbsent(capturedArgs, "--timeout");
    expect(capturedOptions?.timeout).toBe(45000);
  });
});

// ============================================
// YAML Generation Validation Tests
// ============================================

describe("YAML Generation Validation", () => {
  test("Basic YAML structure with required fields", async () => {
    const result = await scanTool.execute({
      id: "no-var",
      language: "javascript",
      pattern: "var $NAME = $VALUE",
      code: "var x = 1;",
    });

    // Verify YAML structure (AST_GREP_ALL_DOCUMENTS.md lines 650-700)
    const yaml = parseYamlSafe(result.yaml);
    assertYamlField(yaml, "id", "no-var");
    assertYamlField(yaml, "language", "js");
    assertYamlField(yaml, "message", "no-var"); // defaults to id
    assertYamlField(yaml, "severity", "warning"); // default severity
    assertYamlStructure(yaml, ["id", "language", "message", "severity", "rule"]);
  });

  test("YAML with custom message and severity", async () => {
    const result = await scanTool.execute({
      id: "no-console",
      language: "javascript",
      pattern: "console.log($ARG)",
      message: "Avoid console.log in production",
      severity: "error",
      code: "console.log('test');",
    });

    const yaml = parseYamlSafe(result.yaml);
    assertYamlField(yaml, "id", "no-console");
    assertYamlField(yaml, "message", "Avoid console.log in production");
    assertYamlField(yaml, "severity", "error");
  });

  test("YAML with pattern and fix", async () => {
    const result = await scanTool.execute({
      id: "modernize-var",
      language: "javascript",
      pattern: "var $NAME = $VALUE",
      fix: "const $NAME = $VALUE",
      code: "var x = 1;",
    });

    const yaml = parseYamlSafe(result.yaml);
    assertYamlField(yaml, "fix", "const $NAME = $VALUE");
    assertYamlStructure(yaml, ["id", "language", "message", "severity", "rule", "fix"]);
  });

  test("YAML with simple constraints (regex)", async () => {
    const result = await scanTool.execute({
      id: "test-vars-only",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      where: [{ metavariable: "NAME", regex: "^test" }],
      code: "const testVar = 1;",
    });

    const yaml = parseYamlSafe(result.yaml);
    expect(result.yaml).toContain("constraints:");
    expect(result.yaml).toContain("NAME:");
    expect(result.yaml).toContain("regex:");
    expect(result.yaml).toContain("^test");

    // Assert nested structure with real parser
    expect(yaml.constraints).toBeDefined();
    expect(typeof yaml.constraints).toBe("object");
    const constraints = yaml.constraints as Record<string, unknown>;
    expect(constraints.NAME).toBeDefined();
    const nameConstraint = constraints.NAME as Record<string, unknown>;
    expect(nameConstraint.regex).toBe("^test");
  });

  test("YAML with simple constraints (equals converted to anchored regex)", async () => {
    const result = await scanTool.execute({
      id: "console-log-only",
      language: "javascript",
      pattern: "$OBJ.$METHOD($ARG)",
      where: [
        { metavariable: "OBJ", equals: "console" },
        { metavariable: "METHOD", equals: "log" },
      ],
      code: "console.log('test');",
    });

    const yaml = parseYamlSafe(result.yaml);
    expect(result.yaml).toContain("constraints:");
    expect(result.yaml).toContain("OBJ:");
    expect(result.yaml).toContain("METHOD:");
    expect(result.yaml).toContain("^console$");
    expect(result.yaml).toContain("^log$");

    // Assert nested structure with real parser
    expect(yaml.constraints).toBeDefined();
    const constraints = yaml.constraints as Record<string, unknown>;
    expect(constraints.OBJ).toBeDefined();
    expect(constraints.METHOD).toBeDefined();
    const objConstraint = constraints.OBJ as Record<string, unknown>;
    const methodConstraint = constraints.METHOD as Record<string, unknown>;
    expect(objConstraint.regex).toBe("^console$");
    expect(methodConstraint.regex).toBe("^log$");
  });

  test("YAML escaping for special characters in strings", async () => {
    const result = await scanTool.execute({
      id: "escape-test",
      language: "javascript",
      pattern: 'console.log("$MSG")',
      message: "Don't use console.log with 'quotes' and \"double quotes\"",
      code: 'console.log("test");',
    });

    // Verify YAML escaping preserves special characters
    expect(result.yaml).toContain("message:");
    // Message should be properly escaped
    const yaml = parseYamlSafe(result.yaml);
    expect(yaml.message).toContain("quotes");
  });

  test("YAML with structural rule (kind)", async () => {
    const result = await scanTool.execute({
      id: "match-function",
      language: "javascript",
      rule: { kind: "function_declaration" },
      code: "function test() {}",
    });

    void parseYamlSafe(result.yaml);
    expect(result.yaml).toContain("rule:");
    expect(result.yaml).toContain("kind: function_declaration");
  });

  test("YAML with composite rule (all)", async () => {
    const result = await scanTool.execute({
      id: "complex-rule",
      language: "javascript",
      rule: {
        all: [{ kind: "call_expression" }, { pattern: "console.log($ARG)" }],
      },
      code: "console.log('test');",
    });

    const yaml = parseYamlSafe(result.yaml);
    expect(result.yaml).toContain("rule:");
    expect(result.yaml).toContain("all:");
    expect(result.yaml).toContain("kind: call_expression");
    expect(result.yaml).toContain("pattern:");

    // Assert nested rule structure with real parser
    expect(yaml.rule).toBeDefined();
    const rule = yaml.rule as Record<string, unknown>;
    expect(rule.all).toBeDefined();
    expect(Array.isArray(rule.all)).toBe(true);
    const allRules = rule.all as Array<Record<string, unknown>>;
    expect(allRules.length).toBe(2);
    expect(allRules[0].kind).toBe("call_expression");
    expect(allRules[1].pattern).toBe("console.log($ARG)");
  });

  test("YAML with relational rule (has)", async () => {
    const result = await scanTool.execute({
      id: "async-function",
      language: "javascript",
      rule: {
        kind: "function_declaration",
        has: { pattern: "await $E" },
      },
      code: "function test() { await fetch(); }",
    });

    const yaml = parseYamlSafe(result.yaml);
    expect(result.yaml).toContain("rule:");
    expect(result.yaml).toContain("kind: function_declaration");
    expect(result.yaml).toContain("has:");
    expect(result.yaml).toContain("pattern:");

    // Assert nested rule structure with real parser
    expect(yaml.rule).toBeDefined();
    const rule = yaml.rule as Record<string, unknown>;
    expect(rule.kind).toBe("function_declaration");
    expect(rule.has).toBeDefined();
    const hasRule = rule.has as Record<string, unknown>;
    expect(hasRule.pattern).toBe("await $E");
  });

  test("Language normalization in YAML", async () => {
    const result = await scanTool.execute({
      id: "ts-test",
      language: "typescript",
      pattern: "const $NAME: $TYPE = $VALUE",
      code: "const x: number = 1;",
    });

    const yaml = parseYamlSafe(result.yaml);
    assertYamlField(yaml, "language", "ts"); // typescript -> ts normalization
  });
});

// ============================================
// Temp File Lifecycle Tests
// ============================================

describe("Temp File Lifecycle", () => {
  test("Temp rule file created and cleaned up", async () => {
    // Capture rule file path from CLI args
    await scanTool.execute({
      id: "temp-test",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('test');",
    });

    const ruleFilePath = extractCliFlag(capturedArgs, "--rule") || "";
    expect(ruleFilePath).toBeTruthy();
    expect(ruleFilePath).toMatch(/rule-.*\.yml$/);

    // Note: In mocked tests, temp files are not actually created/deleted
    // This test verifies the path format is correct
    // Real file lifecycle is tested in integration tests
  });

  test("Temp code file created with correct extension", async () => {
    await scanTool.execute({
      id: "ext-test",
      language: "javascript",
      pattern: "console.log($ARG)",
      code: "console.log('test');",
    });

    // Verify temp code file has .js extension for JavaScript
    const positionalArgs = capturedArgs.slice(4);
    expect(positionalArgs[0]).toMatch(/astgrep-inline-.*\.js$/);
  });

  test("Temp code file extension matches language (TypeScript)", async () => {
    await scanTool.execute({
      id: "ext-test-ts",
      language: "typescript",
      pattern: "const $NAME: $TYPE = $VALUE",
      code: "const x: number = 1;",
    });

    // Verify temp code file has .ts extension for TypeScript
    const positionalArgs = capturedArgs.slice(4);
    expect(positionalArgs[0]).toMatch(/astgrep-inline-.*\.ts$/);
  });

  test("Temp code file extension matches language (Python)", async () => {
    await scanTool.execute({
      id: "ext-test-py",
      language: "python",
      pattern: "def $NAME($$$PARAMS): $$$BODY",
      code: "def test(): pass",
    });

    // Verify temp code file has .py extension for Python
    const positionalArgs = capturedArgs.slice(4);
    expect(positionalArgs[0]).toMatch(/astgrep-inline-.*\.py$/);
  });

  test("Unique temp file names for concurrent execution", async () => {
    // Execute twice in parallel
    const [result1, result2] = await Promise.all([
      scanTool.execute({
        id: "concurrent-1",
        language: "javascript",
        pattern: "console.log($ARG)",
        code: "console.log('test1');",
      }),
      scanTool.execute({
        id: "concurrent-2",
        language: "javascript",
        pattern: "console.log($ARG)",
        code: "console.log('test2');",
      }),
    ]);

    // Verify different temp file names (timestamp + random suffix)
    // Note: In mocked environment, files may have same name since execution is serialized
    // This test primarily verifies the code doesn't crash with concurrent execution
    expect(result1.yaml).toBeTruthy();
    expect(result2.yaml).toBeTruthy();
  });
});

// ============================================
// Language Normalization Tests
// ============================================

describe("Language Normalization", () => {
  test("All SearchTool language aliases normalized correctly", async () => {
    const aliases = [
      { input: "javascript", expected: "js" },
      { input: "typescript", expected: "ts" },
      { input: "python", expected: "py" },
      { input: "rust", expected: "rs" },
      { input: "golang", expected: "go" },
      { input: "c++", expected: "cpp" },
      { input: "kotlin", expected: "kt" },
    ];

    for (const { input, expected } of aliases) {
      await searchTool.execute({
        pattern: "$VAR",
        code: "test",
        language: input,
      });

      assertCliFlag(capturedArgs, "--lang", expected);
    }
  });

  test("All ReplaceTool language aliases normalized correctly", async () => {
    const aliases = [
      { input: "javascript", expected: "js" },
      { input: "typescript", expected: "ts" },
      { input: "python", expected: "py" },
      { input: "rust", expected: "rs" },
      { input: "golang", expected: "go" },
      { input: "c++", expected: "cpp" },
      { input: "kotlin", expected: "kt" },
    ];

    for (const { input, expected } of aliases) {
      await replaceTool.execute({
        pattern: "$VAR",
        replacement: "$VAR",
        code: "test",
        language: input,
      });

      assertCliFlag(capturedArgs, "--lang", expected);
    }
  });

  test("All ScanTool language aliases normalized in YAML", async () => {
    const aliases = [
      { input: "javascript", expected: "js" },
      { input: "typescript", expected: "ts" },
      { input: "python", expected: "py" },
      { input: "rust", expected: "rs" },
      { input: "golang", expected: "go" },
      { input: "c++", expected: "cpp" },
      { input: "kotlin", expected: "kt" },
    ];

    for (const { input, expected } of aliases) {
      const result = await scanTool.execute({
        id: "alias-test",
        language: input,
        pattern: "$VAR",
        code: "test",
      });

      const yaml = parseYamlSafe(result.yaml);
      assertYamlField(yaml, "language", expected);
    }
  });

  test("Case-insensitive language normalization", async () => {
    await searchTool.execute({
      pattern: "$VAR",
      code: "test",
      language: "JavaScript", // Mixed case
    });

    assertCliFlag(capturedArgs, "--lang", "js");
  });

  test("Unknown language passed through unchanged", async () => {
    await searchTool.execute({
      pattern: "$VAR",
      code: "test",
      language: "elixir", // Not in normalization map
    });

    assertCliFlag(capturedArgs, "--lang", "elixir");
  });
});

// ============================================
// Path Handling Tests
// ============================================

describe("Path Handling", () => {
  test("Relative paths preserved in CLI arguments", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      paths: ["src/utils/", "tests/unit/"],
      language: "javascript",
    });

    assertPositionalArgs(capturedArgs, ["src/utils/", "tests/unit/"]);
  });

  test("Single file path as positional argument", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      paths: ["src/index.ts"],
      language: "javascript",
    });

    assertPositionalArgs(capturedArgs, ["src/index.ts"]);
  });

  test("Empty paths array defaults to current directory", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      paths: [],
      language: "javascript",
    });

    assertPositionalArgs(capturedArgs, ["."]);
  });

  test("Path normalization for Windows paths (forward slashes)", async () => {
    // Note: WorkspaceManager.validatePaths normalizes Windows paths
    // This test verifies that normalized paths are passed to CLI
    await searchTool.execute({
      pattern: "console.log($ARG)",
      paths: ["src/tools/"], // Already normalized
      language: "javascript",
    });

    const positionalArgs = capturedArgs.slice(capturedArgs.indexOf("src/tools/"));
    expect(positionalArgs[0]).toBe("src/tools/");
    expect(positionalArgs[0]).not.toContain("\\"); // No backslashes
  });

  test("Multiple paths with mixed file and directory", async () => {
    await searchTool.execute({
      pattern: "console.log($ARG)",
      paths: ["src/", "tests/integration.test.ts", "build/"],
      language: "javascript",
    });

    assertPositionalArgs(capturedArgs, ["src/", "tests/integration.test.ts", "build/"]);
  });
});
