import { describe, test, expect, beforeAll } from "bun:test";
import { ScanTool } from "../src/tools/scan.js";
import { AstGrepBinaryManager } from "../src/core/binary-manager.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { ValidationError } from "../src/types/errors.js";

describe("Enhanced Constraints - not_regex", () => {
  let scanTool: ScanTool;
  let binaryManager: AstGrepBinaryManager;
  let workspaceManager: WorkspaceManager;

  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);
  });

  test("should exclude matches with not_regex constraint", async () => {
    const code = `
      const _private = 1;
      const public = 2;
      const _internal = 3;
      const visible = 4;
    `;

    const result = await scanTool.execute({
      id: "test-not-regex",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      where: [{ metavariable: "NAME", not_regex: "^_" }],
      code,
    });

    // Should match only public and visible (not _private or _internal)
    expect(result.scan.findings.length).toBe(2);
    
    // Verify YAML contains not: { regex: ... } structure
    expect(result.yaml).toContain("not:");
    expect(result.yaml).toContain("regex:");
    expect(result.yaml).toContain("^_");
  });

  test("should support not_regex with complex patterns", async () => {
    const code = `
      const testVar = 1;
      const testHelper = 2;
      const myVar = 3;
      const helper = 4;
    `;

    const result = await scanTool.execute({
      id: "test-not-regex-complex",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      where: [{ metavariable: "NAME", not_regex: "^test.*" }],
      code,
    });

    // Should match only myVar and helper (not testVar or testHelper)
    expect(result.scan.findings.length).toBe(2);
    
    // Verify YAML contains not: { regex: ^test.* }
    expect(result.yaml).toContain("not:");
    expect(result.yaml).toContain("^test");
  });

  test("should generate correct YAML with not: { regex: ... } structure", async () => {
    const result = await scanTool.execute({
      id: "test-not-yaml",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      where: [{ metavariable: "NAME", not_regex: "^_" }],
      code: "const x = 1;",
    });

    expect(result.yaml).toContain("not:");
    expect(result.yaml).toContain("regex:");
    expect(result.yaml.includes("not:") && result.yaml.indexOf("not:") < result.yaml.lastIndexOf("regex:")).toBe(true);
    
    // Check indentation
    const lines = result.yaml.split("\n");
    const notLine = lines.find((l) => l.includes("not:"));
    const regexLine = lines.find((l, i) => i > lines.indexOf(notLine!) && l.includes("regex:"));
    expect(notLine).toBeDefined();
    expect(regexLine).toBeDefined();
  });
});

describe("Enhanced Constraints - not_equals", () => {
  let scanTool: ScanTool;
  let binaryManager: AstGrepBinaryManager;
  let workspaceManager: WorkspaceManager;

  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);
  });

  test("should exclude exact matches with not_equals constraint", async () => {
    const code = `
      console.log("test");
      console.error("test");
      console.warn("test");
      console.debug("test");
    `;

    const result = await scanTool.execute({
      id: "test-not-equals",
      language: "javascript",
      pattern: "console.$METHOD($ARG)",
      where: [{ metavariable: "METHOD", not_equals: "log" }],
      code,
    });

    // Should match error, warn, and debug (not log)
    expect(result.scan.findings.length).toBe(3);
    
    // Verify YAML contains not: { regex: ^log$ }
    expect(result.yaml).toContain("not:");
    expect(result.yaml).toContain("^log$");
  });

  test("should convert not_equals to anchored regex in YAML", async () => {
    const result = await scanTool.execute({
      id: "test-not-equals-yaml",
      language: "javascript",
      pattern: "console.$METHOD($ARG)",
      where: [{ metavariable: "METHOD", not_equals: "log" }],
      code: "console.log('test');",
    });

    expect(result.yaml).toContain("not:");
    expect(result.yaml).toContain("^log$");
  });

  test("should handle special regex characters in not_equals", async () => {
    const code = `
      const obj = { "key.with.dots": 1 };
      const obj2 = { "normal": 2 };
      const obj3 = { "key*star": 3 };
    `;

    const result = await scanTool.execute({
      id: "test-not-equals-special",
      language: "javascript",
      pattern: 'const $OBJ = { "$KEY": $VALUE }',
      where: [{ metavariable: "KEY", not_equals: "key.with.dots" }],
      code,
    });

    // Should match obj2 and obj3, but not obj (which has "key.with.dots")
    expect(result.scan.findings.length).toBeGreaterThanOrEqual(1);
    
    // Verify YAML properly escapes regex characters (dots should be \.)
    expect(result.yaml).toContain("not:");
    expect(result.yaml).toContain("key\\.with\\.dots");
  });
});

