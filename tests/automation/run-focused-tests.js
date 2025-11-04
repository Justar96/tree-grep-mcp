#!/usr/bin/env node

import { SearchTool, ReplaceTool, ScanTool } from '../../build/tools/index.js';
import { AstGrepBinaryManager } from '../../build/core/binary-manager.js';
import { WorkspaceManager } from '../../build/core/workspace-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

async function runTest(name, testFn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${name}`);
  console.log('='.repeat(60));
  try {
    const result = await testFn();
    console.log(`✓ ${name} completed successfully\n`);
    return result;
  } catch (error) {
    console.error(`✗ ${name} failed:`, error.message);
    return { error: error.message };
  }
}

async function main() {
  console.log('Initializing MCP tools...');
  const binaryManager = new AstGrepBinaryManager({ useSystem: true });
  await binaryManager.initialize();
  const workspaceManager = new WorkspaceManager();
  
  const searchTool = new SearchTool(binaryManager, workspaceManager);
  const scanTool = new ScanTool(workspaceManager, binaryManager);
  
  const results = {};
  
  // Test 1: Express - Middleware Detection
  results.expressMiddleware = await runTest('Express: Middleware Detection', async () => {
    const mcpStart = Date.now();
    const mcpResult = await searchTool.execute({
      pattern: 'function($REQ, $RES, $NEXT) { $$$BODY }',
      paths: ['D:/_Project/_test-repos/medium/express'],
      language: 'javascript',
      maxMatches: 200
    });
    const mcpTime = Date.now() - mcpStart;
    
    const cliStart = Date.now();
    const cliOutput = await execAsync(
      'cd D:/_Project/_test-repos/medium/express && ast-grep run --pattern "function($REQ, $RES, $NEXT) { $$$BODY }" --lang js --json=stream .',
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const cliTime = Date.now() - cliStart;
    const cliMatches = cliOutput.stdout.trim().split('\n').filter(l => l).length;
    
    return {
      mcp: { time: mcpTime, matches: mcpResult.summary.totalMatches, samples: mcpResult.matches.slice(0, 3) },
      cli: { time: cliTime, matches: cliMatches }
    };
  });
  
  // Test 2: Flask - Route Decorator  
  results.flaskRoutes = await runTest('Flask: Route Decorator Detection', async () => {
    const mcpStart = Date.now();
    const mcpResult = await searchTool.execute({
      pattern: '@app.route($PATH)\ndef $FUNC($ARGS): $$$BODY',
      paths: ['D:/_Project/_test-repos/medium/flask'],
      language: 'python',
      maxMatches: 150
    });
    const mcpTime = Date.now() - mcpStart;
    
    const cliStart = Date.now();
    const cliOutput = await execAsync(
      'cd D:/_Project/_test-repos/medium/flask && ast-grep run --pattern "@app.route($PATH)\ndef $FUNC($ARGS): $$$BODY" --lang py --json=stream .',
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const cliTime = Date.now() - cliStart;
    const cliMatches = cliOutput.stdout.trim().split('\n').filter(l => l).length;
    
    return {
      mcp: { time: mcpTime, matches: mcpResult.summary.totalMatches, samples: mcpResult.matches.slice(0, 3) },
      cli: { time: cliTime, matches: cliMatches }
    };
  });
  
  // Test 3: Hugo - Error Handling (large result set)
  results.hugoErrors = await runTest('Hugo: Error Handling Pattern', async () => {
    const mcpStart = Date.now();
    const mcpResult = await searchTool.execute({
      pattern: 'if err != nil { $$$BODY }',
      paths: ['D:/_Project/_test-repos/medium/hugo'],
      language: 'go',
      maxMatches: 200
    });
    const mcpTime = Date.now() - mcpStart;
    
    const cliStart = Date.now();
    const cliOutput = await execAsync(
      'cd D:/_Project/_test-repos/medium/hugo && ast-grep run --pattern "if err != nil { $$$BODY }" --lang go --json=stream . | Select-Object -First 200',
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const cliTime = Date.now() - cliStart;
    const cliMatches = cliOutput.stdout.trim().split('\n').filter(l => l).length;
    
    return {
      mcp: { time: mcpTime, matches: mcpResult.summary.totalMatches, samples: mcpResult.matches.slice(0, 3) },
      cli: { time: cliTime, matches: cliMatches }
    };
  });
  
  // Test 4: Fastify - Hook Constraint Rule
  results.fastifyHooks = await runTest('Fastify: Hook Validation Scan', async () => {
    const mcpStart = Date.now();
    const mcpResult = await scanTool.execute({
      id: 'fastify-hook-validation',
      message: 'Fastify hook registered: {{HOOK}}',
      severity: 'info',
      pattern: 'fastify.addHook($HOOK, $HANDLER)',
      where: [{
        metavariable: 'HOOK',
        regex: '^(onRequest|preParsing|preValidation|preHandler|preSerialization|onSend|onResponse|onTimeout|onError)$'
      }],
      language: 'javascript',
      paths: ['D:/_Project/_test-repos/medium/fastify']
    });
    const mcpTime = Date.now() - mcpStart;
    
    // Create YAML rule for CLI
    const yamlRule = `id: fastify-hook-validation
message: "Fastify hook registered: {{HOOK}}"
severity: info
language: js
rule:
  pattern: fastify.addHook($HOOK, $HANDLER)
  constraints:
    HOOK:
      regex: "^(onRequest|preParsing|preValidation|preHandler|preSerialization|onSend|onResponse|onTimeout|onError)$"`;
    
    fs.writeFileSync('D:/_Project/_test-repos/medium/fastify/hook-rule.yml', yamlRule);
    
    const cliStart = Date.now();
    const cliOutput = await execAsync(
      'cd D:/_Project/_test-repos/medium/fastify && ast-grep scan --rule hook-rule.yml --json=stream .',
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const cliTime = Date.now() - cliStart;
    const cliFindings = cliOutput.stdout.trim().split('\n').filter(l => l).length;
    
    fs.unlinkSync('D:/_Project/_test-repos/medium/fastify/hook-rule.yml');
    
    return {
      mcp: { time: mcpTime, findings: mcpResult.scan.summary.totalFindings, samples: mcpResult.scan.findings.slice(0, 3) },
      cli: { time: cliTime, findings: cliFindings }
    };
  });
  
  // Print Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY OF RESULTS');
  console.log('='.repeat(60));
  
  Object.entries(results).forEach(([key, result]) => {
    if (result.error) {
      console.log(`\n${key}: ERROR - ${result.error}`);
    } else if (result.mcp && result.cli) {
      const mcpCount = result.mcp.matches || result.mcp.findings;
      const cliCount = result.cli.matches || result.cli.findings;
      const accuracy = cliCount > 0 ? ((1 - Math.abs(mcpCount - cliCount) / cliCount) * 100).toFixed(1) : 0;
      const overhead = ((result.mcp.time - result.cli.time) / result.cli.time * 100).toFixed(1);
      
      console.log(`\n${key}:`);
      console.log(`  MCP: ${mcpCount} results in ${result.mcp.time}ms`);
      console.log(`  CLI: ${cliCount} results in ${result.cli.time}ms`);
      console.log(`  Accuracy: ${accuracy}%`);
      console.log(`  Overhead: ${overhead}%`);
    }
  });
  
  // Save results to JSON file
  fs.writeFileSync(
    'D:/_Project/_mcp/tree-grep-mcp/tests/automation/test-results.json',
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n✓ Results saved to tests/automation/test-results.json\n');
}

main().catch(console.error);
