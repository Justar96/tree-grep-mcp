#!/usr/bin/env node

import { SearchTool, ReplaceTool, ScanTool } from '../../build/tools/index.js';
import { AstGrepBinaryManager } from '../../build/core/binary-manager.js';
import { WorkspaceManager } from '../../build/core/workspace-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

class ComparisonTester {
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

  async runSearchTest(testConfig) {
    console.log(`Running search test: ${testConfig.name}`);
    
    const mcpResult = await this.executeMCPSearch(testConfig);
    const cliResult = await this.executeCLISearch(testConfig);
    const comparison = this.compareResults(mcpResult, cliResult);
    
    return { mcpResult, cliResult, comparison };
  }

  async runReplaceTest(testConfig) {
    console.log(`Running replace test: ${testConfig.name}`);
    
    const mcpResult = await this.executeMCPReplace(testConfig);
    const cliResult = await this.executeCLIReplace(testConfig);
    const comparison = this.compareReplaceResults(mcpResult, cliResult);
    
    return { mcpResult, cliResult, comparison };
  }

  async runScanTest(testConfig) {
    console.log(`Running scan test: ${testConfig.name}`);
    
    const mcpResult = await this.executeMCPScan(testConfig);
    const cliResult = await this.executeCLIScan(testConfig);
    const comparison = this.compareScanResults(mcpResult, cliResult);
    
    return { mcpResult, cliResult, comparison };
  }

  async executeMCPSearch(config) {
    console.log('  [MCP] Executing...');
    const startTime = Date.now();
    const memBefore = process.memoryUsage().heapUsed;
    
    try {
      const result = await this.searchTool.execute(config.mcpParams);
      const executionTime = Date.now() - startTime;
      const memAfter = process.memoryUsage().heapUsed;
      const memUsed = (memAfter - memBefore) / 1024 / 1024;
      
      console.log(`  [MCP] Completed in ${executionTime}ms`);
      console.log(`  [MCP] Matches: ${result.summary.totalMatches}`);
      console.log(`  [MCP] Memory: ${memUsed.toFixed(2)}MB`);
      
      return { result, executionTime, memUsed };
    } catch (error) {
      console.error('  [MCP] Error:', error.message);
      return { error, executionTime: Date.now() - startTime };
    }
  }

  async executeMCPReplace(config) {
    console.log('  [MCP] Executing replace...');
    const startTime = Date.now();
    const memBefore = process.memoryUsage().heapUsed;
    
    try {
      const result = await this.replaceTool.execute(config.mcpParams);
      const executionTime = Date.now() - startTime;
      const memAfter = process.memoryUsage().heapUsed;
      const memUsed = (memAfter - memBefore) / 1024 / 1024;
      
      console.log(`  [MCP] Completed in ${executionTime}ms`);
      console.log(`  [MCP] Files affected: ${result.summary.filesModified}`);
      console.log(`  [MCP] Total changes: ${result.summary.totalChanges}`);
      
      return { result, executionTime, memUsed };
    } catch (error) {
      console.error('  [MCP] Error:', error.message);
      return { error, executionTime: Date.now() - startTime };
    }
  }

  async executeMCPScan(config) {
    console.log('  [MCP] Executing scan...');
    const startTime = Date.now();
    const memBefore = process.memoryUsage().heapUsed;
    
    try {
      const result = await this.scanTool.execute(config.mcpParams);
      const executionTime = Date.now() - startTime;
      const memAfter = process.memoryUsage().heapUsed;
      const memUsed = (memAfter - memBefore) / 1024 / 1024;
      
      console.log(`  [MCP] Completed in ${executionTime}ms`);
      console.log(`  [MCP] Findings: ${result.scan.summary.totalFindings}`);
      
      return { result, executionTime, memUsed };
    } catch (error) {
      console.error('  [MCP] Error:', error.message);
      return { error, executionTime: Date.now() - startTime };
    }
  }

  async executeCLISearch(config) {
    console.log('  [CLI] Executing...');
    const outputFile = `cli-output-${Date.now()}.jsonl`;
    const startTime = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync(
        `cd ${config.cliWorkingDir} && ${config.cliCommand} > ${outputFile}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      const executionTime = Date.now() - startTime;
      
      const outputPath = path.join(config.cliWorkingDir, outputFile);
      const output = fs.readFileSync(outputPath, 'utf8');
      const lines = output.trim().split('\n').filter(line => line);
      const matchCount = lines.length;
      const sampleMatches = lines.slice(0, 5).map(line => JSON.parse(line));
      
      console.log(`  [CLI] Completed in ${executionTime}ms`);
      console.log(`  [CLI] Matches: ${matchCount}`);
      
      fs.unlinkSync(outputPath);
      
      return { matchCount, sampleMatches, executionTime };
    } catch (error) {
      console.error('  [CLI] Error:', error.message);
      return { error, executionTime: Date.now() - startTime };
    }
  }

  async executeCLIReplace(config) {
    console.log('  [CLI] Executing replace...');
    const outputFile = `cli-replace-${Date.now()}.txt`;
    const startTime = Date.now();
    
    try {
      await execAsync(
        `cd ${config.cliWorkingDir} && ${config.cliCommand} > ${outputFile}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      const executionTime = Date.now() - startTime;
      
      const outputPath = path.join(config.cliWorkingDir, outputFile);
      const output = fs.readFileSync(outputPath, 'utf8');
      const filesAffected = (output.match(/^diff/gm) || []).length;
      
      console.log(`  [CLI] Completed in ${executionTime}ms`);
      console.log(`  [CLI] Files affected: ${filesAffected}`);
      
      fs.unlinkSync(outputPath);
      
      return { filesAffected, executionTime, diffOutput: output };
    } catch (error) {
      console.error('  [CLI] Error:', error.message);
      return { error, executionTime: Date.now() - startTime };
    }
  }

