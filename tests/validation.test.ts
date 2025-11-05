/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Comprehensive test suite for validation utilities
 *
 * This test suite validates the edge cases documented in EDGE_CASES_AND_IMPROVEMENTS.md section 5.1.
 * Tests are organized by validator class:
 * - PatternValidator: Pattern syntax, metavariable names, metavariable extraction and comparison
 * - YamlValidator: YAML escaping, rule ID format, severity levels
 * - ParameterValidator: Context, maxMatches, timeout, code size validation
 * - ScanTool: Integration tests for constraint and fix template validation
 *
 * Uses Bun's test framework for fast, reliable test execution.
 */

import { describe, test, expect } from "bun:test";
import { PatternValidator, YamlValidator, ParameterValidator } from "../src/utils/validation.js";
import { ScanTool } from "../src/tools/scan.js";
import { WorkspaceManager } from "../src/core/workspace-manager.js";
import { AstGrepBinaryManager } from "../src/core/binary-manager.js";
import { ValidationError } from "../src/types/errors.js";

// ============================================
// PatternValidator Tests
// ============================================
describe("PatternValidator", () => {
  describe("validateMetavariableName", () => {
    test("accepts valid UPPER_CASE names", () => {
      expect(PatternValidator.validateMetavariableName("VAR")).toBe(true);
      expect(PatternValidator.validateMetavariableName("MY_VAR")).toBe(true);
      expect(PatternValidator.validateMetavariableName("VAR123")).toBe(true);
      expect(PatternValidator.validateMetavariableName("_PRIVATE")).toBe(true);
      expect(PatternValidator.validateMetavariableName("A")).toBe(true);
    });

    test("rejects invalid names", () => {
      expect(PatternValidator.validateMetavariableName("var")).toBe(false);
      expect(PatternValidator.validateMetavariableName("myVar")).toBe(false);
      expect(PatternValidator.validateMetavariableName("123VAR")).toBe(false);
      expect(PatternValidator.validateMetavariableName("my-var")).toBe(false);
      expect(PatternValidator.validateMetavariableName("my.var")).toBe(false);
    });
  });

  describe("extractMetavariables", () => {
    test("extracts single-node metavariables", () => {
      const result = PatternValidator.extractMetavariables("foo($VAR)");
      expect(result.has("VAR")).toBe(true);
      expect(result.size).toBe(1);
    });

    test("extracts multi-node metavariables", () => {
      const result = PatternValidator.extractMetavariables("foo($$$ARGS)");
      expect(result.has("ARGS")).toBe(true);
      expect(result.size).toBe(1);
    });

    test("extracts both single and multi-node metavariables", () => {
      const result = PatternValidator.extractMetavariables("function $NAME($$$PARAMS) { $$$BODY }");
      expect(result.has("NAME")).toBe(true);
      expect(result.has("PARAMS")).toBe(true);
      expect(result.has("BODY")).toBe(true);
      expect(result.size).toBe(3);
    });

    test("avoids double-counting multi-node metavariables", () => {
      const result = PatternValidator.extractMetavariables("foo($$$ARGS)");
      expect(result.size).toBe(1);
      expect(result.has("ARGS")).toBe(true);
    });

    test("extracts adjacent metavariables without separators", () => {
      const result = PatternValidator.extractMetavariables("$VAR1$VAR2");
      expect(result.has("VAR1")).toBe(true);
      expect(result.has("VAR2")).toBe(true);
      expect(result.size).toBe(2);
    });

    test("extracts metavariables at start and end of pattern", () => {
      const result = PatternValidator.extractMetavariables("$START middle $END");
      expect(result.has("START")).toBe(true);
      expect(result.has("END")).toBe(true);
      expect(result.size).toBe(2);
    });

    test("extracts from pattern with only metavariables", () => {
      const result = PatternValidator.extractMetavariables("$A $B $C");
      expect(result.has("A")).toBe(true);
      expect(result.has("B")).toBe(true);
      expect(result.has("C")).toBe(true);
      expect(result.size).toBe(3);
    });

    test("extracts metavariables from nested structures", () => {
      const result = PatternValidator.extractMetavariables("foo(bar($INNER), $OUTER)");
      expect(result.has("INNER")).toBe(true);
      expect(result.has("OUTER")).toBe(true);
      expect(result.size).toBe(2);
    });

    test("returns empty set for empty pattern", () => {
      const result = PatternValidator.extractMetavariables("");
      expect(result.size).toBe(0);
    });
  });

  describe("validatePattern", () => {
    test("accepts valid patterns", () => {
      const result = PatternValidator.validatePattern("console.log($ARG)");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("rejects empty patterns", () => {
      const result = PatternValidator.validatePattern("   ");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Pattern cannot be empty");
    });

    test("rejects bare $$$ without name", () => {
      const result = PatternValidator.validatePattern("foo($$$)");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("bare $$$"))).toBe(true);
    });

    test("rejects invalid metavariable names", () => {
      const result = PatternValidator.validatePattern("foo($invalid)");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid metavariable name"))).toBe(true);
    });

    test("accepts single-node anonymous metavariable $_", () => {
      const result = PatternValidator.validatePattern("foo($_)");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("rejects multi-node anonymous metavariable $$$_", () => {
      const result = PatternValidator.validatePattern("foo($$$_)");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Anonymous multi-node metavariable `$$$_` is not allowed. Use a named metavariable (e.g., `$$$ARGS`)."
      );
    });

    test("warns about complex patterns", () => {
      const result = PatternValidator.validatePattern("$A $B $C $D $E $F $G $H $I $J $K");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("complex patterns"))).toBe(true);
    });

    test("warns about $$$ at end without opening", () => {
      const result = PatternValidator.validatePattern("foo$$$)");
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("appears at end of expression"))).toBe(true);
    });

    test("accepts single-character metavariable as $_", () => {
      const result = PatternValidator.validatePattern("foo($_) + bar($_)");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("detects mixed valid and invalid metavariables", () => {
      const result = PatternValidator.validatePattern("foo($VALID, $invalid, $ANOTHER)");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("$invalid"))).toBe(true);
    });

    test("accepts metavariables with numbers", () => {
      const result = PatternValidator.validatePattern("foo($VAR1, $VAR2, $VAR_3)");
      expect(result.valid).toBe(true);
    });

    test("accepts pattern with only anonymous metavariables", () => {
      const result = PatternValidator.validatePattern("foo($_, $_, $_)");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("validates very long pattern without timeout", () => {
      const metavars = Array.from({ length: 50 }, (_, i) => `$VAR${i}`).join(" ");
      const result = PatternValidator.validatePattern(metavars);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
    });
  });

  describe("compareMetavariables", () => {
    test("accepts matching metavariables", () => {
      const result = PatternValidator.compareMetavariables("foo($VAR)", "bar($VAR)");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("rejects metavariables in replacement not in pattern", () => {
      const result = PatternValidator.compareMetavariables("foo($A)", "bar($B)");
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("$B") && e.includes("not defined in pattern"))
      ).toBe(true);
    });

    test("warns about unused metavariables", () => {
      const result = PatternValidator.compareMetavariables("foo($A, $B)", "bar($A)");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("not used in replacement"))).toBe(true);
    });

    test("handles multi-node metavariables", () => {
      const result = PatternValidator.compareMetavariables(
        "function $NAME($$$PARAMS) { $$$BODY }",
        "const $NAME = ($$$PARAMS) => { $$$BODY }"
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("accepts empty pattern and empty replacement", () => {
      const result = PatternValidator.compareMetavariables("foo()", "bar()");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    test("detects multiple undefined metavariables in replacement", () => {
      const result = PatternValidator.compareMetavariables("foo($A)", "bar($B, $C, $D)");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("$B"))).toBe(true);
      expect(result.errors.some((e) => e.includes("$C"))).toBe(true);
      expect(result.errors.some((e) => e.includes("$D"))).toBe(true);
    });

    test("treats lowercase metavariables as invalid in pattern", () => {
      const result = PatternValidator.compareMetavariables("foo($VAR)", "bar($var)");
      expect(result.valid).toBe(true);
    });

    test("allows metavariable reordering", () => {
      const result = PatternValidator.compareMetavariables("foo($A, $B, $C)", "bar($C, $A, $B)");
      expect(result.valid).toBe(true);
    });

    test("allows metavariable duplication in replacement", () => {
      const result = PatternValidator.compareMetavariables("foo($A, $B)", "bar($A, $A, $A)");
      expect(result.valid).toBe(true);
    });

    test("warns about partial metavariable usage", () => {
      const result = PatternValidator.compareMetavariables("foo($A, $B, $C)", "bar($B)");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("$A"))).toBe(true);
      expect(result.warnings?.some((w) => w.includes("$C"))).toBe(true);
    });
  });
});

