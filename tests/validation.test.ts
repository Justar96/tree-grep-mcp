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

import { describe, test, expect } from 'bun:test';
import { PatternValidator, YamlValidator, ParameterValidator } from '../src/utils/validation.js';
import { ScanTool } from '../src/tools/scan.js';
import { WorkspaceManager } from '../src/core/workspace-manager.js';
import { AstGrepBinaryManager } from '../src/core/binary-manager.js';
import { ValidationError } from '../src/types/errors.js';

// ============================================
// PatternValidator Tests
// ============================================
describe('PatternValidator', () => {
  describe('validateMetavariableName', () => {
    test('accepts valid UPPER_CASE names', () => {
      expect(PatternValidator.validateMetavariableName('VAR')).toBe(true);
      expect(PatternValidator.validateMetavariableName('MY_VAR')).toBe(true);
      expect(PatternValidator.validateMetavariableName('VAR123')).toBe(true);
      expect(PatternValidator.validateMetavariableName('_PRIVATE')).toBe(true);
      expect(PatternValidator.validateMetavariableName('A')).toBe(true);
    });

    test('rejects invalid names', () => {
      expect(PatternValidator.validateMetavariableName('var')).toBe(false);
      expect(PatternValidator.validateMetavariableName('myVar')).toBe(false);
      expect(PatternValidator.validateMetavariableName('123VAR')).toBe(false);
      expect(PatternValidator.validateMetavariableName('my-var')).toBe(false);
      expect(PatternValidator.validateMetavariableName('my.var')).toBe(false);
    });
  });

  describe('extractMetavariables', () => {
    test('extracts single-node metavariables', () => {
      const result = PatternValidator.extractMetavariables('foo($VAR)');
      expect(result.has('VAR')).toBe(true);
      expect(result.size).toBe(1);
    });

    test('extracts multi-node metavariables', () => {
      const result = PatternValidator.extractMetavariables('foo($$$ARGS)');
      expect(result.has('ARGS')).toBe(true);
      expect(result.size).toBe(1);
    });

    test('extracts both single and multi-node metavariables', () => {
      const result = PatternValidator.extractMetavariables('function $NAME($$$PARAMS) { $$$BODY }');
      expect(result.has('NAME')).toBe(true);
      expect(result.has('PARAMS')).toBe(true);
      expect(result.has('BODY')).toBe(true);
      expect(result.size).toBe(3);
    });

    test('avoids double-counting multi-node metavariables', () => {
      const result = PatternValidator.extractMetavariables('foo($$$ARGS)');
      expect(result.size).toBe(1);
      expect(result.has('ARGS')).toBe(true);
    });

    test('extracts adjacent metavariables without separators', () => {
      const result = PatternValidator.extractMetavariables('$VAR1$VAR2');
      expect(result.has('VAR1')).toBe(true);
      expect(result.has('VAR2')).toBe(true);
      expect(result.size).toBe(2);
    });

    test('extracts metavariables at start and end of pattern', () => {
      const result = PatternValidator.extractMetavariables('$START middle $END');
      expect(result.has('START')).toBe(true);
      expect(result.has('END')).toBe(true);
      expect(result.size).toBe(2);
    });

    test('extracts from pattern with only metavariables', () => {
      const result = PatternValidator.extractMetavariables('$A $B $C');
      expect(result.has('A')).toBe(true);
      expect(result.has('B')).toBe(true);
      expect(result.has('C')).toBe(true);
      expect(result.size).toBe(3);
    });

    test('extracts metavariables from nested structures', () => {
      const result = PatternValidator.extractMetavariables('foo(bar($INNER), $OUTER)');
      expect(result.has('INNER')).toBe(true);
      expect(result.has('OUTER')).toBe(true);
      expect(result.size).toBe(2);
    });

    test('returns empty set for empty pattern', () => {
      const result = PatternValidator.extractMetavariables('');
      expect(result.size).toBe(0);
    });
  });

  describe('validatePattern', () => {
    test('accepts valid patterns', () => {
      const result = PatternValidator.validatePattern('console.log($ARG)');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects empty patterns', () => {
      const result = PatternValidator.validatePattern('   ');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Pattern cannot be empty');
    });

    test('rejects bare $$$ without name', () => {
      const result = PatternValidator.validatePattern('foo($$$)');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('bare $$$'))).toBe(true);
    });

    test('rejects invalid metavariable names', () => {
      const result = PatternValidator.validatePattern('foo($invalid)');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid metavariable name'))).toBe(true);
    });

    test('accepts single-node anonymous metavariable $_', () => {
      const result = PatternValidator.validatePattern('foo($_)');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects multi-node anonymous metavariable $$$_', () => {
      const result = PatternValidator.validatePattern('foo($$$_)');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Anonymous multi-node metavariable `$$$_` is not allowed. Use a named metavariable (e.g., `$$$ARGS`).');
    });

    test('warns about complex patterns', () => {
      const result = PatternValidator.validatePattern('$A $B $C $D $E $F $G $H $I $J $K');
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('complex patterns'))).toBe(true);
    });

    test('warns about $$$ at end without opening', () => {
      const result = PatternValidator.validatePattern('foo$$$)');
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('appears at end of expression'))).toBe(true);
    });

    test('accepts single-character metavariable as $_', () => {
      const result = PatternValidator.validatePattern('foo($_) + bar($_)');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('detects mixed valid and invalid metavariables', () => {
      const result = PatternValidator.validatePattern('foo($VALID, $invalid, $ANOTHER)');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('$invalid'))).toBe(true);
    });

    test('accepts metavariables with numbers', () => {
      const result = PatternValidator.validatePattern('foo($VAR1, $VAR2, $VAR_3)');
      expect(result.valid).toBe(true);
    });

    test('accepts pattern with only anonymous metavariables', () => {
      const result = PatternValidator.validatePattern('foo($_, $_, $_)');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('validates very long pattern without timeout', () => {
      const metavars = Array.from({ length: 50 }, (_, i) => `$VAR${i}`).join(' ');
      const result = PatternValidator.validatePattern(metavars);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
    });
  });

  describe('compareMetavariables', () => {
    test('accepts matching metavariables', () => {
      const result = PatternValidator.compareMetavariables(
        'foo($VAR)',
        'bar($VAR)'
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects metavariables in replacement not in pattern', () => {
      const result = PatternValidator.compareMetavariables(
        'foo($A)',
        'bar($B)'
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('$B') && e.includes('not defined in pattern'))).toBe(true);
    });

    test('warns about unused metavariables', () => {
      const result = PatternValidator.compareMetavariables(
        'foo($A, $B)',
        'bar($A)'
      );
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('not used in replacement'))).toBe(true);
    });

    test('handles multi-node metavariables', () => {
      const result = PatternValidator.compareMetavariables(
        'function $NAME($$$PARAMS) { $$$BODY }',
        'const $NAME = ($$$PARAMS) => { $$$BODY }'
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('accepts empty pattern and empty replacement', () => {
      const result = PatternValidator.compareMetavariables('foo()', 'bar()');
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    test('detects multiple undefined metavariables in replacement', () => {
      const result = PatternValidator.compareMetavariables('foo($A)', 'bar($B, $C, $D)');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('$B'))).toBe(true);
      expect(result.errors.some(e => e.includes('$C'))).toBe(true);
      expect(result.errors.some(e => e.includes('$D'))).toBe(true);
    });

    test('treats lowercase metavariables as invalid in pattern', () => {
      const result = PatternValidator.compareMetavariables('foo($VAR)', 'bar($var)');
      expect(result.valid).toBe(true);
    });

    test('allows metavariable reordering', () => {
      const result = PatternValidator.compareMetavariables('foo($A, $B, $C)', 'bar($C, $A, $B)');
      expect(result.valid).toBe(true);
    });

    test('allows metavariable duplication in replacement', () => {
      const result = PatternValidator.compareMetavariables('foo($A, $B)', 'bar($A, $A, $A)');
      expect(result.valid).toBe(true);
    });

    test('warns about partial metavariable usage', () => {
      const result = PatternValidator.compareMetavariables('foo($A, $B, $C)', 'bar($B)');
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('$A'))).toBe(true);
      expect(result.warnings?.some(w => w.includes('$C'))).toBe(true);
    });
  });
});

