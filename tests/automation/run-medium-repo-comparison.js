#!/usr/bin/env node

/**
 * Medium Repository Comparison Test
 * 
 * Compares MCP tools (ast_search, ast_replace, ast_run_rule) against ast-grep CLI
 * on medium-sized repositories (Express, Flask, Fastify).
 * 
 * Metrics tracked:
 * - Result accuracy (match counts, correctness)
 * - Performance (execution time)
 * - Error handling
 * - Output format quality
 */

import { SearchTool, ReplaceTool, ScanTool } from '../../build/tools/index.js';
import { AstGrepBinaryManager } from '../../build/core/binary-manager.js';
import { WorkspaceManager } from '../../build/core/workspace-manager.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

class MediumRepoTester {
  constructor() {
    this.binaryManager = null;
    this.workspaceManager = null;
    this.searchTool = null;
    this.replaceTool = null;
    this.scanTool = null;
    this.results = [];
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

  /**
   * Run a test comparing MCP tool vs CLI
   */
  async runTest(testConfig) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TEST: ${testConfig.name}`);
    console.log(`Repository: ${testConfig.repo}`);
    console.log(`Pattern Type: ${testConfig.type}`);
    console.log('='.repeat(80));

    const result = {
      name: testConfig.name,
      repo: testConfig.repo,
      type: testConfig.type,
      mcp: {},
      cli: {},
      comparison: {}
    };

    try {
      // Run MCP tool test
      console.log('\n[MCP Tool Execution]');
      const mcpStart = Date.now();
      const mcpResult = await this.runMcpTool(testConfig);
      const mcpTime = Date.now() - mcpStart;
      
      result.mcp = {
        executionTime: mcpTime,
        ...mcpResult
      };
      
      console.log(`  Execution Time: ${mcpTime}ms`);
      console.log(`  Match Count: ${mcpResult.matchCount || mcpResult.changeCount || mcpResult.findingCount || 0}`);
      
      // Run CLI test
      console.log('\n[CLI Execution]');
      const cliStart = Date.now();
      const cliResult = await this.runCliTool(testConfig);
      const cliTime = Date.now() - cliStart;
      
      result.cli = {
        executionTime: cliTime,
        ...cliResult
      };
      
      console.log(`  Execution Time: ${cliTime}ms`);
      console.log(`  Match Count: ${cliResult.matchCount || cliResult.changeCount || cliResult.findingCount || 0}`);
      
      // Compare results
      result.comparison = this.compareResults(result.mcp, result.cli);
      
      console.log('\n[Comparison]');
      console.log(`  Accuracy: ${result.comparison.accuracy}`);
      console.log(`  Performance: ${result.comparison.performance}`);
      console.log(`  Match Difference: ${result.comparison.matchDifference}`);
      
    } catch (error) {
      result.error = error.message;
      console.error(`\n[ERROR] ${error.message}`);
    }

    this.results.push(result);
    return result;
  }

  async runMcpTool(config) {
    const repoPath = path.join('test-repos', config.repo);
    
    if (config.tool === 'search') {
      const result = await this.searchTool.execute({
        pattern: config.pattern,
        paths: [repoPath],
        language: config.language,
        maxMatches: config.maxMatches || 200,
        context: config.context || 0
      });
      
      return {
        matchCount: result.summary.totalMatches,
        truncated: result.summary.truncated,
        skippedLines: result.summary.skippedLines,
        samples: result.matches.slice(0, 3).map(m => ({
          file: m.file,
          line: m.line,
          text: m.text.substring(0, 100)
        }))
      };
    } else if (config.tool === 'replace') {
      const result = await this.replaceTool.execute({
        pattern: config.pattern,
        replacement: config.replacement,
        paths: [repoPath],
        language: config.language,
        dryRun: true
      });
      
      return {
        changeCount: result.summary.totalChanges,
        filesModified: result.summary.filesModified,
        skippedLines: result.summary.skippedLines,
        samples: result.changes.slice(0, 3).map(c => ({
          file: c.file,
          matches: c.matches
        }))
      };
    } else if (config.tool === 'scan') {
      const result = await this.scanTool.execute({
        id: config.ruleId,
        language: config.language,
        pattern: config.pattern,
        message: config.message || config.ruleId,
        severity: config.severity || 'warning',
        where: config.where,
        fix: config.fix,
        paths: [repoPath]
      });
      
      return {
        findingCount: result.scan.summary.totalFindings,
        errors: result.scan.summary.errors,
        warnings: result.scan.summary.warnings,
        skippedLines: result.scan.summary.skippedLines,
        samples: result.scan.findings.slice(0, 3).map(f => ({
          file: f.file,
          line: f.line,
          message: f.message
        }))
      };
    }
  }

  async runCliTool(config) {
    const repoPath = path.join('test-repos', config.repo);
    const cwd = path.resolve(repoPath);
    
    try {
      if (config.tool === 'search') {
        const cmd = `ast-grep run --pattern "${config.pattern}" --lang ${config.language} --json=stream .`;
        const output = execSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        
        const lines = output.trim().split('\n').filter(l => l.trim());
        const matches = lines.map(l => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        }).filter(m => m !== null);
        
        return {
          matchCount: matches.length,
          samples: matches.slice(0, 3).map(m => ({
            file: m.file,
            line: (m.range?.start?.line || 0) + 1,
            text: (m.text || '').substring(0, 100)
          }))
        };
      } else if (config.tool === 'replace') {
        const cmd = `ast-grep run --pattern "${config.pattern}" --rewrite "${config.replacement}" --lang ${config.language} .`;
        const output = execSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        
        // Parse diff output
        const lines = output.split('\n');
        let changeCount = 0;
        const files = new Set();
        
        for (const line of lines) {
          if (line.includes('│-')) changeCount++;
          if (line && !line.startsWith('@@') && !line.includes('│') && !line.startsWith(' ')) {
            files.add(line.trim());
          }
        }
        
        return {
          changeCount,
          filesModified: files.size,
          diffPreview: output.substring(0, 500)
        };
      } else if (config.tool === 'scan') {
        // Create temporary rule file
        const ruleYaml = this.generateRuleYaml(config);
        const ruleFile = path.join(cwd, '.ast-grep-rule-temp.yml');
        fs.writeFileSync(ruleFile, ruleYaml);
        
        try {
          const cmd = `ast-grep scan --rule ${ruleFile} --json=stream .`;
          const output = execSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
          
          const lines = output.trim().split('\n').filter(l => l.trim());
          const findings = lines.map(l => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          }).filter(f => f !== null);
          
          return {
            findingCount: findings.length,
            errors: findings.filter(f => f.severity === 'error').length,
            warnings: findings.filter(f => f.severity === 'warning').length,
            samples: findings.slice(0, 3).map(f => ({
              file: f.file,
              line: (f.range?.start?.line || 0) + 1,
              message: f.message
            }))
          };
        } finally {
          // Cleanup temp file
          if (fs.existsSync(ruleFile)) {
            fs.unlinkSync(ruleFile);
          }
        }
      }
    } catch (error) {
      return {
        error: error.message,
        matchCount: 0,
        changeCount: 0,
        findingCount: 0
      };
    }
  }

  generateRuleYaml(config) {
    let yaml = `id: ${config.ruleId}\n`;
    yaml += `message: ${config.message || config.ruleId}\n`;
    yaml += `severity: ${config.severity || 'warning'}\n`;
    yaml += `language: ${config.language}\n`;
    yaml += `rule:\n`;
    yaml += `  pattern: ${config.pattern}\n`;
    
    if (config.where && config.where.length > 0) {
      yaml += `  constraints:\n`;
      for (const constraint of config.where) {
        yaml += `    ${constraint.metavariable}:\n`;
        if (constraint.regex) {
          yaml += `      regex: ${constraint.regex}\n`;
        } else if (constraint.equals) {
          const escaped = constraint.equals.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          yaml += `      regex: ^${escaped}$\n`;
        }
      }
    }
    
    if (config.fix) {
      yaml += `fix: ${config.fix}\n`;
    }
    
    return yaml;
  }

  compareResults(mcp, cli) {
    const mcpCount = mcp.matchCount || mcp.changeCount || mcp.findingCount || 0;
    const cliCount = cli.matchCount || cli.changeCount || cli.findingCount || 0;
    
    const matchDifference = mcpCount - cliCount;
    const accuracy = matchDifference === 0 ? 'Identical' : `Different (${matchDifference > 0 ? '+' : ''}${matchDifference})`;
    
    const timeDiff = mcp.executionTime - cli.executionTime;
    const performance = timeDiff < 0 
      ? `MCP faster by ${Math.abs(timeDiff)}ms` 
      : timeDiff > 0 
        ? `CLI faster by ${timeDiff}ms`
        : 'Same';
    
    return {
      accuracy,
      performance,
      matchDifference,
      timeDifference: timeDiff
    };
  }

  saveResults() {
    const outputPath = 'tests/automation/medium-repo-test-results.json';
    fs.writeFileSync(outputPath, JSON.stringify(this.results, null, 2));
    console.log(`\n\nResults saved to ${outputPath}`);
  }
}

// Test configurations
const tests = [
  // Express.js tests - Search patterns
  {
    name: 'Express Middleware Functions',
    repo: 'express',
    type: 'nested-function',
    tool: 'search',
    pattern: 'function($REQ, $RES, $NEXT) { $$$BODY }',
    language: 'javascript',
    maxMatches: 200
  },
  {
    name: 'Express Callback Patterns',
    repo: 'express',
    type: 'simple-pattern',
    tool: 'search',
    pattern: 'function($ERR, $$$ARGS) { $$$BODY }',
    language: 'javascript',
    maxMatches: 200
  },
  {
    name: 'Express Route Definitions',
    repo: 'express',
    type: 'simple-pattern',
    tool: 'search',
    pattern: 'app.$METHOD($PATH, $$$HANDLERS)',
    language: 'javascript',
    maxMatches: 200
  },
  {
    name: 'Express Require Statements',
    repo: 'express',
    type: 'simple-pattern',
    tool: 'search',
    pattern: 'require($MODULE)',
    language: 'javascript',
    maxMatches: 200
  },

  // Express.js - Replace patterns
  {
    name: 'Express Var to Const',
    repo: 'express',
    type: 'replacement',
    tool: 'replace',
    pattern: 'var $NAME = $VALUE',
    replacement: 'const $NAME = $VALUE',
    language: 'javascript'
  },

  // Express.js - Constraint-based rules
  {
    name: 'Express Console.log Detection',
    repo: 'express',
    type: 'constraint-rule',
    tool: 'scan',
    ruleId: 'no-console-log',
    pattern: '$OBJ.$METHOD($$$ARGS)',
    language: 'javascript',
    message: 'Avoid using console.log',
    severity: 'warning',
    where: [
      { metavariable: 'OBJ', equals: 'console' },
      { metavariable: 'METHOD', equals: 'log' }
    ]
  },

  // Flask tests - Search patterns
  {
    name: 'Flask Route Decorators',
    repo: 'flask',
    type: 'decorator-pattern',
    tool: 'search',
    pattern: '@app.route($PATH)',
    language: 'python',
    maxMatches: 200
  },
  {
    name: 'Flask Class Definitions',
    repo: 'flask',
    type: 'simple-pattern',
    tool: 'search',
    pattern: 'class $NAME($BASE): $$$BODY',
    language: 'python',
    maxMatches: 200
  },
  {
    name: 'Flask Import Statements',
    repo: 'flask',
    type: 'simple-pattern',
    tool: 'search',
    pattern: 'from $MODULE import $$$ITEMS',
    language: 'python',
    maxMatches: 200
  },

  // Fastify tests - Search patterns
  {
    name: 'Fastify Plugin Registration',
    repo: 'fastify',
    type: 'simple-pattern',
    tool: 'search',
    pattern: 'fastify.register($PLUGIN, $$$OPTS)',
    language: 'javascript',
    maxMatches: 200
  },
  {
    name: 'Fastify Route Handlers',
    repo: 'fastify',
    type: 'simple-pattern',
    tool: 'search',
    pattern: 'fastify.$METHOD($PATH, $$$HANDLERS)',
    language: 'javascript',
    maxMatches: 200
  },
  {
    name: 'Fastify Async Functions',
    repo: 'fastify',
    type: 'async-pattern',
    tool: 'search',
    pattern: 'async function $NAME($$$PARAMS) { $$$BODY }',
    language: 'javascript',
    maxMatches: 200
  },

  // Fastify - Replace patterns
  {
    name: 'Fastify Var to Const',
    repo: 'fastify',
    type: 'replacement',
    tool: 'replace',
    pattern: 'var $NAME = $VALUE',
    replacement: 'const $NAME = $VALUE',
    language: 'javascript'
  },

  // Fastify - Constraint-based rules
  {
    name: 'Fastify Deprecated API Detection',
    repo: 'fastify',
    type: 'constraint-rule',
    tool: 'scan',
    ruleId: 'no-deprecated-api',
    pattern: '$OBJ.$METHOD($$$ARGS)',
    language: 'javascript',
    message: 'Deprecated API usage detected',
    severity: 'error',
    where: [
      { metavariable: 'METHOD', regex: '^(setNotFoundHandler|setErrorHandler)$' }
    ]
  }
];

// Main execution
(async () => {
  const tester = new MediumRepoTester();
  await tester.initialize();
  
  for (const test of tests) {
    await tester.runTest(test);
  }
  
  tester.saveResults();
})().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