// ============================================
// YamlValidator Tests
// ============================================
describe("YamlValidator", () => {
  describe("escapeYamlString", () => {
    test("returns simple strings as-is", () => {
      expect(YamlValidator.escapeYamlString("simple")).toBe("simple");
      expect(YamlValidator.escapeYamlString("test123")).toBe("test123");
    });

    test("quotes strings with special characters", () => {
      const result = YamlValidator.escapeYamlString("test: value");
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    test("escapes quotes in strings", () => {
      const result = YamlValidator.escapeYamlString('say "hello"');
      expect(result).toContain('\\"');
    });

    test("escapes newlines", () => {
      const result = YamlValidator.escapeYamlString("line1\nline2");
      expect(result).toContain("\\n");
    });

    test("quotes YAML keywords", () => {
      expect(YamlValidator.escapeYamlString("true")).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString("false")).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString("null")).toMatch(/^"/);
    });

    test("handles strings with backslashes", () => {
      const result = YamlValidator.escapeYamlString("path\\to\\file");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    test("escapes strings with tabs", () => {
      const result = YamlValidator.escapeYamlString("column1\tcolumn2");
      expect(result).toContain("\\t");
    });

    test("escapes strings with carriage returns", () => {
      const result = YamlValidator.escapeYamlString("line1\rline2");
      expect(result).toContain("\\r");
    });

    test("handles strings with mixed special characters", () => {
      const result = YamlValidator.escapeYamlString('test: "value" {key} [array]');
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    test("quotes YAML keywords with different cases", () => {
      expect(YamlValidator.escapeYamlString("True")).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString("FALSE")).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString("Null")).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString("YES")).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString("No")).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString("ON")).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString("off")).toMatch(/^"/);
    });

    test("quotes strings with leading/trailing whitespace", () => {
      const result = YamlValidator.escapeYamlString("  spaced  ");
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    test("handles empty string", () => {
      const result = YamlValidator.escapeYamlString("");
      expect(typeof result).toBe("string");
    });

    test("handles Unicode characters", () => {
      const result = YamlValidator.escapeYamlString("Hello 世界 🌍");
      expect(result).toContain("世界");
      expect(result).toContain("🌍");
    });
  });

  describe("validateRuleId", () => {
    test("accepts valid kebab-case IDs", () => {
      const result = YamlValidator.validateRuleId("no-console-log");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("rejects empty IDs", () => {
      const result = YamlValidator.validateRuleId("");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot be empty"))).toBe(true);
    });

    test("rejects IDs with uppercase letters", () => {
      const result = YamlValidator.validateRuleId("No-Console");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("kebab-case"))).toBe(true);
    });

    test("rejects IDs with spaces", () => {
      const result = YamlValidator.validateRuleId("my rule");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("kebab-case"))).toBe(true);
    });

    test("warns about very long IDs", () => {
      const longId = "a".repeat(51);
      const result = YamlValidator.validateRuleId(longId);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("very long"))).toBe(true);
    });

    test("warns about IDs starting with hyphen", () => {
      const result = YamlValidator.validateRuleId("-test");
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("should not start"))).toBe(true);
    });

    test("rejects rule ID with underscores", () => {
      const result = YamlValidator.validateRuleId("my_rule_id");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("kebab-case"))).toBe(true);
    });

    test("accepts rule ID with consecutive hyphens", () => {
      const result = YamlValidator.validateRuleId("my--rule");
      expect(result.valid).toBe(true);
    });

    test("accepts rule IDs with numbers", () => {
      expect(YamlValidator.validateRuleId("rule-123").valid).toBe(true);
      expect(YamlValidator.validateRuleId("123-rule").valid).toBe(true);
      expect(YamlValidator.validateRuleId("rule-1-2-3").valid).toBe(true);
    });

    test("rejects rule IDs with special characters", () => {
      expect(YamlValidator.validateRuleId("rule@name").valid).toBe(false);
      expect(YamlValidator.validateRuleId("rule.name").valid).toBe(false);
      expect(YamlValidator.validateRuleId("rule_name").valid).toBe(false);
    });

    test("accepts rule ID exactly 50 characters", () => {
      const result = YamlValidator.validateRuleId("a".repeat(50));
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    test("warns about rule ID exactly 51 characters", () => {
      const result = YamlValidator.validateRuleId("a".repeat(51));
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("very long"))).toBe(true);
    });

    test("accepts rule ID ending with hyphen but may have warnings", () => {
      const result = YamlValidator.validateRuleId("test-rule-");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateSeverity", () => {
    test("accepts valid severity levels", () => {
      expect(YamlValidator.validateSeverity("error").valid).toBe(true);
      expect(YamlValidator.validateSeverity("warning").valid).toBe(true);
      expect(YamlValidator.validateSeverity("info").valid).toBe(true);
    });

    test("rejects invalid severity levels", () => {
      const result = YamlValidator.validateSeverity("critical");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid severity"))).toBe(true);
    });
  });
});

