#!/usr/bin/env node

import { SearchTool, ReplaceTool, ScanTool } from '../../build/tools/index.js';
import { AstGrepBinaryManager } from '../../build/core/binary-manager.js';
import { WorkspaceManager } from '../../build/core/workspace-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

class QuickComparisonTester {
  constructor() {
    this.binaryManager = null;
    this.workspaceManager = null;
    this.searchTool = null;
    this.replaceTool = null;
    this.scanTool = null;
  }

  async initialize() {
    console.log('Initializing MCP tools...');
    this.binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await this.binaryManager.initialize();
    this.workspaceManager = new WorkspaceManager();
    
    this.searchTool = new SearchTool(this.binaryManager, this.workspaceManager);
    this.replaceTool = new ReplaceTool(this.binaryManager, this.workspaceManager);
    this.scanTool = new ScanTool(this.workspaceManager, this.binaryManager);
    
    console.log('Initialization complete.\n');
  }

  async runTest(config) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TEST: ${config.name}`);
    console.log(`Repository: ${config.repository}`);
    console.log(`Type: ${config.type}`);
    console.log(`${'='.repeat(70)}\n`);

    let mcpResult, cliResult;

    try {
      if (config.type === 'search') {
        mcpResult = await this.executeMCPSearch(config);
        cliResult = await this.executeCLISearch(config);
      } else if (config.type === 'replace') {
        mcpResult = await this.executeMCPReplace(config);
        cliResult = await this.executeCLIReplace(config);
      } else if (config.type === 'scan') {
        mcpResult = await this.executeMCPScan(config);
        cliResult = await this.executeCLIScan(config);
      }

      const comparison = this.compareResults(mcpResult, cliResult, config.type);
      
      return {
        testName: config.name,
        repository: config.repository,
        type: config.type,
        mcpResult,
        cliResult,
        comparison
      };
    } catch (error) {
      console.error(`ERROR in test ${config.name}:`, error.message);
      return {
        testName: config.name,
        repository: config.repository,
        type: config.type,
        error: error.message
      };
    }
  }

  async executeMCPSearch(config) {
    console.log('  [MCP] Executing search...');
    const startTime = Date.now();
    const memBefore = process.memoryUsage().heapUsed;
    
    const result = await this.searchTool.execute(config.mcpParams);
    const executionTime = Date.now() - startTime;
    const memAfter = process.memoryUsage().heapUsed;
    const memUsed = (memAfter - memBefore) / 1024 / 1024;
    
    console.log(`  [MCP] Time: ${executionTime}ms`);
    console.log(`  [MCP] Matches: ${result.summary.totalMatches}`);
    console.log(`  [MCP] Memory: ${memUsed.toFixed(2)}MB`);
    
    return { result, executionTime, memUsed, matchCount: result.summary.totalMatches };
  }

  async executeMCPReplace(config) {
    console.log('  [MCP] Executing replace...');
    const startTime = Date.now();
    
    const result = await this.replaceTool.execute(config.mcpParams);
    const executionTime = Date.now() - startTime;
    
    console.log(`  [MCP] Time: ${executionTime}ms`);
    console.log(`  [MCP] Files: ${result.summary.filesModified}`);
    
    return { result, executionTime, filesModified: result.summary.filesModified };
  }

  async executeMCPScan(config) {
    console.log('  [MCP] Executing scan...');
    const startTime = Date.now();
    
    const result = await this.scanTool.execute(config.mcpParams);
    const executionTime = Date.now() - startTime;
    
    console.log(`  [MCP] Time: ${executionTime}ms`);
    console.log(`  [MCP] Findings: ${result.scan.summary.totalFindings}`);
    
    return { result, executionTime, findings: result.scan.summary.totalFindings };
  }

  async executeCLISearch(config) {
    console.log('  [CLI] Executing search...');
    const outputFile = path.join(config.cliWorkingDir, `cli-output-${Date.now()}.jsonl`);
    const startTime = Date.now();
    
    try {
      await execAsync(config.cliCommand + ` > ${outputFile}`, {
        cwd: config.cliWorkingDir,
        maxBuffer: 10 * 1024 * 1024,
        shell: 'powershell.exe'
      });
      const executionTime = Date.now() - startTime;
      
      const output = fs.readFileSync(outputFile, 'utf8');
      const lines = output.trim().split('\n').filter(line => line);
      const matchCount = lines.length;
      
      console.log(`  [CLI] Time: ${executionTime}ms`);
      console.log(`  [CLI] Matches: ${matchCount}`);
      
      fs.unlinkSync(outputFile);
      
      return { matchCount, executionTime };
    } catch (error) {
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      throw error;
    }
  }

  async executeCLIReplace(config) {
    console.log('  [CLI] Executing replace...');
    const outputFile = path.join(config.cliWorkingDir, `cli-replace-${Date.now()}.txt`);
    const startTime = Date.now();
    
    try {
      await execAsync(config.cliCommand + ` > ${outputFile}`, {
        cwd: config.cliWorkingDir,
        maxBuffer: 10 * 1024 * 1024,
        shell: 'powershell.exe'
      });
      const executionTime = Date.now() - startTime;
      
      const output = fs.readFileSync(outputFile, 'utf8');
      const filesAffected = (output.match(/^diff/gm) || []).length;
      
      console.log(`  [CLI] Time: ${executionTime}ms`);
      console.log(`  [CLI] Files: ${filesAffected}`);
      
      fs.unlinkSync(outputFile);
      
      return { filesAffected, executionTime };
    } catch (error) {
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      throw error;
    }
  }

  async executeCLIScan(config) {
    console.log('  [CLI] Executing scan...');
    const outputFile = path.join(config.cliWorkingDir, `cli-scan-${Date.now()}.jsonl`);
    
    // First, write the YAML file
    const yamlFile = path.join(config.cliWorkingDir, `rule-${Date.now()}.yml`);
    fs.writeFileSync(yamlFile, config.cliYaml);
    
    const startTime = Date.now();
    
    try {
      await execAsync(`ast-grep scan --rule ${yamlFile} --json=stream . > ${outputFile}`, {
        cwd: config.cliWorkingDir,
        maxBuffer: 10 * 1024 * 1024,
        shell: 'powershell.exe'
      });
      const executionTime = Date.now() - startTime;
      
      const output = fs.readFileSync(outputFile, 'utf8');
      const lines = output.trim().split('\n').filter(line => line);
      const findingCount = lines.length;
      
      console.log(`  [CLI] Time: ${executionTime}ms`);
      console.log(`  [CLI] Findings: ${findingCount}`);
      
      fs.unlinkSync(outputFile);
      fs.unlinkSync(yamlFile);
      
      return { findingCount, executionTime };
    } catch (error) {
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      if (fs.existsSync(yamlFile)) fs.unlinkSync(yamlFile);
      throw error;
    }
  }

  compareResults(mcpResult, cliResult, type) {
    console.log('\n  [COMPARE] Analyzing...');
    
    const comparison = { accuracy: {}, performance: {}, verdict: '' };
    
    let mcpCount, cliCount;
    
    if (type === 'search') {
      mcpCount = mcpResult.matchCount;
      cliCount = cliResult.matchCount;
    } else if (type === 'replace') {
      mcpCount = mcpResult.filesModified;
      cliCount = cliResult.filesAffected;
    } else if (type === 'scan') {
      mcpCount = mcpResult.findings;
      cliCount = cliResult.findingCount;
    }
    
    const diff = Math.abs(mcpCount - cliCount);
    const accuracy = cliCount > 0 ? (1 - diff / cliCount) * 100 : (mcpCount === 0 ? 100 : 0);
    
    comparison.accuracy = {
      mcpCount,
      cliCount,
      difference: diff,
      accuracyPercent: accuracy.toFixed(2)
    };
    
    const overhead = ((mcpResult.executionTime - cliResult.executionTime) / cliResult.executionTime) * 100;
    comparison.performance = {
      mcpTime: mcpResult.executionTime,
      cliTime: cliResult.executionTime,
      overheadPercent: overhead.toFixed(2)
    };
    
    if (accuracy >= 99) {
      comparison.verdict = '✓ Identical';
    } else if (accuracy >= 95) {
      comparison.verdict = '⚠ Minor differences';
    } else {
      comparison.verdict = '✗ Significant discrepancies';
    }
    
    console.log(`  [COMPARE] Verdict: ${comparison.verdict}`);
    console.log(`  [COMPARE] Accuracy: ${comparison.accuracy.accuracyPercent}%`);
    console.log(`  [COMPARE] Overhead: ${comparison.performance.overheadPercent}%`);
    
    return comparison;
  }

  generateReport(results) {
    console.log('\n\n');
    console.log('='.repeat(80));
    console.log('                        COMPARISON REPORT');
    console.log('='.repeat(80));
    console.log('');
    
    results.forEach((result, index) => {
      if (result.error) {
        console.log(`${index + 1}. ${result.testName} [${result.repository}]`);
        console.log(`   ERROR: ${result.error}\n`);
        return;
      }
      
      console.log(`${index + 1}. ${result.testName} [${result.repository}]`);
      console.log(`   Type: ${result.type}`);
      console.log(`   Verdict: ${result.comparison.verdict}`);
      console.log(`   Accuracy: ${result.comparison.accuracy.accuracyPercent}%`);
      console.log(`   MCP: ${result.comparison.accuracy.mcpCount} | CLI: ${result.comparison.accuracy.cliCount}`);
      console.log(`   Time: MCP ${result.comparison.performance.mcpTime}ms | CLI ${result.comparison.performance.cliTime}ms`);
      console.log(`   Overhead: ${result.comparison.performance.overheadPercent}%`);
      console.log('');
    });
    
    const successfulTests = results.filter(r => !r.error);
    const identicalTests = successfulTests.filter(r => r.comparison.verdict === '✓ Identical').length;
    const avgOverhead = successfulTests.reduce((sum, r) => 
      sum + parseFloat(r.comparison.performance.overheadPercent), 0) / (successfulTests.length || 1);
    const avgAccuracy = successfulTests.reduce((sum, r) => 
      sum + parseFloat(r.comparison.accuracy.accuracyPercent), 0) / (successfulTests.length || 1);
    
    console.log('='.repeat(80));
    console.log('                        OVERALL STATISTICS');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${results.length}`);
    console.log(`Successful: ${successfulTests.length}`);
    console.log(`Identical Results: ${identicalTests} (${(identicalTests / successfulTests.length * 100).toFixed(1)}%)`);
    console.log(`Average Accuracy: ${avgAccuracy.toFixed(2)}%`);
    console.log(`Average Overhead: ${avgOverhead.toFixed(2)}%`);
    console.log('='.repeat(80));
  }
}