// ============================================
// YamlValidator Tests
// ============================================
describe('YamlValidator', () => {
  describe('escapeYamlString', () => {
    test('returns simple strings as-is', () => {
      expect(YamlValidator.escapeYamlString('simple')).toBe('simple');
      expect(YamlValidator.escapeYamlString('test123')).toBe('test123');
    });

    test('quotes strings with special characters', () => {
      const result = YamlValidator.escapeYamlString('test: value');
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    test('escapes quotes in strings', () => {
      const result = YamlValidator.escapeYamlString('say "hello"');
      expect(result).toContain('\\"');
    });

    test('escapes newlines', () => {
      const result = YamlValidator.escapeYamlString('line1\nline2');
      expect(result).toContain('\\n');
    });

    test('quotes YAML keywords', () => {
      expect(YamlValidator.escapeYamlString('true')).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString('false')).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString('null')).toMatch(/^"/);
    });

    test('handles strings with backslashes', () => {
      const result = YamlValidator.escapeYamlString('path\\to\\file');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    test('escapes strings with tabs', () => {
      const result = YamlValidator.escapeYamlString('column1\tcolumn2');
      expect(result).toContain('\\t');
    });

    test('escapes strings with carriage returns', () => {
      const result = YamlValidator.escapeYamlString('line1\rline2');
      expect(result).toContain('\\r');
    });

    test('handles strings with mixed special characters', () => {
      const result = YamlValidator.escapeYamlString('test: "value" {key} [array]');
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    test('quotes YAML keywords with different cases', () => {
      expect(YamlValidator.escapeYamlString('True')).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString('FALSE')).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString('Null')).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString('YES')).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString('No')).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString('ON')).toMatch(/^"/);
      expect(YamlValidator.escapeYamlString('off')).toMatch(/^"/);
    });

    test('quotes strings with leading/trailing whitespace', () => {
      const result = YamlValidator.escapeYamlString('  spaced  ');
      expect(result).toMatch(/^"/);
      expect(result).toMatch(/"$/);
    });

    test('handles empty string', () => {
      const result = YamlValidator.escapeYamlString('');
      expect(typeof result).toBe('string');
    });

    test('handles Unicode characters', () => {
      const result = YamlValidator.escapeYamlString('Hello 世界 🌍');
      expect(result).toContain('世界');
      expect(result).toContain('🌍');
    });
  });

  describe('validateRuleId', () => {
    test('accepts valid kebab-case IDs', () => {
      const result = YamlValidator.validateRuleId('no-console-log');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects empty IDs', () => {
      const result = YamlValidator.validateRuleId('');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot be empty'))).toBe(true);
    });

    test('rejects IDs with uppercase letters', () => {
      const result = YamlValidator.validateRuleId('No-Console');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('kebab-case'))).toBe(true);
    });

    test('rejects IDs with spaces', () => {
      const result = YamlValidator.validateRuleId('my rule');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('kebab-case'))).toBe(true);
    });

    test('warns about very long IDs', () => {
      const longId = 'a'.repeat(51);
      const result = YamlValidator.validateRuleId(longId);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('very long'))).toBe(true);
    });

    test('warns about IDs starting with hyphen', () => {
      const result = YamlValidator.validateRuleId('-test');
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('should not start'))).toBe(true);
    });

    test('rejects rule ID with underscores', () => {
      const result = YamlValidator.validateRuleId('my_rule_id');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('kebab-case'))).toBe(true);
    });

    test('accepts rule ID with consecutive hyphens', () => {
      const result = YamlValidator.validateRuleId('my--rule');
      expect(result.valid).toBe(true);
    });

    test('accepts rule IDs with numbers', () => {
      expect(YamlValidator.validateRuleId('rule-123').valid).toBe(true);
      expect(YamlValidator.validateRuleId('123-rule').valid).toBe(true);
      expect(YamlValidator.validateRuleId('rule-1-2-3').valid).toBe(true);
    });

    test('rejects rule IDs with special characters', () => {
      expect(YamlValidator.validateRuleId('rule@name').valid).toBe(false);
      expect(YamlValidator.validateRuleId('rule.name').valid).toBe(false);
      expect(YamlValidator.validateRuleId('rule_name').valid).toBe(false);
    });

    test('accepts rule ID exactly 50 characters', () => {
      const result = YamlValidator.validateRuleId('a'.repeat(50));
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    test('warns about rule ID exactly 51 characters', () => {
      const result = YamlValidator.validateRuleId('a'.repeat(51));
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('very long'))).toBe(true);
    });

    test('accepts rule ID ending with hyphen but may have warnings', () => {
      const result = YamlValidator.validateRuleId('test-rule-');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateSeverity', () => {
    test('accepts valid severity levels', () => {
      expect(YamlValidator.validateSeverity('error').valid).toBe(true);
      expect(YamlValidator.validateSeverity('warning').valid).toBe(true);
      expect(YamlValidator.validateSeverity('info').valid).toBe(true);
    });

    test('rejects invalid severity levels', () => {
      const result = YamlValidator.validateSeverity('critical');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid severity'))).toBe(true);
    });
  });
});