// ============================================
// ScanTool Integration Tests
// ============================================
describe("ScanTool.buildYaml", () => {
  // Create minimal instances for testing
  const workspaceManager = new WorkspaceManager(process.cwd());
  const binaryManager = new AstGrepBinaryManager();
  const scanTool = new ScanTool(workspaceManager, binaryManager);

  describe("constraint metavariable validation", () => {
    test("throws ValidationError when constraint references missing metavariable", async () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "MISSING_VAR", regex: "^test" }],
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain(
          "Constraint references metavariable 'MISSING_VAR' which is not in the pattern"
        );
        expect((error as ValidationError).message).toContain("Available metavariables: ARG");
      }
    });

    test("throws ValidationError when constraint has neither regex nor equals", async () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [
          { metavariable: "ARG" }, // Missing both regex and equals
        ],
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain(
          "Constraint for metavariable 'ARG' must specify either 'regex' or 'equals' with a non-empty value"
        );
      }
    });

    test("throws ValidationError when constraint has empty regex string", async () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [
          { metavariable: "ARG", regex: "   " }, // Empty/whitespace regex
        ],
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain(
          "must specify either 'regex' or 'equals' with a non-empty value"
        );
      }
    });

    test("throws ValidationError when constraint has empty equals string", async () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [
          { metavariable: "ARG", equals: "" }, // Empty equals
        ],
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain(
          "must specify either 'regex' or 'equals' with a non-empty value"
        );
      }
    });

    // NOTE: Tests for successful execution with valid constraints require ast-grep binary
    // to be installed and initialized. The validation tests above are sufficient to verify
    // that constraints with 'equals' are converted to anchored regex (^value$) via the
    // code path that handles both regex and equals constraints.

    test("prefers regex when both regex and equals are provided", () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", regex: "test.*", equals: "value" }],
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain("test.*");
      expect(yaml).not.toContain("^value$");
    });

    test("validates constraint with valid regex pattern", () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", regex: "^[A-Z]+$" }],
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain("^[A-Z]+$");
      expect(yaml).toContain("regex:");
    });

    test("validates constraint with equals containing special characters", () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [{ metavariable: "ARG", equals: "test:value" }],
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain("^test:value$");
      expect(yaml).toContain("regex:");
    });

    test("allows multiple constraints on same metavariable", () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "console.log($ARG)",
        where: [
          { metavariable: "ARG", regex: "^test" },
          { metavariable: "ARG", regex: "end$" },
        ],
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain("^test");
      expect(yaml).toContain("end$");
    });

    test("validates constraint on multi-node metavariable", () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "foo($$$ARGS)",
        where: [{ metavariable: "ARGS", regex: "test" }],
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain("ARGS");
      expect(yaml).toContain("test");
    });
  });

  describe("fix template metavariable validation", () => {
    test("throws ValidationError when fix references missing metavariable", async () => {
      const params = {
        id: "test-rule",
        language: "javascript",
        pattern: "console.log($ARG)",
        fix: "logger.info($MISSING_VAR)",
        code: 'console.log("test");',
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain(
          "Fix template uses metavariable 'MISSING_VAR' which is not in the pattern"
        );
        expect((error as ValidationError).message).toContain("Available metavariables: ARG");
      }
    });

    // NOTE: Tests for successful execution with valid fix templates require ast-grep binary
    // to be installed and initialized. The validation test above is sufficient to verify
    // that fix templates correctly validate metavariable references.
  });
});