// Test configurations
const tests = [
  // Express tests
  {
    name: 'Express: Middleware Function Detection',
    repository: 'express',
    type: 'search',
    mcpParams: {
      pattern: 'function($REQ, $RES, $NEXT) { $$$BODY }',
      paths: ['D:/_Project/_test-repos/medium/express'],
      language: 'javascript',
      maxMatches: 200
    },
    cliWorkingDir: 'D:\\_Project\\_test-repos\\medium\\express',
    cliCommand: 'ast-grep run --pattern "function($REQ, $RES, $NEXT) { $$$BODY }" --lang js --json=stream .'
  },
  {
    name: 'Express: Route Detection with Constraint',
    repository: 'express',
    type: 'scan',
    mcpParams: {
      id: 'route-detection',
      message: 'Route definition detected',
      severity: 'info',
      pattern: 'app.$METHOD($PATH, $HANDLERS)',
      where: [
        {
          metavariable: 'METHOD',
          regex: '^(get|post|put|delete|patch)$'
        }
      ],
      language: 'javascript',
      paths: ['D:/_Project/_test-repos/medium/express']
    },
    cliWorkingDir: 'D:\\_Project\\_test-repos\\medium\\express',
    cliCommand: 'ast-grep scan --rule rule.yml --json=stream .',
    cliYaml: `id: route-detection
message: "Route definition detected"
severity: info
language: js
rule:
  pattern: app.$METHOD($PATH, $HANDLERS)
  constraints:
    METHOD:
      regex: "^(get|post|put|delete|patch)$"`
  },
  
  // Flask tests
  {
    name: 'Flask: Route Decorator Detection',
    repository: 'flask',
    type: 'search',
    mcpParams: {
      pattern: '@app.route($PATH)\\ndef $FUNC($ARGS): $$$BODY',
      paths: ['D:/_Project/_test-repos/medium/flask'],
      language: 'python',
      maxMatches: 200
    },
    cliWorkingDir: 'D:\\_Project\\_test-repos\\medium\\flask',
    cliCommand: 'ast-grep run --pattern "@app.route($PATH)`ndef $FUNC($ARGS): $$$BODY" --lang py --json=stream .'
  },
  
  // Hugo tests
  {
    name: 'Hugo: Error Handling Pattern',
    repository: 'hugo',
    type: 'search',
    mcpParams: {
      pattern: 'if err != nil { $$$BODY }',
      paths: ['D:/_Project/_test-repos/medium/hugo'],
      language: 'go',
      maxMatches: 200
    },
    cliWorkingDir: 'D:\\_Project\\_test-repos\\medium\\hugo',
    cliCommand: 'ast-grep run --pattern "if err != nil { $$$BODY }" --lang go --json=stream .'
  },
  
  // Fastify tests
  {
    name: 'Fastify: Plugin Registration',
    repository: 'fastify',
    type: 'search',
    mcpParams: {
      pattern: 'fastify.register($PLUGIN, $OPTS)',
      paths: ['D:/_Project/_test-repos/medium/fastify'],
      language: 'javascript',
      maxMatches: 200
    },
    cliWorkingDir: 'D:\\_Project\\_test-repos\\medium\\fastify',
    cliCommand: 'ast-grep run --pattern "fastify.register($PLUGIN, $OPTS)" --lang js --json=stream .'
  }
];

// Run tests
(async () => {
  const tester = new QuickComparisonTester();
  await tester.initialize();
  
  const results = [];
  for (const config of tests) {
    const result = await tester.runTest(config);
    results.push(result);
  }
  
  tester.generateReport(results);
})().catch(console.error);