  async executeCLIScan(config) {
    console.log('  [CLI] Executing scan...');
    const outputFile = `cli-scan-${Date.now()}.jsonl`;
    const startTime = Date.now();
    
    try {
      await execAsync(
        `cd ${config.cliWorkingDir} && ${config.cliCommand} > ${outputFile}`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      const executionTime = Date.now() - startTime;
      
      const outputPath = path.join(config.cliWorkingDir, outputFile);
      const output = fs.readFileSync(outputPath, 'utf8');
      const lines = output.trim().split('\n').filter(line => line);
      const findingCount = lines.length;
      
      console.log(`  [CLI] Completed in ${executionTime}ms`);
      console.log(`  [CLI] Findings: ${findingCount}`);
      
      fs.unlinkSync(outputPath);
      
      return { findingCount, executionTime };
    } catch (error) {
      console.error('  [CLI] Error:', error.message);
      return { error, executionTime: Date.now() - startTime };
    }
  }

  compareResults(mcpResult, cliResult) {
    console.log('\n  [COMPARE] Analyzing results...');
    
    const comparison = {
      accuracy: {},
      performance: {},
      verdict: ''
    };
    
    if (mcpResult.error || cliResult.error) {
      comparison.accuracy.status = 'error';
      comparison.accuracy.mcpError = mcpResult.error?.message;
      comparison.accuracy.cliError = cliResult.error?.message;
      comparison.verdict = '✗ Error occurred';
    } else {
      const mcpCount = mcpResult.result.summary.totalMatches;
      const cliCount = cliResult.matchCount;
      const diff = Math.abs(mcpCount - cliCount);
      const accuracy = cliCount > 0 ? (1 - diff / cliCount) * 100 : 0;
      
      comparison.accuracy.mcpCount = mcpCount;
      comparison.accuracy.cliCount = cliCount;
      comparison.accuracy.difference = diff;
      comparison.accuracy.accuracyPercent = accuracy.toFixed(2);
      
      if (accuracy >= 99) {
        comparison.accuracy.status = 'identical';
        comparison.verdict = '✓ Identical results';
      } else if (accuracy >= 95) {
        comparison.accuracy.status = 'minor-diff';
        comparison.verdict = '⚠ Minor differences';
      } else {
        comparison.accuracy.status = 'significant-diff';
        comparison.verdict = '✗ Significant discrepancies';
      }
    }
    
    if (!mcpResult.error && !cliResult.error) {
      const overhead = ((mcpResult.executionTime - cliResult.executionTime) / cliResult.executionTime) * 100;
      comparison.performance.mcpTime = mcpResult.executionTime;
      comparison.performance.cliTime = cliResult.executionTime;
      comparison.performance.overheadPercent = overhead.toFixed(2);
      
      if (overhead < 20) {
        comparison.performance.status = 'acceptable';
      } else if (overhead < 50) {
        comparison.performance.status = 'moderate';
      } else {
        comparison.performance.status = 'concerning';
      }
    }
    
    console.log(`  [COMPARE] Verdict: ${comparison.verdict}`);
    console.log(`  [COMPARE] Accuracy: ${comparison.accuracy.accuracyPercent}%`);
    console.log(`  [COMPARE] Overhead: ${comparison.performance.overheadPercent}%\n`);
    
    return comparison;
  }

  compareReplaceResults(mcpResult, cliResult) {
    console.log('\n  [COMPARE] Analyzing replace results...');
    
    const comparison = { accuracy: {}, performance: {}, verdict: '' };
    
    if (mcpResult.error || cliResult.error) {
      comparison.verdict = '✗ Error occurred';
      return comparison;
    }
    
    const mcpFiles = mcpResult.result.summary.filesModified;
    const cliFiles = cliResult.filesAffected;
    const diff = Math.abs(mcpFiles - cliFiles);
    const accuracy = cliFiles > 0 ? (1 - diff / cliFiles) * 100 : 0;
    
    comparison.accuracy = {
      mcpFiles,
      cliFiles,
      difference: diff,
      accuracyPercent: accuracy.toFixed(2),
      status: accuracy >= 99 ? 'identical' : accuracy >= 95 ? 'minor-diff' : 'significant-diff'
    };
    
    const overhead = ((mcpResult.executionTime - cliResult.executionTime) / cliResult.executionTime) * 100;
    comparison.performance = {
      mcpTime: mcpResult.executionTime,
      cliTime: cliResult.executionTime,
      overheadPercent: overhead.toFixed(2),
      status: overhead < 20 ? 'acceptable' : overhead < 50 ? 'moderate' : 'concerning'
    };
    
    comparison.verdict = accuracy >= 99 ? '✓ Identical' : accuracy >= 95 ? '⚠ Minor differences' : '✗ Significant discrepancies';
    
    console.log(`  [COMPARE] Verdict: ${comparison.verdict}`);
    console.log(`  [COMPARE] Files: MCP ${mcpFiles}, CLI ${cliFiles}`);
    console.log(`  [COMPARE] Overhead: ${comparison.performance.overheadPercent}%\n`);
    
    return comparison;
  }

  compareScanResults(mcpResult, cliResult) {
    console.log('\n  [COMPARE] Analyzing scan results...');
    
    const comparison = { accuracy: {}, performance: {}, verdict: '' };
    
    if (mcpResult.error || cliResult.error) {
      comparison.verdict = '✗ Error occurred';
      return comparison;
    }
    
    const mcpFindings = mcpResult.result.scan.summary.totalFindings;
    const cliFindings = cliResult.findingCount;
    const diff = Math.abs(mcpFindings - cliFindings);
    const accuracy = cliFindings > 0 ? (1 - diff / cliFindings) * 100 : 0;
    
    comparison.accuracy = {
      mcpFindings,
      cliFindings,
      difference: diff,
      accuracyPercent: accuracy.toFixed(2),
      status: accuracy >= 99 ? 'identical' : accuracy >= 95 ? 'minor-diff' : 'significant-diff'
    };
    
    const overhead = ((mcpResult.executionTime - cliResult.executionTime) / cliResult.executionTime) * 100;
    comparison.performance = {
      mcpTime: mcpResult.executionTime,
      cliTime: cliResult.executionTime,
      overheadPercent: overhead.toFixed(2),
      status: overhead < 20 ? 'acceptable' : overhead < 50 ? 'moderate' : 'concerning'
    };
    
    comparison.verdict = accuracy >= 99 ? '✓ Identical' : accuracy >= 95 ? '⚠ Minor differences' : '✗ Significant discrepancies';
    
    console.log(`  [COMPARE] Verdict: ${comparison.verdict}`);
    console.log(`  [COMPARE] Findings: MCP ${mcpFindings}, CLI ${cliFindings}`);
    console.log(`  [COMPARE] Overhead: ${comparison.performance.overheadPercent}%\n`);
    
    return comparison;
  }

  generateReport(testResults) {
    console.log('\n=== COMPARISON REPORT ===\n');
    
    testResults.forEach((result, index) => {
      console.log(`Test ${index + 1}: ${result.testName}`);
      console.log(`  Type: ${result.type}`);
      console.log(`  Verdict: ${result.comparison.verdict}`);
      console.log(`  Accuracy: ${result.comparison.accuracy.accuracyPercent || 'N/A'}%`);
      console.log(`  Overhead: ${result.comparison.performance?.overheadPercent || 'N/A'}%`);
      console.log('');
    });
    
    const totalTests = testResults.length;
    const identicalTests = testResults.filter(r => r.comparison.accuracy.status === 'identical').length;
    const avgOverhead = testResults.reduce((sum, r) => {
      const overhead = parseFloat(r.comparison.performance?.overheadPercent || 0);
      return sum + (isNaN(overhead) ? 0 : overhead);
    }, 0) / totalTests;
    
    console.log('=== OVERALL STATISTICS ===');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Identical Results: ${identicalTests} (${(identicalTests / totalTests * 100).toFixed(1)}%)`);
    console.log(`Average Overhead: ${avgOverhead.toFixed(2)}%`);
  }
}

export { ComparisonTester };

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new ComparisonTester();
  await tester.initialize();
  
  const testConfigs = [
    {
      name: 'Express Middleware Detection',
      type: 'search',
      mcpParams: {
        pattern: 'function($REQ, $RES, $NEXT) { $$$BODY }',
        paths: ['D:/_Project/_test-repos/medium/express'],
        language: 'javascript',
        maxMatches: 200
      },
      cliWorkingDir: 'D:/_Project/_test-repos/medium/express',
      cliCommand: 'ast-grep run --pattern "function($REQ, $RES, $NEXT) { $$$BODY }" --lang js --json=stream .'
    },
  ];
  
  const results = [];
  for (const config of testConfigs) {
    let result;
    if (config.type === 'search') {
      result = await tester.runSearchTest(config);
    } else if (config.type === 'replace') {
      result = await tester.runReplaceTest(config);
    } else if (config.type === 'scan') {
      result = await tester.runScanTest(config);
    }
    results.push({ testName: config.name, type: config.type, ...result });
  }
  
  tester.generateReport(results);
}