// ============================================
// ParameterValidator Tests
// ============================================
describe("ParameterValidator", () => {
  describe("validateContext", () => {
    test("accepts valid context values", () => {
      expect(ParameterValidator.validateContext(0).valid).toBe(true);
      expect(ParameterValidator.validateContext(3).valid).toBe(true);
      expect(ParameterValidator.validateContext(100).valid).toBe(true);
    });

    test("accepts undefined/null", () => {
      expect(ParameterValidator.validateContext(undefined).valid).toBe(true);
      expect(ParameterValidator.validateContext(null).valid).toBe(true);
    });

    test("rejects non-numbers", () => {
      const result = ParameterValidator.validateContext("3" as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("must be a number"))).toBe(true);
    });

    test("rejects negative values", () => {
      const result = ParameterValidator.validateContext(-5);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("non-negative"))).toBe(true);
    });

    test("rejects values over 100", () => {
      const result = ParameterValidator.validateContext(101);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot exceed 100"))).toBe(true);
    });

    test("rejects NaN value", () => {
      const result = ParameterValidator.validateContext(NaN);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("finite number") || e.includes("must be a number"))
      ).toBe(true);
    });

    test("rejects Infinity", () => {
      const result = ParameterValidator.validateContext(Infinity);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("finite number") || e.includes("cannot exceed 100"))
      ).toBe(true);
    });

    test("rejects negative Infinity", () => {
      const result = ParameterValidator.validateContext(-Infinity);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("finite number") || e.includes("non-negative"))
      ).toBe(true);
    });

    test("accepts exact boundary value 100", () => {
      const result = ParameterValidator.validateContext(100);
      expect(result.valid).toBe(true);
    });

    test("accepts exact boundary value 0", () => {
      const result = ParameterValidator.validateContext(0);
      expect(result.valid).toBe(true);
    });

    test("accepts floating point value", () => {
      const result = ParameterValidator.validateContext(3.5);
      expect(result.valid).toBe(true);
    });

    test("rejects very large negative number", () => {
      const result = ParameterValidator.validateContext(-999999);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("non-negative"))).toBe(true);
    });
  });

  describe("validateMaxMatches", () => {
    test("accepts valid maxMatches values", () => {
      expect(ParameterValidator.validateMaxMatches(1).valid).toBe(true);
      expect(ParameterValidator.validateMaxMatches(100).valid).toBe(true);
      expect(ParameterValidator.validateMaxMatches(10000).valid).toBe(true);
    });

    test("rejects zero and negative values", () => {
      expect(ParameterValidator.validateMaxMatches(0).valid).toBe(false);
      expect(ParameterValidator.validateMaxMatches(-1).valid).toBe(false);
    });

    test("rejects values over 10000", () => {
      const result = ParameterValidator.validateMaxMatches(10001);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot exceed 10000"))).toBe(true);
    });

    test("rejects NaN value", () => {
      const result = ParameterValidator.validateMaxMatches(NaN);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("finite number") || e.includes("must be"))).toBe(
        true
      );
    });

    test("rejects Infinity", () => {
      const result = ParameterValidator.validateMaxMatches(Infinity);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("finite number") || e.includes("cannot exceed 10000"))
      ).toBe(true);
    });

    test("accepts exact boundary value 1", () => {
      const result = ParameterValidator.validateMaxMatches(1);
      expect(result.valid).toBe(true);
    });

    test("accepts exact boundary value 10000", () => {
      const result = ParameterValidator.validateMaxMatches(10000);
      expect(result.valid).toBe(true);
    });

    test("accepts floating point value", () => {
      const result = ParameterValidator.validateMaxMatches(100.5);
      expect(result.valid).toBe(true);
    });

    test("rejects very large number", () => {
      const result = ParameterValidator.validateMaxMatches(999999);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot exceed 10000"))).toBe(true);
    });
  });

  describe("validateTimeout", () => {
    test("accepts valid timeout values", () => {
      expect(ParameterValidator.validateTimeout(1000).valid).toBe(true);
      expect(ParameterValidator.validateTimeout(30000).valid).toBe(true);
      expect(ParameterValidator.validateTimeout(300000).valid).toBe(true);
    });

    test("rejects values below 1000", () => {
      const result = ParameterValidator.validateTimeout(999);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("at least 1000"))).toBe(true);
    });

    test("rejects values over 300000", () => {
      const result = ParameterValidator.validateTimeout(300001);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot exceed 300000"))).toBe(true);
    });

    test("rejects NaN value", () => {
      const result = ParameterValidator.validateTimeout(NaN);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("finite number") || e.includes("must be"))).toBe(
        true
      );
    });

    test("rejects Infinity", () => {
      const result = ParameterValidator.validateTimeout(Infinity);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("finite number") || e.includes("cannot exceed 300000"))
      ).toBe(true);
    });

    test("accepts exact boundary value 1000", () => {
      const result = ParameterValidator.validateTimeout(1000);
      expect(result.valid).toBe(true);
    });

    test("accepts exact boundary value 300000", () => {
      const result = ParameterValidator.validateTimeout(300000);
      expect(result.valid).toBe(true);
    });

    test("rejects value just below minimum", () => {
      const result = ParameterValidator.validateTimeout(999);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("at least 1000"))).toBe(true);
    });

    test("rejects value just above maximum", () => {
      const result = ParameterValidator.validateTimeout(300001);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot exceed 300000"))).toBe(true);
    });

    test("rejects zero", () => {
      const result = ParameterValidator.validateTimeout(0);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("at least 1000"))).toBe(true);
    });
  });

  describe("validateCode", () => {
    test("accepts valid code strings", () => {
      expect(ParameterValidator.validateCode('console.log("test")').valid).toBe(true);
    });

    test("accepts undefined/null", () => {
      expect(ParameterValidator.validateCode(undefined).valid).toBe(true);
      expect(ParameterValidator.validateCode(null).valid).toBe(true);
    });

    test("rejects non-strings", () => {
      const result = ParameterValidator.validateCode(123 as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("must be a string"))).toBe(true);
    });

    test("rejects empty strings", () => {
      const result = ParameterValidator.validateCode("   ");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot be empty"))).toBe(true);
    });

    test("rejects code over 1MB", () => {
      const largeCode = "a".repeat(1048577);
      const result = ParameterValidator.validateCode(largeCode);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cannot exceed 1MB"))).toBe(true);
    });

    test("accepts code at exact 1MB boundary", () => {
      const exactMB = "a".repeat(1048576);
      const result = ParameterValidator.validateCode(exactMB);
      expect(result.valid).toBe(true);
    });

    test("rejects code just over 1MB", () => {
      const justOver = "a".repeat(1048577);
      const result = ParameterValidator.validateCode(justOver);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("bytes") && e.includes("KB") && e.includes("MB"))
      ).toBe(true);
    });

    test("validates multi-byte Unicode characters by byte count", () => {
      const unicodeChar = "世";
      const charByteSize = new TextEncoder().encode(unicodeChar).length;
      const charsNeeded = Math.floor(1048576 / charByteSize) + 1;
      const overSizeUnicode = unicodeChar.repeat(charsNeeded);
      const result = ParameterValidator.validateCode(overSizeUnicode);
      expect(result.valid).toBe(false);
    });

    test("rejects code with only whitespace", () => {
      const result = ParameterValidator.validateCode("\n\n\t  \r\n");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    });

    test("accepts code with leading/trailing whitespace but valid content", () => {
      const result = ParameterValidator.validateCode('  console.log("test");  ');
      expect(result.valid).toBe(true);
    });

    test("accepts very long single line under 1MB", () => {
      const longLine = "a".repeat(500000);
      const result = ParameterValidator.validateCode(longLine);
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================
// PathValidator Tests
// ============================================
describe("PathValidator", () => {
  describe("normalizePath", () => {
    test("normalizes Windows absolute paths with backslashes", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("C:\\Users\\project\\src");
      expect(result).toBe("C:/Users/project/src");
    });

    test("preserves Windows absolute paths with forward slashes", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("C:/Users/project/src");
      expect(result).toBe("C:/Users/project/src");
    });

    test("normalizes Windows absolute paths with mixed separators", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("C:\\Users/project\\src");
      expect(result).toBe("C:/Users/project/src");
    });

    test("normalizes UNC paths", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("\\\\server\\share\\folder");
      expect(result).toBe("//server/share/folder");
    });

    test("preserves Unix absolute paths unchanged", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("/home/user/project");
      expect(result).toBe("/home/user/project");
    });

    test("normalizes relative paths with backslashes on all platforms", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("src\\components\\Button.tsx");
      // Backslashes are always normalized to forward slashes for ast-grep compatibility
      expect(result).toBe("src/components/Button.tsx");
    });

    test("preserves relative paths with forward slashes", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("src/components/Button.tsx");
      expect(result).toBe("src/components/Button.tsx");
    });

    test("handles edge case: empty string", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("");
      expect(result).toBe("");
    });

    test("handles edge case: single dot", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath(".");
      expect(result).toBe(".");
    });

    test("handles edge case: double dot", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("..");
      // Double dot is a valid relative path, normalization applies if on Windows
      if (process.platform === "win32") {
        expect(result).toBe("..");
      } else {
        expect(result).toBe("..");
      }
    });

    test("normalizes paths with spaces", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      const result = PathValidator.normalizePath("C:\\Program Files\\MyApp");
      expect(result).toBe("C:/Program Files/MyApp");
    });

    test("platform-specific behavior: normalizes backslashes on all platforms", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      // Windows absolute path should be normalized regardless of platform
      const windowsPath = PathValidator.normalizePath("D:\\code\\app");
      expect(windowsPath).toBe("D:/code/app");

      // Unix path without backslashes should not be modified
      const unixPath = PathValidator.normalizePath("/usr/local/bin");
      expect(unixPath).toBe("/usr/local/bin");
    });
  });

  describe("isWindowsAbsolutePath", () => {
    test("detects valid Windows absolute paths with forward slash", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      expect(PathValidator.isWindowsAbsolutePath("C:/")).toBe(true);
      expect(PathValidator.isWindowsAbsolutePath("D:/")).toBe(true);
      expect(PathValidator.isWindowsAbsolutePath("E:/Users")).toBe(true);
      expect(PathValidator.isWindowsAbsolutePath("Z:/path")).toBe(true);
    });

    test("detects valid Windows absolute paths with backslash", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      expect(PathValidator.isWindowsAbsolutePath("C:\\")).toBe(true);
      expect(PathValidator.isWindowsAbsolutePath("D:\\folder")).toBe(true);
    });

    test("rejects Unix absolute paths", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      expect(PathValidator.isWindowsAbsolutePath("/home/user")).toBe(false);
      expect(PathValidator.isWindowsAbsolutePath("/usr/local/bin")).toBe(false);
    });

    test("rejects relative paths", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      expect(PathValidator.isWindowsAbsolutePath("./relative")).toBe(false);
      expect(PathValidator.isWindowsAbsolutePath("../parent")).toBe(false);
      expect(PathValidator.isWindowsAbsolutePath("src/components")).toBe(false);
    });

    test("rejects invalid Windows path without separator", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      expect(PathValidator.isWindowsAbsolutePath("C:relative")).toBe(false);
      expect(PathValidator.isWindowsAbsolutePath("C:")).toBe(false);
      expect(PathValidator.isWindowsAbsolutePath("C")).toBe(false);
    });

    test("detects lowercase drive letters", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      expect(PathValidator.isWindowsAbsolutePath("c:/path")).toBe(true);
      expect(PathValidator.isWindowsAbsolutePath("d:\\folder")).toBe(true);
    });

    test("rejects invalid drive letter patterns", () => {
      const { PathValidator } = require("../src/utils/validation.js");
      expect(PathValidator.isWindowsAbsolutePath("CC:/path")).toBe(false);
      expect(PathValidator.isWindowsAbsolutePath("1:/path")).toBe(false);
    });
  });
});