describe("Enhanced Constraints - kind", () => {
  let scanTool: ScanTool;
  let binaryManager: AstGrepBinaryManager;
  let workspaceManager: WorkspaceManager;

  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);
  });

  test("should match only specific AST node types with kind constraint", async () => {
    const code = `
      console.log(myVar);
      console.log("string");
      console.log(123);
    `;

    const result = await scanTool.execute({
      id: "test-kind",
      language: "javascript",
      pattern: "console.log($ARG)",
      where: [{ metavariable: "ARG", kind: "identifier" }],
      code,
    });

    // Should match only identifier (myVar), not string or number literals
    expect(result.scan.findings.length).toBe(1);
    
    // Verify YAML contains kind: identifier
    expect(result.yaml).toContain("kind:");
    expect(result.yaml).toContain("identifier");
  });

  test("should support kind constraint for function_declaration", async () => {
    const code = `
      function myFunc() {}
      const arrow = () => {};
      const obj = { method() {} };
    `;

    const result = await scanTool.execute({
      id: "test-kind-function",
      language: "javascript",
      pattern: "function $NAME() { $$$BODY }",
      where: [{ metavariable: "NAME", kind: "identifier" }],
      code,
    });

    // Should match at least one function declaration with identifier name
    expect(result.scan.findings.length).toBeGreaterThanOrEqual(1);
    
    // Verify YAML contains kind: identifier
    expect(result.yaml).toContain("kind:");
    expect(result.yaml).toContain("identifier");
  });

  test("should generate correct YAML with kind field", async () => {
    const result = await scanTool.execute({
      id: "test-kind-yaml",
      language: "javascript",
      pattern: "console.log($ARG)",
      where: [{ metavariable: "ARG", kind: "identifier" }],
      code: "console.log(x);",
    });

    expect(result.yaml).toContain("kind:");
    expect(result.yaml).toContain("identifier");
    
    // Check that kind is at correct indentation
    const lines = result.yaml.split("\n");
    const kindLine = lines.find((l) => l.trim().startsWith("kind:"));
    expect(kindLine).toBeDefined();
    expect(kindLine).toMatch(/^\s{4}kind:/);
  });
});

describe("Enhanced Constraints - Combined Constraints", () => {
  let scanTool: ScanTool;
  let binaryManager: AstGrepBinaryManager;
  let workspaceManager: WorkspaceManager;

  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);
  });

  test("should support multiple constraint operators for same metavariable", async () => {
    const code = `
      const testVar = 1;
      const myVar = 2;
      const TEST_CONST = 3;
    `;

    const result = await scanTool.execute({
      id: "test-combined-same",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      where: [
        {
          metavariable: "NAME",
          regex: "^[a-z]",
          kind: "identifier",
        },
      ],
      code,
    });

    expect(result.yaml).toContain("regex:");
    expect(result.yaml).toContain("kind:");
    expect(result.scan.findings.length).toBeGreaterThanOrEqual(2);
  });

  test("should support constraints on multiple metavariables", async () => {
    const code = `
      console.log("test");
      logger.error("test");
      console.error("message");
    `;

    const result = await scanTool.execute({
      id: "test-combined-multi",
      language: "javascript",
      pattern: "$OBJ.$METHOD($ARG)",
      where: [
        { metavariable: "OBJ", equals: "console" },
        { metavariable: "METHOD", not_equals: "log" },
      ],
      code,
    });

    // Should match only console.error (not console.log or logger.error)
    expect(result.scan.findings.length).toBe(1);
    
    // Verify YAML contains both constraints
    expect(result.yaml).toContain("OBJ:");
    expect(result.yaml).toContain("METHOD:");
    expect(result.yaml).toContain("^console$");
    expect(result.yaml).toContain("^log$");
  });

  test("should support mixing positive and negative constraints", async () => {
    const code = `
      const validName = 1;
      const _private = 2;
      const anotherValid = 3;
      const _hidden = 4;
    `;

    const result = await scanTool.execute({
      id: "test-mixed-constraints",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      where: [{ metavariable: "NAME", regex: ".*", not_regex: "^_" }],
      code,
    });

    // Should match validName and anotherValid, but not _private or _hidden
    expect(result.scan.findings.length).toBe(2);
    
    // Verify YAML contains both positive and negative constraints
    expect(result.yaml).toContain("regex:");
    expect(result.yaml).toContain("not:");
  });
});

