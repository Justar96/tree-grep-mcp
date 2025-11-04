#!/usr/bin/env bun
/**
 * Direct testing of MCP tools vs CLI
 * Bypasses JSON-RPC and calls tools directly
 */

import { SearchTool } from '../src/tools/search.js';
import { ReplaceTool } from '../src/tools/replace.js';
import { ScanTool } from '../src/tools/scan.js';
import { AstGrepBinaryManager } from '../src/core/binary-manager.js';
import { WorkspaceManager } from '../src/core/workspace-manager.js';
import { spawn } from 'child_process';
import { join } from 'path';

const TEST_DIR = '/home/user/tree-grep-mcp/test-manual';

// Initialize tools
const binaryManager = new AstGrepBinaryManager({ useSystem: true });
await binaryManager.initialize();

const workspaceManager = new WorkspaceManager();
const searchTool = new SearchTool(binaryManager, workspaceManager);
const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
const scanTool = new ScanTool(workspaceManager, binaryManager);

// Helper to run ast-grep CLI
async function runCLI(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ast-grep', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    proc.stdout.on('data', (data) => stdout += data.toString());
    proc.on('close', () => resolve(stdout));

    setTimeout(() => {
      proc.kill();
      reject(new Error('CLI timeout'));
    }, 5000);
  });
}

console.log('🧪 Direct MCP Tool Testing vs CLI\n');
console.log('='.repeat(80));

// TEST 1: Basic Search - console.log
console.log('\n📋 TEST 1: Basic Search - console.log()');
console.log('-'.repeat(80));

try {
  // CLI
  const cliOutput = await runCLI([
    'run',
    '--pattern', 'console.log($$$ARGS)',
    join(TEST_DIR, 'sample.js')
  ]);
  const cliMatches = cliOutput.trim().split('\n').filter(l => l.trim()).length;
  console.log(`✓ CLI: Found ${cliMatches} matches`);

  // MCP
  const mcpResult = await searchTool.execute({
    pattern: 'console.log($$$ARGS)',
    paths: [join(TEST_DIR, 'sample.js')],
    language: 'javascript'
  });
  console.log(`✓ MCP: Found ${mcpResult.matches.length} matches`);

  const match = cliMatches === mcpResult.matches.length;
  console.log(match ? '✅ PASS: Counts match!' : `❌ FAIL: CLI=${cliMatches}, MCP=${mcpResult.matches.length}`);
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 2: Variable declarations - var
console.log('\n📋 TEST 2: Variable Declarations - var');
console.log('-'.repeat(80));

try {
  const cliOutput = await runCLI([
    'run',
    '--pattern', 'var $NAME = $VALUE',
    join(TEST_DIR, 'sample.js')
  ]);
  const cliMatches = cliOutput.trim().split('\n').filter(l => l.trim()).length;
  console.log(`✓ CLI: Found ${cliMatches} matches`);

  const mcpResult = await searchTool.execute({
    pattern: 'var $NAME = $VALUE',
    paths: [join(TEST_DIR, 'sample.js')],
    language: 'javascript'
  });
  console.log(`✓ MCP: Found ${mcpResult.matches.length} matches`);

  const match = cliMatches === mcpResult.matches.length;
  console.log(match ? '✅ PASS: Counts match!' : `❌ FAIL: CLI=${cliMatches}, MCP=${mcpResult.matches.length}`);
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 3: Function definitions
console.log('\n📋 TEST 3: Function Definitions');
console.log('-'.repeat(80));

try {
  const cliOutput = await runCLI([
    'run',
    '--pattern', 'function $NAME($$$PARAMS) { $$$BODY }',
    join(TEST_DIR, 'sample.js')
  ]);
  const cliMatches = cliOutput.trim().split('\n').filter(l => l.trim()).length;
  console.log(`✓ CLI: Found ${cliMatches} matches`);

  const mcpResult = await searchTool.execute({
    pattern: 'function $NAME($$$PARAMS) { $$$BODY }',
    paths: [join(TEST_DIR, 'sample.js')],
    language: 'javascript'
  });
  console.log(`✓ MCP: Found ${mcpResult.matches.length} matches`);

  const match = cliMatches === mcpResult.matches.length;
  console.log(match ? '✅ PASS: Counts match!' : `❌ FAIL: CLI=${cliMatches}, MCP=${mcpResult.matches.length}`);
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 4: Inline code search
console.log('\n📋 TEST 4: Inline Code Search');
console.log('-'.repeat(80));

const testCode = `
function add(a, b) {
  return a + b;
}
const multiply = (x, y) => x * y;
`;

try {
  const mcpResult = await searchTool.execute({
    pattern: 'function $NAME($$$PARAMS) { $$$BODY }',
    code: testCode,
    language: 'javascript'
  });
  console.log(`✓ MCP inline: Found ${mcpResult.matches.length} match(es)`);
  console.log('✅ PASS: Inline code search works');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 5: Replace (dry-run)
console.log('\n📋 TEST 5: Replace Operation (dry-run)');
console.log('-'.repeat(80));

try {
  const replaceResult = await replaceTool.execute({
    pattern: 'console.log($$$ARGS)',
    replacement: 'logger.info($$$ARGS)',
    paths: [join(TEST_DIR, 'sample.js')],
    language: 'javascript',
    dryRun: true
  });
  console.log(`✓ MCP Replace: ${replaceResult.summary.totalChanges} change(s)`);
  console.log(`  Files modified: ${replaceResult.summary.filesModified}`);
  console.log(`  Dry run: ${replaceResult.summary.dryRun}`);
  console.log('✅ PASS: Replace operation works');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 6: Scan with rules
console.log('\n📋 TEST 6: Scan with Rule');
console.log('-'.repeat(80));

try {
  const scanResult = await scanTool.execute({
    id: 'no-var',
    language: 'javascript',
    pattern: 'var $NAME = $VALUE',
    message: 'Use const or let instead of var',
    severity: 'warning',
    paths: [join(TEST_DIR, 'sample.js')]
  });
  console.log(`✓ MCP Scan: ${scanResult.scan.summary.totalFindings} finding(s)`);
  console.log(`  Errors: ${scanResult.scan.summary.errors}`);
  console.log(`  Warnings: ${scanResult.scan.summary.warnings}`);
  console.log('✅ PASS: Scan operation works');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 7: Complex TypeScript Pattern
console.log('\n📋 TEST 7: TypeScript Type Annotations');
console.log('-'.repeat(80));

try {
  const mcpResult = await searchTool.execute({
    pattern: 'function $NAME($$$PARAMS): $TYPE',
    paths: [join(TEST_DIR, 'sample.ts')],
    language: 'typescript'
  });
  console.log(`✓ MCP: Found ${mcpResult.matches.length} match(es)`);
  console.log('✅ PASS: TypeScript patterns work');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

// TEST 8: Multi-node metavariables
console.log('\n📋 TEST 8: Multi-node Metavariables');
console.log('-'.repeat(80));

try {
  const mcpResult = await searchTool.execute({
    pattern: 'async function $NAME($$$PARAMS) { $$$BODY }',
    paths: [join(TEST_DIR, 'sample.js')],
    language: 'javascript'
  });
  console.log(`✓ MCP: Found ${mcpResult.matches.length} async function(s)`);
  console.log('✅ PASS: Multi-node metavariables work');
} catch (error) {
  console.log(`❌ ERROR: ${error}`);
}

console.log('\n' + '='.repeat(80));
console.log('✨ Testing complete!');