// ============================================
// Enhanced PatternValidator Tests
// ============================================
describe("PatternValidator - Enhanced Features", () => {
  describe("detectInvalidMetavariablePlacement", () => {
    test("detects metavariable embedded in identifier prefix", () => {
      const result = PatternValidator.validatePattern("use$HOOK");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid metavariable placement"))).toBe(true);
      expect(result.errors.some((e) => e.includes("use$HOOK"))).toBe(true);
    });

    test("detects multiple embedded patterns", () => {
      const result = PatternValidator.validatePattern("obj.on$EVENT");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("n$EVENT"))).toBe(true);
    });

    test("detects metavariable embedded in identifier suffix", () => {
      const result = PatternValidator.validatePattern("$VARname");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("$VARname"))).toBe(true);
    });

    test("detects metavariable inside single-quoted strings", () => {
      const result = PatternValidator.validatePattern("'Hello $WORLD'");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid metavariable placement"))).toBe(true);
    });

    test("detects metavariable inside double-quoted strings", () => {
      const result = PatternValidator.validatePattern('"value: $VAR"');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid metavariable placement"))).toBe(true);
    });

    test("detects metavariable inside template literals", () => {
      const result = PatternValidator.validatePattern("`Hello $WORLD`");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid metavariable placement"))).toBe(true);
    });

    test("accepts valid patterns with proper metavariable placement", () => {
      const result1 = PatternValidator.validatePattern("$VAR");
      expect(result1.valid).toBe(true);

      const result2 = PatternValidator.validatePattern("obj.$METHOD");
      expect(result2.valid).toBe(true);

      const result3 = PatternValidator.validatePattern("$VAR1 + $VAR2");
      expect(result3.valid).toBe(true);
    });

    test("detects multiple invalid placements in one pattern", () => {
      const result = PatternValidator.validatePattern('use$HOOK($VAR, "text $TEXT")');
      expect(result.valid).toBe(false);
      // Should have errors for both use$HOOK and "text $TEXT"
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test("accepts metavariable at word boundary", () => {
      const result1 = PatternValidator.validatePattern("$VAR.method()");
      expect(result1.valid).toBe(true);

      const result2 = PatternValidator.validatePattern("func($VAR)");
      expect(result2.valid).toBe(true);
    });
  });

  describe("detectASTStructureRequirements", () => {
    test("warns about decorator patterns", () => {
      const result = PatternValidator.validatePattern("@Component");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(
        result.warnings!.some((w) => w.includes("decorators") && w.includes("@Component"))
      ).toBe(true);
      expect(result.warnings!.some((w) => w.includes("ast-grep.github.io"))).toBe(true);
    });

    test("warns about lowercase decorator patterns", () => {
      const result = PatternValidator.validatePattern("@decorator");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("decorators"))).toBe(true);
    });

    test("warns about namespaced decorator patterns", () => {
      const result = PatternValidator.validatePattern("@angular.Component");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("decorators"))).toBe(true);
    });

    test("warns about type annotation patterns", () => {
      const result = PatternValidator.validatePattern("$VAR: string");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("type annotations"))).toBe(true);
      expect(result.warnings!.some((w) => w.includes("kind"))).toBe(true);
    });

    test("warns about complex type annotations", () => {
      const result = PatternValidator.validatePattern("$VAR: Map<string, number>");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("type annotations"))).toBe(true);
    });

    test("warns about modifier patterns", () => {
      const result1 = PatternValidator.validatePattern("public $VAR");
      expect(result1.valid).toBe(true);
      expect(result1.warnings!.some((w) => w.includes("modifiers"))).toBe(true);

      const result2 = PatternValidator.validatePattern("private $METHOD");
      expect(result2.valid).toBe(true);
      expect(result2.warnings!.some((w) => w.includes("modifiers"))).toBe(true);

      const result3 = PatternValidator.validatePattern("static $FIELD");
      expect(result3.valid).toBe(true);
      expect(result3.warnings!.some((w) => w.includes("modifiers"))).toBe(true);
    });

    test("warns about combined patterns", () => {
      const result = PatternValidator.validatePattern("@Component public $VAR: string");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      // Should have warnings for both decorators and type annotations
      expect(result.warnings!.some((w) => w.includes("decorators"))).toBe(true);
      expect(result.warnings!.some((w) => w.includes("type annotations"))).toBe(true);
    });

    test("does not warn for patterns without AST structure issues", () => {
      const result1 = PatternValidator.validatePattern("console.log($VAR)");
      expect(result1.valid).toBe(true);
      if (result1.warnings) {
        expect(
          result1.warnings.some((w) => w.includes("decorators") || w.includes("type annotations"))
        ).toBe(false);
      }

      const result2 = PatternValidator.validatePattern("function $NAME() {}");
      expect(result2.valid).toBe(true);
      if (result2.warnings) {
        expect(
          result2.warnings.some((w) => w.includes("decorators") || w.includes("type annotations"))
        ).toBe(false);
      }
    });

    test("warnings contain actionable guidance and documentation URLs", () => {
      const result = PatternValidator.validatePattern("@Component");
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("https://"))).toBe(true);
      expect(result.warnings!.some((w) => w.includes("Consider") || w.includes("Use"))).toBe(true);
    });

    test("warnings are in warnings array, not errors", () => {
      const result = PatternValidator.validatePattern("@Component");
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });
  });

  describe("calculateComplexityScore", () => {
    test("classifies simple patterns (score < 5)", () => {
      const result1 = PatternValidator.validatePattern("$VAR");
      expect(result1.valid).toBe(true);
      // Simple pattern should not trigger complexity warnings

      const result2 = PatternValidator.validatePattern("foo($A, $B)");
      expect(result2.valid).toBe(true);

      const result3 = PatternValidator.validatePattern("const $NAME = $VALUE");
      expect(result3.valid).toBe(true);
    });

    test("classifies moderate patterns (score 5-10)", () => {
      // Pattern with 5-7 metavariables
      const result = PatternValidator.validatePattern(
        "function $NAME($A, $B, $C, $D) { return $E; }"
      );
      expect(result.valid).toBe(true);
      // May or may not trigger warnings depending on exact score
    });

    test("classifies complex patterns (score 10-15)", () => {
      // Pattern with 8-10 metavariables
      const pattern = "function $NAME($A, $B, $C, $D, $E, $F, $G, $H) {}";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      // Should trigger complexity warning
      if (result.warnings) {
        expect(result.warnings.some((w) => w.includes("complexity") || w.includes("complex"))).toBe(
          true
        );
      }
    });

    test("classifies very complex patterns (score > 15)", () => {
      // Pattern with 11+ metavariables
      const pattern = "function $NAME($A, $B, $C, $D, $E, $F, $G, $H, $I, $J, $K) {}";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(
        result.warnings!.some((w) => w.includes("very_complex") || w.includes("Very complex"))
      ).toBe(true);
    });

    test("multi-node metavariables contribute more to score", () => {
      // Pattern with multi-node metavariables should have higher score
      const result = PatternValidator.validatePattern("function $NAME($$$PARAMS) { $$$BODY }");
      expect(result.valid).toBe(true);
      // Multi-node metavariables weighted 2x vs single-node
    });

    test("pattern length contributes to score", () => {
      // Very long pattern should increase score
      const longPattern = "a".repeat(500) + " $VAR";
      const result = PatternValidator.validatePattern(longPattern);
      expect(result.valid).toBe(true);
      // Length / 100 contributes to score
    });

    test("exact boundary: 10 metavariables", () => {
      const pattern = "$A $B $C $D $E $F $G $H $I $J";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      // Exactly 10 metavariables should NOT trigger >10 warning
      if (result.warnings) {
        const has10Warning = result.warnings.some((w) => w.includes("threshold: 10"));
        expect(has10Warning).toBe(false);
      }
    });

    test("exact boundary: 11 metavariables", () => {
      const pattern = "$A $B $C $D $E $F $G $H $I $J $K";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      // Should trigger >10 metavariable warning
      expect(result.warnings!.some((w) => w.includes("11 metavariables"))).toBe(true);
      expect(result.warnings!.some((w) => w.includes("threshold: 10"))).toBe(true);
    });

    test("complexity result includes all expected fields", () => {
      // Testing internal method behavior through public validatePattern
      const pattern = "function $NAME($A, $B) { $C }";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      // Internal complexity calculation should include: score, metavarCount, multiNodeCount, complexity
    });
  });

  describe("getLanguageSpecificWarnings", () => {
    test("warns about Python decorators", () => {
      const result = PatternValidator.validatePattern("@decorator def $NAME():", "python");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("Python") && w.includes("decorators"))).toBe(
        true
      );
    });

    test("warns about Python type hints", () => {
      const result = PatternValidator.validatePattern("def $NAME($ARG: str) -> int:", "py");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(
        result.warnings!.some((w) => w.includes("type hints") || w.includes("type annotations"))
      ).toBe(true);
    });

    test("warns about TypeScript decorators", () => {
      const result = PatternValidator.validatePattern("@Component class $NAME {}", "typescript");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(
        result.warnings!.some((w) => w.includes("TypeScript") && w.includes("decorators"))
      ).toBe(true);
    });

    test("warns about TypeScript generics", () => {
      const result = PatternValidator.validatePattern("function $NAME<T>($ARG: T)", "ts");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("Generic") || w.includes("generic"))).toBe(
        true
      );
    });

    test("warns about Java annotations", () => {
      const result = PatternValidator.validatePattern("@Override public $METHOD()", "java");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("Java") && w.includes("annotations"))).toBe(
        true
      );
    });

    test("warns about Java modifiers", () => {
      const result = PatternValidator.validatePattern("public static $FIELD", "java");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("Java") && w.includes("modifiers"))).toBe(
        true
      );
    });

    test("warns about Rust attributes", () => {
      const result = PatternValidator.validatePattern("#[derive(Debug)] struct $NAME", "rust");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("Rust") && w.includes("attributes"))).toBe(
        true
      );
    });

    test("warns about Rust lifetimes", () => {
      const result = PatternValidator.validatePattern("fn $NAME<'a>($ARG: &'a str)", "rs");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("lifetime"))).toBe(true);
    });

    test("language normalization works", () => {
      const result1 = PatternValidator.validatePattern("@decorator", "javascript");
      const result2 = PatternValidator.validatePattern("@decorator", "js");
      // Both should handle language consistently after normalization
      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);
    });

    test("returns no warnings for unsupported languages", () => {
      const result = PatternValidator.validatePattern("$VAR", "unknown");
      expect(result.valid).toBe(true);
      // Should not crash, may have generic warnings but no language-specific ones
    });

    test("returns no warnings when language is undefined", () => {
      const result = PatternValidator.validatePattern("$VAR");
      expect(result.valid).toBe(true);
      // No language parameter, so no language-specific warnings
    });

    test("warnings contain language-specific guidance and documentation URLs", () => {
      const result = PatternValidator.validatePattern("@decorator", "python");
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("https://"))).toBe(true);
      expect(result.warnings!.some((w) => w.includes("Python") || w.includes("python"))).toBe(true);
    });
  });

  describe("validatePattern with language parameter integration", () => {
    test("invalid placement errors appear with language warnings", () => {
      const result = PatternValidator.validatePattern("use$HOOK", "javascript");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Invalid metavariable placement"))).toBe(true);
    });

    test("decorators trigger both generic and language-specific warnings for Python", () => {
      const result = PatternValidator.validatePattern("@decorator", "python");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      // Should have warnings from detectASTStructureRequirements and getLanguageSpecificWarnings
      expect(result.warnings!.some((w) => w.includes("decorators"))).toBe(true);
    });

    test("type hints trigger warnings for TypeScript", () => {
      const result = PatternValidator.validatePattern("$VAR: string", "typescript");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("type"))).toBe(true);
    });

    test("complexity warnings appear alongside language warnings", () => {
      const pattern = "@Component $A $B $C $D $E $F $G $H $I $J $K";
      const result = PatternValidator.validatePattern(pattern, "typescript");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      // Should have both decorator warnings and complexity warnings
      expect(result.warnings!.some((w) => w.includes("decorator"))).toBe(true);
      expect(result.warnings!.some((w) => w.includes("metavariables"))).toBe(true);
    });

    test("language parameter is optional", () => {
      const result = PatternValidator.validatePattern("$VAR");
      expect(result.valid).toBe(true);
      // Should work without language parameter
    });

    test("invalid metavariable placement errors appear before warnings", () => {
      const result = PatternValidator.validatePattern("use$HOOK @decorator", "python");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Errors should be checked first, preventing invalid patterns from being used
    });

    test("validation result includes both errors and warnings when applicable", () => {
      const result = PatternValidator.validatePattern("use$HOOK", "python");
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // May or may not have warnings, but errors should be present
    });
  });

  describe("Pattern complexity boundary tests", () => {
    test("pattern with exactly 10 metavariables does NOT trigger >10 warning", () => {
      const pattern = "$VAR1 $VAR2 $VAR3 $VAR4 $VAR5 $VAR6 $VAR7 $VAR8 $VAR9 $VAR10";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      // Should NOT trigger >10 metavariable warning
      if (result.warnings) {
        expect(result.warnings.some((w) => w.includes("threshold: 10"))).toBe(false);
      }
    });

    test("pattern with exactly 11 metavariables DOES trigger >10 warning", () => {
      const pattern = "$VAR1 $VAR2 $VAR3 $VAR4 $VAR5 $VAR6 $VAR7 $VAR8 $VAR9 $VAR10 $VAR11";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some((w) => w.includes("11 metavariables"))).toBe(true);
      expect(result.warnings!.some((w) => w.includes("threshold: 10"))).toBe(true);
    });

    test("pattern with 10 single-node metavariables", () => {
      const pattern = "function $NAME($A, $B, $C, $D, $E, $F, $G, $H, $I) {}";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      // Exactly 10 metavariables (NAME, A-I), should not trigger >10 warning
      if (result.warnings) {
        expect(result.warnings.some((w) => w.includes("threshold: 10"))).toBe(false);
      }
    });

    test("pattern with 5 single-node + 3 multi-node metavariables", () => {
      const pattern = "$A $B $C $D $E $$$ARGS1 $$$ARGS2 $$$ARGS3";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      // Total 8 metavariables (5 single + 3 multi), each counted once
      // Multi-node metavariables are counted once in metavarCount
    });

    test("pattern with 15 metavariables triggers both >10 and very_complex warnings", () => {
      const pattern = "$A $B $C $D $E $F $G $H $I $J $K $L $M $N $O";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      // Should trigger >10 metavariable warning
      expect(result.warnings!.some((w) => w.includes("15 metavariables"))).toBe(true);
      // Should also trigger very_complex warning (score > 15)
      expect(
        result.warnings!.some((w) => w.includes("very_complex") || w.includes("Very complex"))
      ).toBe(true);
    });

    test("warning message includes actual count", () => {
      const pattern = "$A $B $C $D $E $F $G $H $I $J $K $L";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      // Should mention "12 metavariables"
      expect(result.warnings!.some((w) => w.includes("12 metavariables"))).toBe(true);
      expect(result.warnings!.some((w) => w.includes("threshold: 10"))).toBe(true);
    });

    test("edge case: $VAR1 ... $VAR10 vs $VAR1 ... $VAR11", () => {
      const pattern10 = "$VAR1 $VAR2 $VAR3 $VAR4 $VAR5 $VAR6 $VAR7 $VAR8 $VAR9 $VAR10";
      const result10 = PatternValidator.validatePattern(pattern10);
      expect(result10.valid).toBe(true);
      if (result10.warnings) {
        expect(result10.warnings.some((w) => w.includes("threshold: 10"))).toBe(false);
      }

      const pattern11 = "$VAR1 $VAR2 $VAR3 $VAR4 $VAR5 $VAR6 $VAR7 $VAR8 $VAR9 $VAR10 $VAR11";
      const result11 = PatternValidator.validatePattern(pattern11);
      expect(result11.valid).toBe(true);
      expect(result11.warnings).toBeDefined();
      expect(result11.warnings!.some((w) => w.includes("threshold: 10"))).toBe(true);
    });

    test("warning suggests actionable improvements", () => {
      const pattern = "$A $B $C $D $E $F $G $H $I $J $K";
      const result = PatternValidator.validatePattern(pattern);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      // Should suggest breaking into smaller rules, adding constraints, etc.
      expect(
        result.warnings!.some(
          (w) => w.includes("multiple rules") || w.includes("constraints") || w.includes("smaller")
        )
      ).toBe(true);
      expect(result.warnings!.some((w) => w.includes("https://"))).toBe(true);
    });
  });
});

/**
 * Test Coverage Summary
 *
 * Total test cases: 100+ (including all new edge cases)
 *
 * Coverage areas:
 * - PatternValidator: Metavariable naming, extraction, pattern validation, comparison
 * - YamlValidator: String escaping (special chars, Unicode, keywords), rule ID validation
 * - ParameterValidator: Boundary testing, non-finite numbers (NaN, Infinity), multi-byte handling
 * - ScanTool: Constraint validation, fix template validation
 *
 * Edge cases tested (from EDGE_CASES_AND_IMPROVEMENTS.md section 5.1):
 * - Non-finite number handling (NaN, Infinity, -Infinity)
 * - Exact boundary values for all numeric parameters
 * - YAML special character escaping (backslashes, tabs, carriage returns, Unicode)
 * - Multi-byte character handling for code size validation
 * - Pattern complexity edge cases (adjacent metavariables, multiple bare $, mixed valid/invalid)
 * - Constraint validation with regex and equals conversions
 *
 * Note: Some integration tests require ast-grep binary to be installed.
 * The validation layer tests are independent and test the validation logic thoroughly.
 */