describe("Enhanced Constraints - Validation and Error Handling", () => {
  let scanTool: ScanTool;
  let binaryManager: AstGrepBinaryManager;
  let workspaceManager: WorkspaceManager;

  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);
  });

  test("should throw ValidationError for invalid kind format (uppercase)", async () => {
    await expect(
      scanTool.execute({
        id: "test-invalid-kind-uppercase",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", kind: "Identifier" }],
        code: "console.log(x);",
      })
    ).rejects.toThrow(ValidationError);

    try {
      await scanTool.execute({
        id: "test-invalid-kind-uppercase",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", kind: "Identifier" }],
        code: "console.log(x);",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("lowercase");
    }
  });

  test("should throw ValidationError for invalid kind format (with hyphens)", async () => {
    await expect(
      scanTool.execute({
        id: "test-invalid-kind-hyphens",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", kind: "function-declaration" }],
        code: "console.log(x);",
      })
    ).rejects.toThrow(ValidationError);

    try {
      await scanTool.execute({
        id: "test-invalid-kind-hyphens",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", kind: "function-declaration" }],
        code: "console.log(x);",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("underscores");
    }
  });

  test("should throw ValidationError for empty kind value", async () => {
    await expect(
      scanTool.execute({
        id: "test-empty-kind",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", kind: "" }],
        code: "console.log(x);",
      })
    ).rejects.toThrow(ValidationError);

    try {
      await scanTool.execute({
        id: "test-empty-kind",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", kind: "" }],
        code: "console.log(x);",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      // Early validation now catches empty kind with specific error message
      expect((error as ValidationError).message).toContain("kind parameter cannot be empty");
    }
  });

  test("should throw ValidationError for non-string not_regex", async () => {
    await expect(
      scanTool.execute({
        id: "test-invalid-not-regex-type",
        language: "javascript",
        pattern: "const $NAME = $VALUE",
        where: [{ metavariable: "NAME", not_regex: 123 as any }],
        code: "const x = 1;",
      })
    ).rejects.toThrow(ValidationError);

    try {
      await scanTool.execute({
        id: "test-invalid-not-regex-type",
        language: "javascript",
        pattern: "const $NAME = $VALUE",
        where: [{ metavariable: "NAME", not_regex: 123 as any }],
        code: "const x = 1;",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("not_regex must be a string");
    }
  });

  test("should throw ValidationError for non-string not_equals", async () => {
    await expect(
      scanTool.execute({
        id: "test-invalid-not-equals-type",
        language: "javascript",
        pattern: "console.$METHOD($ARG)",
        where: [{ metavariable: "METHOD", not_equals: true as any }],
        code: "console.log(x);",
      })
    ).rejects.toThrow(ValidationError);

    try {
      await scanTool.execute({
        id: "test-invalid-not-equals-type",
        language: "javascript",
        pattern: "console.$METHOD($ARG)",
        where: [{ metavariable: "METHOD", not_equals: true as any }],
        code: "console.log(x);",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("not_equals must be a string");
    }
  });

  test("should throw ValidationError for non-string kind", async () => {
    await expect(
      scanTool.execute({
        id: "test-invalid-kind-type",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", kind: null as any }],
        code: "console.log(x);",
      })
    ).rejects.toThrow(ValidationError);

    try {
      await scanTool.execute({
        id: "test-invalid-kind-type",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", kind: null as any }],
        code: "console.log(x);",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("kind must be a string");
    }
  });
});

describe("Enhanced Constraints - YAML Structure Verification", () => {
  let scanTool: ScanTool;
  let binaryManager: AstGrepBinaryManager;
  let workspaceManager: WorkspaceManager;

  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);
  });

  test("should generate valid YAML for not_regex constraint", async () => {
    const result = await scanTool.execute({
      id: "test-yaml-not-regex",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      where: [{ metavariable: "NAME", not_regex: "^_" }],
      code: "const x = 1;",
    });

    expect(result.yaml).toBeDefined();
    expect(result.yaml).toContain("constraints:");
    expect(result.yaml).toContain("NAME:");
    expect(result.yaml).toContain("not:");
    expect(result.yaml).toContain("regex:");
    
    // Verify structure order
    const yamlLines = result.yaml.split("\n");
    const constraintsIdx = yamlLines.findIndex((l) => l.includes("constraints:"));
    const notIdx = yamlLines.findIndex((l) => l.includes("not:"));
    const regexIdx = yamlLines.findIndex((l, i) => i > notIdx && l.includes("regex:"));
    expect(constraintsIdx).toBeGreaterThan(-1);
    expect(notIdx).toBeGreaterThan(constraintsIdx);
    expect(regexIdx).toBeGreaterThan(notIdx);
  });

  test("should generate valid YAML for not_equals constraint", async () => {
    const result = await scanTool.execute({
      id: "test-yaml-not-equals",
      language: "javascript",
      pattern: "console.$METHOD($ARG)",
      where: [{ metavariable: "METHOD", not_equals: "log" }],
      code: "console.log(x);",
    });

    expect(result.yaml).toContain("constraints:");
    expect(result.yaml).toContain("METHOD:");
    expect(result.yaml).toContain("not:");
    expect(result.yaml).toContain("^log$");
  });

  test("should generate valid YAML for kind constraint", async () => {
    const result = await scanTool.execute({
      id: "test-yaml-kind",
      language: "javascript",
      pattern: "console.log($ARG)",
      where: [{ metavariable: "ARG", kind: "identifier" }],
      code: "console.log(x);",
    });

    expect(result.yaml).toContain("constraints:");
    expect(result.yaml).toContain("ARG:");
    expect(result.yaml).toContain("kind:");
    expect(result.yaml).toContain("identifier");
  });

  test("should maintain correct indentation for nested not structures", async () => {
    const result = await scanTool.execute({
      id: "test-yaml-indentation",
      language: "javascript",
      pattern: "const $NAME = $VALUE",
      where: [{ metavariable: "NAME", not_regex: "^test" }],
      code: "const x = 1;",
    });

    const lines = result.yaml.split("\n");
    const nameLine = lines.find((l) => l.trim() === "NAME:");
    const notLine = lines.find((l) => l.includes("not:") && !l.includes("not_"));
    const regexLine = lines.find((l, i) => {
      const notIdx = lines.indexOf(notLine!);
      return i > notIdx && l.includes("regex:") && l.includes("^test");
    });

    expect(nameLine).toBeDefined();
    expect(notLine).toBeDefined();
    expect(regexLine).toBeDefined();

    // Check indentation levels
    const nameIndent = nameLine!.search(/\S/);
    const notIndent = notLine!.search(/\S/);
    const regexIndent = regexLine!.search(/\S/);

    expect(notIndent).toBeGreaterThan(nameIndent);
    expect(regexIndent).toBeGreaterThan(notIndent);
    expect(regexIndent - notIndent).toBe(2); // 2 spaces between not and regex
  });
});

describe("Enhanced Constraints - Cross-Language Support", () => {
  let scanTool: ScanTool;
  let binaryManager: AstGrepBinaryManager;
  let workspaceManager: WorkspaceManager;

  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);
  });

  test("should work with TypeScript kind constraints", async () => {
    const code = `
      const x: string = "test";
      const y: number = 42;
    `;

    const result = await scanTool.execute({
      id: "test-typescript-kind",
      language: "typescript",
      pattern: "const $NAME: $TYPE = $VALUE",
      where: [{ metavariable: "NAME", kind: "identifier" }],
      code,
    });

    expect(result.scan.findings.length).toBeGreaterThanOrEqual(2);
  });

  test("should work with Python kind constraints", async () => {
    const code = `
def my_func():
    pass

def another_func():
    pass
    `;

    const result = await scanTool.execute({
      id: "test-python-kind",
      language: "python",
      pattern: "def $NAME(): $$$BODY",
      where: [{ metavariable: "NAME", kind: "identifier" }],
      code,
    });

    expect(result.scan.findings.length).toBeGreaterThanOrEqual(2);
  });

  test("should work with Rust kind constraints", async () => {
    const code = `
fn my_func() {}
fn another_func() {}
    `;

    const result = await scanTool.execute({
      id: "test-rust-kind",
      language: "rust",
      pattern: "fn $NAME() { $$$BODY }",
      where: [{ metavariable: "NAME", kind: "identifier" }],
      code,
    });

    expect(result.scan.findings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Enhanced Constraints - Edge Cases", () => {
  let scanTool: ScanTool;
  let binaryManager: AstGrepBinaryManager;
  let workspaceManager: WorkspaceManager;

  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);
  });

  test("should handle empty not_regex pattern", async () => {
    await expect(
      scanTool.execute({
        id: "test-empty-not-regex",
        language: "javascript",
        pattern: "const $NAME = $VALUE",
        where: [{ metavariable: "NAME", not_regex: "" }],
        code: "const x = 1;",
      })
    ).rejects.toThrow(ValidationError);

    try {
      await scanTool.execute({
        id: "test-empty-not-regex",
        language: "javascript",
        pattern: "const $NAME = $VALUE",
        where: [{ metavariable: "NAME", not_regex: "" }],
        code: "const x = 1;",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain("at least one operator");
    }
  });

  test("should handle metavariable not in pattern", async () => {
    await expect(
      scanTool.execute({
        id: "test-missing-metavar",
        language: "javascript",
        pattern: "const $NAME = $VALUE",
        where: [{ metavariable: "MISSING", kind: "identifier" }],
        code: "const x = 1;",
      })
    ).rejects.toThrow(ValidationError);

    try {
      await scanTool.execute({
        id: "test-missing-metavar",
        language: "javascript",
        pattern: "const $NAME = $VALUE",
        where: [{ metavariable: "MISSING", kind: "identifier" }],
        code: "const x = 1;",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      const message = (error as ValidationError).message;
      expect(message).toContain("MISSING");
      expect(message).toContain("not in the pattern");
      expect(message).toContain("Available metavariables:");
    }
  });

  test("should handle kind containing underscores", async () => {
    const code = `
      function myFunc() {}
    `;

    const result = await scanTool.execute({
      id: "test-kind-underscores",
      language: "javascript",
      pattern: "function $NAME() { $$$BODY }",
      where: [{ metavariable: "NAME", kind: "identifier" }],
      code,
    });

    expect(result.yaml).toContain("kind:");
    expect(result.yaml).toContain("identifier");
    expect(result.scan.findings.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Nested Pattern Metavariables", () => {
  let scanTool: ScanTool;
  let binaryManager: AstGrepBinaryManager;
  let workspaceManager: WorkspaceManager;

  beforeAll(async () => {
    binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await binaryManager.initialize();
    workspaceManager = new WorkspaceManager();
    scanTool = new ScanTool(workspaceManager, binaryManager);
  });

  test("should extract metavariables from nested has pattern", async () => {
    const code = `
      function outer() {
        const myVar = 1;
      }
      function other() {
        const temp = 2;
      }
    `;

    // Rule with nested pattern in 'has' clause
    // The metavariable $VAR is introduced in the nested pattern, not the top-level
    // Key test: This should NOT throw ValidationError about VAR missing from pattern
    const result = await scanTool.execute({
      id: "test-nested-has",
      language: "javascript",
      rule: {
        kind: "function_declaration",
        has: {
          pattern: "const $VAR = $VALUE",
        },
      },
      where: [{ metavariable: "VAR", regex: "^my" }],
      code,
    });

    // Validation passed (no error thrown) - metavariable was correctly extracted
    expect(result.yaml).toContain("has:");
    expect(result.yaml).toContain("pattern:");
    expect(result.yaml).toContain("constraints:");
    expect(result.yaml).toContain("VAR:");
  });

  test("should extract metavariables from nested inside pattern", async () => {
    const code = `
      if (testCondition) {
        console.log("test");
      }
      if (otherCondition) {
        console.log("other");
      }
    `;

    // Metavariable $COND is in the inside clause
    // Key test: Should NOT throw ValidationError about COND missing
    const result = await scanTool.execute({
      id: "test-nested-inside",
      language: "javascript",
      rule: {
        pattern: "console.log($MSG)",
        inside: {
          pattern: "if ($COND) { $$$BODY }",
        },
      },
      where: [{ metavariable: "COND", regex: "^test" }],
      code,
    });

    // Validation passed - metavariable was correctly extracted from nested inside pattern
    expect(result.yaml).toContain("inside:");
    expect(result.yaml).toContain("constraints:");
  });

  test("should extract metavariables from all composite rule", async () => {
    const code = `
      const myVar = getValue();
      const otherVar = getValue();
    `;

    // Metavariables in all clause
    const result = await scanTool.execute({
      id: "test-nested-all",
      language: "javascript",
      rule: {
        all: [
          { pattern: "const $NAME = $VALUE" },
          { pattern: "$VALUE()" },
        ],
      },
      where: [{ metavariable: "NAME", regex: "^my" }],
      code,
    });

    expect(result.yaml).toContain("all:");
  });

  test("should extract metavariables from any composite rule", async () => {
    const code = `
      const myVar = 1;
      let testVar = 2;
    `;

    // Metavariables in any clause
    const result = await scanTool.execute({
      id: "test-nested-any",
      language: "javascript",
      rule: {
        any: [
          { pattern: "const $NAME = $VALUE" },
          { pattern: "let $NAME = $VALUE" },
        ],
      },
      where: [{ metavariable: "NAME", regex: "^my|^test" }],
      code,
    });

    expect(result.scan.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.yaml).toContain("any:");
  });

  test("should extract metavariables from not rule", async () => {
    const code = `
      function goodFunc() {
        return 1;
      }
      function badFunc() {
        console.log("test");
      }
    `;

    // Metavariable in not clause
    const result = await scanTool.execute({
      id: "test-nested-not",
      language: "javascript",
      rule: {
        pattern: "function $NAME() { $$$BODY }",
        not: {
          has: {
            pattern: "console.log($MSG)",
          },
        },
      },
      where: [{ metavariable: "NAME", regex: "^good" }],
      code,
    });

    expect(result.yaml).toContain("not:");
  });

  test("should extract metavariables from deeply nested patterns", async () => {
    const code = `
      class MyClass {
        method() {
          const value = getData();
        }
      }
    `;

    // Multiple levels of nesting
    // Key test: Should NOT throw ValidationError about CLASS or VAR missing
    const result = await scanTool.execute({
      id: "test-deep-nested",
      language: "javascript",
      rule: {
        pattern: "class $CLASS { $$$BODY }",
        has: {
          pattern: "const $VAR = $VALUE",
        },
      },
      where: [
        { metavariable: "CLASS", regex: "^My" },
        { metavariable: "VAR", equals: "value" },
      ],
      code,
    });

    // Validation passed - metavariables extracted from all nesting levels
    expect(result.yaml).toContain("has:");
    expect(result.yaml).toContain("constraints:");
    expect(result.yaml).toContain("CLASS:");
    expect(result.yaml).toContain("VAR:");
  });

  test("should reject constraint on metavariable not in any nested pattern", async () => {
    const code = `
      const x = 1;
    `;

    // MISSING is not in any pattern (top-level or nested)
    await expect(
      scanTool.execute({
        id: "test-missing-nested",
        language: "javascript",
        rule: {
          pattern: "const $NAME = $VALUE",
          has: {
            pattern: "const $OTHER = $VAL",
          },
        },
        where: [{ metavariable: "MISSING", regex: "test" }],
        code,
      })
    ).rejects.toThrow(ValidationError);
  });

  test("should handle fix with metavariables from nested patterns", async () => {
    const code = `
      function test() {
        const myVar = 1;
      }
    `;

    // Fix uses metavariable from nested pattern
    const result = await scanTool.execute({
      id: "test-fix-nested",
      language: "javascript",
      rule: {
        kind: "function_declaration",
        has: {
          pattern: "const $VAR = $VALUE",
        },
      },
      fix: "let $VAR = $VALUE",
      code,
    });

    // Should not throw validation error
    expect(result.yaml).toContain("fix:");
  });
});
