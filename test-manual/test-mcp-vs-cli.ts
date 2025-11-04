#!/usr/bin/env bun
/**
 * Comprehensive test comparing MCP server results with native ast-grep CLI
 */

import { spawn } from 'child_process';
import { join } from 'path';

const TEST_DIR = '/home/user/tree-grep-mcp/test-manual';
const MCP_SERVER = '/home/user/tree-grep-mcp/build/index.js';

interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: any;
}

// Helper to call MCP tool
async function callMCPTool(toolName: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const server = spawn('node', [MCP_SERVER, '--use-system'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let requestId = 1;

    server.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    server.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    server.on('close', (code) => {
      try {
        // Parse JSON-RPC responses
        const lines = stdout.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const response: MCPResponse = JSON.parse(line);
            if (response.id === requestId && response.result) {
              resolve(response.result);
              return;
            }
            if (response.error) {
              reject(new Error(response.error.message));
              return;
            }
          } catch {
            // Skip non-JSON lines
          }
        }
        reject(new Error('No valid response received'));
      } catch (error) {
        reject(error);
      }
    });

    // Send initialize request
    const initRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };
    server.stdin.write(JSON.stringify(initRequest) + '\n');

    // Send tool call request
    const toolRequest: MCPRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };
    server.stdin.write(JSON.stringify(toolRequest) + '\n');
    server.stdin.end();

    setTimeout(() => {
      server.kill();
      reject(new Error('Timeout'));
    }, 10000);
  });
}

// Helper to run ast-grep CLI
async function runCLI(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ast-grep', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve(stdout);
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error('CLI timeout'));
    }, 5000);
  });
}

// Test cases
async function runTests() {
  console.log('🧪 Starting comprehensive MCP vs CLI comparison tests\n');
  console.log('=' .repeat(80));

  const tests = [
    {
      name: 'Basic Search: console.log',
      cli: ['run', '--pattern', 'console.log($$$ARGS)', join(TEST_DIR, 'sample.js')],
      mcp: {
        tool: 'ast_search',
        params: {
          pattern: 'console.log($$$ARGS)',
          paths: [join(TEST_DIR, 'sample.js')],
          language: 'javascript'
        }
      }
    },
    {
      name: 'Variable Declaration: var',
      cli: ['run', '--pattern', 'var $NAME = $VALUE', join(TEST_DIR, 'sample.js')],
      mcp: {
        tool: 'ast_search',
        params: {
          pattern: 'var $NAME = $VALUE',
          paths: [join(TEST_DIR, 'sample.js')],
          language: 'javascript'
        }
      }
    },
    {
      name: 'Function Definition',
      cli: ['run', '--pattern', 'function $NAME($$$PARAMS) { $$$BODY }', join(TEST_DIR, 'sample.js')],
      mcp: {
        tool: 'ast_search',
        params: {
          pattern: 'function $NAME($$$PARAMS) { $$$BODY }',
          paths: [join(TEST_DIR, 'sample.js')],
          language: 'javascript'
        }
      }
    },
    {
      name: 'Arrow Functions',
      cli: ['run', '--pattern', '($$$PARAMS) => $BODY', join(TEST_DIR, 'sample.js')],
      mcp: {
        tool: 'ast_search',
        params: {
          pattern: '($$$PARAMS) => $BODY',
          paths: [join(TEST_DIR, 'sample.js')],
          language: 'javascript'
        }
      }
    },
    {
      name: 'TypeScript Type Annotations',
      cli: ['run', '--pattern', 'function $NAME($$$PARAMS): $TYPE { $$$BODY }', join(TEST_DIR, 'sample.ts')],
      mcp: {
        tool: 'ast_search',
        params: {
          pattern: 'function $NAME($$$PARAMS): $TYPE { $$$BODY }',
          paths: [join(TEST_DIR, 'sample.ts')],
          language: 'typescript'
        }
      }
    },
  ];

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n📋 Test ${i + 1}: ${test.name}`);
    console.log('-'.repeat(80));

    try {
      // Run CLI
      console.log('🔧 Running ast-grep CLI...');
      const cliOutput = await runCLI(test.cli);
      const cliMatches = cliOutput.trim().split('\n').filter(line => line.trim()).length;
      console.log(`   CLI matches: ${cliMatches}`);

      // Run MCP
      console.log('🔧 Running MCP server...');
      const mcpResult = await callMCPTool(test.mcp.tool, test.mcp.params);

      // Parse MCP result
      let mcpMatches = 0;
      if (mcpResult.content && mcpResult.content[0]) {
        const content = mcpResult.content[0];
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          mcpMatches = data.matches ? data.matches.length : 0;
        }
      }
      console.log(`   MCP matches: ${mcpMatches}`);

      // Compare
      if (cliMatches === mcpMatches) {
        console.log(`✅ PASS: Match counts are equal (${cliMatches})`);
        passed++;
      } else {
        console.log(`❌ FAIL: Match counts differ (CLI: ${cliMatches}, MCP: ${mcpMatches})`);
        failed++;
      }

    } catch (error) {
      console.log(`❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   Total: ${passed + failed}`);
  console.log(`   Success rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
}

runTests().catch(console.error);
