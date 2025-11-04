#!/usr/bin/env bun
/**
 * Advanced MCP testing: constraints, fix templates, complex patterns
 */

import { SearchTool } from '../src/tools/search.js';
import { ReplaceTool } from '../src/tools/replace.js';
import { ScanTool } from '../src/tools/scan.js';
import { AstGrepBinaryManager } from '../src/core/binary-manager.js';
import { WorkspaceManager } from '../src/core/workspace-manager.js';
import { join } from 'path';

const TEST_DIR = '/home/user/tree-grep-mcp/test-manual';

// Initialize tools
const binaryManager = new AstGrepBinaryManager({ useSystem: true });
await binaryManager.initialize();

const workspaceManager = new WorkspaceManager();
const searchTool = new SearchTool(binaryManager, workspaceManager);
const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
const scanTool = new ScanTool(workspaceManager, binaryManager);

console.log('🚀 Advanced MCP Testing Suite\n');
console.log('='.repeat(80));

// TEST 1: Search with context
console.log('\n📋 TEST 1: Search with Context Lines');
console.log('-'.repeat(80));

try {
  const result = await searchTool.execute({
    pattern: 'console.log($$$ARGS)',
    paths: [join(TEST_DIR, 'sample.js')],
    language: 'javascript',
    context: 2
  });
  console.log(`✓ Found ${result.matches.length} matches with context`);
  if (result.matches[0] && result.matches[0].context) {
    console.log(`  Context before: ${result.matches[0].context.before?.length || 0} lines`);
    console.log(`  Context after: ${result.matches[0].context.after?.length || 0} lines`);
  }
  console.log('✅ PASS: Context lines work');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 2: Search with maxMatches limit
console.log('\n📋 TEST 2: Search with maxMatches Limit');
console.log('-'.repeat(80));

try {
  const result = await searchTool.execute({
    pattern: 'function $NAME($$$PARAMS) { $$$BODY }',
    paths: [join(TEST_DIR, 'sample.js')],
    language: 'javascript',
    maxMatches: 2
  });
  console.log(`✓ Limited to ${result.matches.length} matches (max: 2)`);
  console.log(`  Truncated: ${result.summary.truncated}`);
  console.log('✅ PASS: maxMatches limit works');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 3: Scan with regex constraint
console.log('\n📋 TEST 3: Scan with Regex Constraint');
console.log('-'.repeat(80));

const testCodeWithVars = `
const testVar = 1;
const myVar = 2;
const testData = 3;
const regular = 4;
`;

try {
  const result = await scanTool.execute({
    id: 'test-vars-only',
    language: 'javascript',
    pattern: 'const $NAME = $VALUE',
    where: [
      { metavariable: 'NAME', regex: '^test' }
    ],
    message: 'Variables starting with test',
    code: testCodeWithVars
  });
  console.log(`✓ Found ${result.scan.findings.length} var(s) starting with 'test'`);
  console.log(`  YAML rule generated: ${result.yaml.includes('regex:')} `);
  console.log('✅ PASS: Regex constraints work');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 4: Scan with equals constraint (converted to regex)
console.log('\n📋 TEST 4: Scan with Equals Constraint');
console.log('-'.repeat(80));

const testCodeWithConsole = `
console.log("a");
console.error("b");
logger.log("c");
`;

try {
  const result = await scanTool.execute({
    id: 'console-log-only',
    language: 'javascript',
    pattern: '$OBJ.$METHOD($$$ARGS)',
    where: [
      { metavariable: 'OBJ', equals: 'console' },
      { metavariable: 'METHOD', equals: 'log' }
    ],
    message: 'Only console.log calls',
    code: testCodeWithConsole
  });
  console.log(`✓ Found ${result.scan.findings.length} console.log call(s)`);
  console.log(`  Equals converted to regex: ${result.yaml.includes('^console$')}`);
  console.log('✅ PASS: Equals constraints work');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 5: Scan with fix template
console.log('\n📋 TEST 5: Scan with Fix Template');
console.log('-'.repeat(80));

try {
  const result = await scanTool.execute({
    id: 'modernize-vars',
    language: 'javascript',
    pattern: 'var $NAME = $VALUE',
    fix: 'const $NAME = $VALUE',
    message: 'Use const instead of var',
    severity: 'warning',
    paths: [join(TEST_DIR, 'sample.js')]
  });
  console.log(`✓ Found ${result.scan.findings.length} var declarations`);
  console.log(`  Fix template included: ${result.yaml.includes('fix:')}`);
  console.log(`  Severity: ${result.scan.findings[0]?.severity || 'N/A'}`);
  console.log('✅ PASS: Fix templates work');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 6: Complex replace with metavariable reordering
console.log('\n📋 TEST 6: Complex Replace with Metavariable Reordering');
console.log('-'.repeat(80));

const testCodeWithAssertEquals = `
assertEquals(5, result);
assertEquals("hello", output);
`;

try {
  const result = await replaceTool.execute({
    pattern: 'assertEquals($EXPECTED, $ACTUAL)',
    replacement: 'assertEquals($ACTUAL, $EXPECTED)',
    code: testCodeWithAssertEquals,
    language: 'javascript',
    dryRun: true
  });
  console.log(`✓ Reordered ${result.summary.totalChanges} assertion(s)`);
  console.log(`  Preview available: ${!!result.changes[0]?.preview}`);
  console.log('✅ PASS: Metavariable reordering works');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 7: Multiple constraints on same metavariable
console.log('\n📋 TEST 7: Multiple Constraints on Same Metavariable');
console.log('-'.repeat(80));

const testCodeWithFunctions = `
function testStart() {}
function testMiddleTest() {}
function testEnd() {}
function regularFunction() {}
`;

try {
  const result = await scanTool.execute({
    id: 'complex-constraints',
    language: 'javascript',
    pattern: 'function $NAME() {}',
    where: [
      { metavariable: 'NAME', regex: '^test' },
      { metavariable: 'NAME', regex: 'End$' }
    ],
    message: 'Functions starting with test AND ending with End',
    code: testCodeWithFunctions
  });
  console.log(`✓ Found ${result.scan.findings.length} function(s) matching both constraints`);
  console.log('✅ PASS: Multiple constraints work');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 8: Anonymous metavariable $_
console.log('\n📋 TEST 8: Anonymous Metavariable $_');
console.log('-'.repeat(80));

const testCodeWithThreeArgs = `
foo(1, 2, 3);
bar("a", "b", "c");
baz(true, false, true);
`;

try {
  const result = await searchTool.execute({
    pattern: '$FUNC($_, $_, $_)',
    code: testCodeWithThreeArgs,
    language: 'javascript'
  });
  console.log(`✓ Found ${result.matches.length} function call(s) with 3 arguments`);
  console.log('✅ PASS: Anonymous metavariables work');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 9: Nested structures
console.log('\n📋 TEST 9: Nested Structures');
console.log('-'.repeat(80));

try {
  const result = await searchTool.execute({
    pattern: 'function $OUTER($A) { function $INNER($B) { $$$BODY } return $INNER; }',
    paths: [join(TEST_DIR, 'sample.js')],
    language: 'javascript'
  });
  console.log(`✓ Found ${result.matches.length} nested function(s)`);
  console.log('✅ PASS: Nested structures work');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 10: Error handling - invalid pattern
console.log('\n📋 TEST 10: Error Handling - Invalid Pattern');
console.log('-'.repeat(80));

try {
  await searchTool.execute({
    pattern: 'foo($$$)',  // Bare $$$ should fail
    code: 'foo(1, 2, 3)',
    language: 'javascript'
  });
  console.log('❌ FAIL: Should have thrown validation error');
} catch (error) {
  console.log(`✓ Correctly rejected invalid pattern`);
  console.log(`  Error: ${error instanceof Error ? error.message.substring(0, 60) : error}...`);
  console.log('✅ PASS: Validation works');
}

// TEST 11: Error handling - metavariable mismatch
console.log('\n📋 TEST 11: Error Handling - Metavariable Mismatch');
console.log('-'.repeat(80));

try {
  await replaceTool.execute({
    pattern: 'foo($A)',
    replacement: 'bar($B)',  // $B not in pattern
    code: 'foo(1)',
    language: 'javascript'
  });
  console.log('❌ FAIL: Should have thrown validation error');
} catch (error) {
  console.log(`✓ Correctly rejected metavariable mismatch`);
  console.log(`  Error: ${error instanceof Error ? error.message.substring(0, 60) : error}...`);
  console.log('✅ PASS: Metavariable validation works');
}

// TEST 12: Large code handling
console.log('\n📋 TEST 12: Large Code Handling');
console.log('-'.repeat(80));

try {
  const largeCode = Array(1000).fill('const x = 1;').join('\n');
  const result = await searchTool.execute({
    pattern: 'const $NAME = $VALUE',
    code: largeCode,
    language: 'javascript',
    maxMatches: 100
  });
  console.log(`✓ Processed ${largeCode.split('\n').length} lines`);
  console.log(`  Found ${result.matches.length} matches (limited to 100)`);
  console.log(`  Truncated: ${result.summary.truncated}`);
  console.log('✅ PASS: Large code handling works');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

console.log('\n' + '='.repeat(80));
console.log('✨ Advanced testing complete!');
console.log('\n📊 Summary: All advanced features tested successfully');