// ============================================
// ScanTool Integration Tests
// ============================================
describe('ScanTool.buildYaml', () => {
  // Create minimal instances for testing
  const workspaceManager = new WorkspaceManager(process.cwd());
  const binaryManager = new AstGrepBinaryManager();
  const scanTool = new ScanTool(workspaceManager, binaryManager);

  describe('constraint metavariable validation', () => {
    test('throws ValidationError when constraint references missing metavariable', async () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'console.log($ARG)',
        where: [
          { metavariable: 'MISSING_VAR', regex: '^test' }
        ]
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain("Constraint references metavariable 'MISSING_VAR' which is not in the pattern");
        expect((error as ValidationError).message).toContain('Available metavariables: ARG');
      }
    });

    test('throws ValidationError when constraint has neither regex nor equals', async () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'console.log($ARG)',
        where: [
          { metavariable: 'ARG' } // Missing both regex and equals
        ]
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain("Constraint for metavariable 'ARG' must specify either 'regex' or 'equals' with a non-empty value");
      }
    });

    test('throws ValidationError when constraint has empty regex string', async () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'console.log($ARG)',
        where: [
          { metavariable: 'ARG', regex: '   ' } // Empty/whitespace regex
        ]
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain("must specify either 'regex' or 'equals' with a non-empty value");
      }
    });

    test('throws ValidationError when constraint has empty equals string', async () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'console.log($ARG)',
        where: [
          { metavariable: 'ARG', equals: '' } // Empty equals
        ]
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain("must specify either 'regex' or 'equals' with a non-empty value");
      }
    });

    // NOTE: Tests for successful execution with valid constraints require ast-grep binary
    // to be installed and initialized. The validation tests above are sufficient to verify
    // that constraints with 'equals' are converted to anchored regex (^value$) via the
    // code path that handles both regex and equals constraints.

    test('prefers regex when both regex and equals are provided', () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'console.log($ARG)',
        where: [
          { metavariable: 'ARG', regex: 'test.*', equals: 'value' }
        ]
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain('test.*');
      expect(yaml).not.toContain('^value$');
    });

    test('validates constraint with valid regex pattern', () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'console.log($ARG)',
        where: [
          { metavariable: 'ARG', regex: '^[A-Z]+$' }
        ]
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain('^[A-Z]+$');
      expect(yaml).toContain('regex:');
    });

    test('validates constraint with equals containing special characters', () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'console.log($ARG)',
        where: [
          { metavariable: 'ARG', equals: 'test:value' }
        ]
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain('^test:value$');
      expect(yaml).toContain('regex:');
    });

    test('allows multiple constraints on same metavariable', () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'console.log($ARG)',
        where: [
          { metavariable: 'ARG', regex: '^test' },
          { metavariable: 'ARG', regex: 'end$' }
        ]
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain('^test');
      expect(yaml).toContain('end$');
    });

    test('validates constraint on multi-node metavariable', () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'foo($$$ARGS)',
        where: [
          { metavariable: 'ARGS', regex: 'test' }
        ]
      };

      const yaml = (scanTool as any).buildYaml(params);
      expect(yaml).toContain('ARGS');
      expect(yaml).toContain('test');
    });
  });

  describe('fix template metavariable validation', () => {
    test('throws ValidationError when fix references missing metavariable', async () => {
      const params = {
        id: 'test-rule',
        language: 'javascript',
        pattern: 'console.log($ARG)',
        fix: 'logger.info($MISSING_VAR)',
        code: 'console.log("test");'
      };

      try {
        await scanTool.execute(params);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain("Fix template uses metavariable 'MISSING_VAR' which is not in the pattern");
        expect((error as ValidationError).message).toContain('Available metavariables: ARG');
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
describe('ParameterValidator', () => {
  describe('validateContext', () => {
    test('accepts valid context values', () => {
      expect(ParameterValidator.validateContext(0).valid).toBe(true);
      expect(ParameterValidator.validateContext(3).valid).toBe(true);
      expect(ParameterValidator.validateContext(100).valid).toBe(true);
    });

    test('accepts undefined/null', () => {
      expect(ParameterValidator.validateContext(undefined).valid).toBe(true);
      expect(ParameterValidator.validateContext(null).valid).toBe(true);
    });

    test('rejects non-numbers', () => {
      const result = ParameterValidator.validateContext('3' as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must be a number'))).toBe(true);
    });

    test('rejects negative values', () => {
      const result = ParameterValidator.validateContext(-5);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('non-negative'))).toBe(true);
    });

    test('rejects values over 100', () => {
      const result = ParameterValidator.validateContext(101);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed 100'))).toBe(true);
    });

    test('rejects NaN value', () => {
      const result = ParameterValidator.validateContext(NaN);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('finite number') || e.includes('must be a number'))).toBe(true);
    });

    test('rejects Infinity', () => {
      const result = ParameterValidator.validateContext(Infinity);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('finite number') || e.includes('cannot exceed 100'))).toBe(true);
    });

    test('rejects negative Infinity', () => {
      const result = ParameterValidator.validateContext(-Infinity);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('finite number') || e.includes('non-negative'))).toBe(true);
    });

    test('accepts exact boundary value 100', () => {
      const result = ParameterValidator.validateContext(100);
      expect(result.valid).toBe(true);
    });

    test('accepts exact boundary value 0', () => {
      const result = ParameterValidator.validateContext(0);
      expect(result.valid).toBe(true);
    });

    test('accepts floating point value', () => {
      const result = ParameterValidator.validateContext(3.5);
      expect(result.valid).toBe(true);
    });

    test('rejects very large negative number', () => {
      const result = ParameterValidator.validateContext(-999999);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('non-negative'))).toBe(true);
    });
  });

  describe('validateMaxMatches', () => {
    test('accepts valid maxMatches values', () => {
      expect(ParameterValidator.validateMaxMatches(1).valid).toBe(true);
      expect(ParameterValidator.validateMaxMatches(100).valid).toBe(true);
      expect(ParameterValidator.validateMaxMatches(10000).valid).toBe(true);
    });

    test('rejects zero and negative values', () => {
      expect(ParameterValidator.validateMaxMatches(0).valid).toBe(false);
      expect(ParameterValidator.validateMaxMatches(-1).valid).toBe(false);
    });

    test('rejects values over 10000', () => {
      const result = ParameterValidator.validateMaxMatches(10001);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed 10000'))).toBe(true);
    });

    test('rejects NaN value', () => {
      const result = ParameterValidator.validateMaxMatches(NaN);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('finite number') || e.includes('must be'))).toBe(true);
    });

    test('rejects Infinity', () => {
      const result = ParameterValidator.validateMaxMatches(Infinity);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('finite number') || e.includes('cannot exceed 10000'))).toBe(true);
    });

    test('accepts exact boundary value 1', () => {
      const result = ParameterValidator.validateMaxMatches(1);
      expect(result.valid).toBe(true);
    });

    test('accepts exact boundary value 10000', () => {
      const result = ParameterValidator.validateMaxMatches(10000);
      expect(result.valid).toBe(true);
    });

    test('accepts floating point value', () => {
      const result = ParameterValidator.validateMaxMatches(100.5);
      expect(result.valid).toBe(true);
    });

    test('rejects very large number', () => {
      const result = ParameterValidator.validateMaxMatches(999999);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed 10000'))).toBe(true);
    });
  });

  describe('validateTimeout', () => {
    test('accepts valid timeout values', () => {
      expect(ParameterValidator.validateTimeout(1000).valid).toBe(true);
      expect(ParameterValidator.validateTimeout(30000).valid).toBe(true);
      expect(ParameterValidator.validateTimeout(300000).valid).toBe(true);
    });

    test('rejects values below 1000', () => {
      const result = ParameterValidator.validateTimeout(999);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 1000'))).toBe(true);
    });

    test('rejects values over 300000', () => {
      const result = ParameterValidator.validateTimeout(300001);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed 300000'))).toBe(true);
    });

    test('rejects NaN value', () => {
      const result = ParameterValidator.validateTimeout(NaN);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('finite number') || e.includes('must be'))).toBe(true);
    });

    test('rejects Infinity', () => {
      const result = ParameterValidator.validateTimeout(Infinity);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('finite number') || e.includes('cannot exceed 300000'))).toBe(true);
    });

    test('accepts exact boundary value 1000', () => {
      const result = ParameterValidator.validateTimeout(1000);
      expect(result.valid).toBe(true);
    });

    test('accepts exact boundary value 300000', () => {
      const result = ParameterValidator.validateTimeout(300000);
      expect(result.valid).toBe(true);
    });

    test('rejects value just below minimum', () => {
      const result = ParameterValidator.validateTimeout(999);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 1000'))).toBe(true);
    });

    test('rejects value just above maximum', () => {
      const result = ParameterValidator.validateTimeout(300001);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed 300000'))).toBe(true);
    });

    test('rejects zero', () => {
      const result = ParameterValidator.validateTimeout(0);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 1000'))).toBe(true);
    });
  });

  describe('validateCode', () => {
    test('accepts valid code strings', () => {
      expect(ParameterValidator.validateCode('console.log("test")').valid).toBe(true);
    });

    test('accepts undefined/null', () => {
      expect(ParameterValidator.validateCode(undefined).valid).toBe(true);
      expect(ParameterValidator.validateCode(null).valid).toBe(true);
    });

    test('rejects non-strings', () => {
      const result = ParameterValidator.validateCode(123 as any);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must be a string'))).toBe(true);
    });

    test('rejects empty strings', () => {
      const result = ParameterValidator.validateCode('   ');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot be empty'))).toBe(true);
    });

    test('rejects code over 1MB', () => {
      const largeCode = 'a'.repeat(1048577);
      const result = ParameterValidator.validateCode(largeCode);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed 1MB'))).toBe(true);
    });

    test('accepts code at exact 1MB boundary', () => {
      const exactMB = 'a'.repeat(1048576);
      const result = ParameterValidator.validateCode(exactMB);
      expect(result.valid).toBe(true);
    });

    test('rejects code just over 1MB', () => {
      const justOver = 'a'.repeat(1048577);
      const result = ParameterValidator.validateCode(justOver);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('bytes') && e.includes('KB') && e.includes('MB'))).toBe(true);
    });

    test('validates multi-byte Unicode characters by byte count', () => {
      const unicodeChar = '世';
      const charByteSize = new TextEncoder().encode(unicodeChar).length;
      const charsNeeded = Math.floor(1048576 / charByteSize) + 1;
      const overSizeUnicode = unicodeChar.repeat(charsNeeded);
      const result = ParameterValidator.validateCode(overSizeUnicode);
      expect(result.valid).toBe(false);
    });

    test('rejects code with only whitespace', () => {
      const result = ParameterValidator.validateCode('\n\n\t  \r\n');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('empty'))).toBe(true);
    });

    test('accepts code with leading/trailing whitespace but valid content', () => {
      const result = ParameterValidator.validateCode('  console.log("test");  ');
      expect(result.valid).toBe(true);
    });

    test('accepts very long single line under 1MB', () => {
      const longLine = 'a'.repeat(500000);
      const result = ParameterValidator.validateCode(longLine);
      expect(result.valid).toBe(true);
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
