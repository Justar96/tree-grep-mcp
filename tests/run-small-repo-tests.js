/**
 * Test Runner for Small Repositories
 * Collects real metrics for SMALL_REPO_RESULTS.md
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock MCP tools for testing (using ast-grep CLI directly)
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

const TEST_REPOS_DIR = 'D:\\test-repos';

// Helper to run ast-grep and collect metrics
async function runAstGrep(repoPath, pattern, language, options = {}) {
  const startTime = Date.now();
  const startMem = process.memoryUsage();
  
  try {
    const contextFlag = options.context ? `-C ${options.context}` : '';
    const maxMatchesFlag = options.maxMatches ? `` : ''; // ast-grep doesn't have direct maxMatches flag
    
    const cmd = `cd "${repoPath}" && ast-grep -p "${pattern}" -l ${language} ${contextFlag} --json`;
    
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
    
    const executionTime = Date.now() - startTime;
    const endMem = process.memoryUsage();
    const memoryUsed = (endMem.heapUsed - startMem.heapUsed) / 1024 / 1024;
    
    // Parse JSON output
    let matches = [];
    let skippedLines = 0;
    
    if (stdout.trim()) {
      try {
        const lines = stdout.trim().split('\n').filter(l => l.trim());
        matches = lines.map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        }).filter(m => m !== null);
      } catch (e) {
        console.error('Failed to parse JSON:', e.message);
      }
    }
    
    return {
      executionTime,
      memoryUsed: Math.abs(memoryUsed).toFixed(2),
      matchCount: matches.length,
      skippedLines,
      matches: matches.slice(0, 3), // First 3 samples
      stderr: stderr || ''
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    return {
      executionTime,
      memoryUsed: 0,
      matchCount: 0,
      skippedLines: 0,
      matches: [],
      error: error.message
    };
  }
}

// Helper to format sample matches
function formatSampleMatches(matches) {
  if (!matches || matches.length === 0) {
    return '[No matches found]';
  }
  
  return matches.map(m => {
    const file = m.file || m.path || 'unknown';
    const line = m.line || m.range?.start?.line || '?';
    const text = m.text || m.matched || '...';
    return `[${file}:${line}] ${text.substring(0, 100)}`;
  }).join('\n');
}

// Test scenarios
const tests = {
  chalk: [
    {
      name: 'Function Definitions',
      pattern: 'function $NAME($$$PARAMS) { $$$BODY }',
      language: 'javascript',
      options: { context: 3, maxMatches: 100 }
    },
    {
      name: 'Console.log Detection',
      pattern: 'console.log($$$ARGS)',
      language: 'javascript',
      options: { context: 2 }
    },
    {
      name: 'Arrow Functions',
      pattern: 'const $NAME = ($$$ARGS) => $$$BODY',
      language: 'javascript',
      options: { context: 2 }
    },
    {
      name: 'TypeScript Interfaces',
      pattern: 'interface $NAME { $$$PROPS }',
      language: 'typescript',
      options: { context: 3 }
    },
    {
      name: 'Module Exports',
      pattern: 'module.exports = $EXPR',
      language: 'javascript',
      options: { context: 2 }
    }
  ],
  typer: [
    {
      name: 'Function Decorators',
      pattern: '@$DECORATOR\\ndef $FUNC($$$ARGS): $$$BODY',
      language: 'python',
      options: { context: 4 }
    },
    {
      name: 'Type-Annotated Functions',
      pattern: 'def $NAME($$$PARAMS): $$$BODY',
      language: 'python',
      options: { context: 3 }
    },
    {
      name: 'Class Inheritance',
      pattern: 'class $NAME($BASE): $$$BODY',
      language: 'python',
      options: { context: 3 }
    }
  ],
  hyperfine: [
    {
      name: 'Function Definitions',
      pattern: 'fn $NAME($$$PARAMS) -> $RET { $$$BODY }',
      language: 'rust',
      options: { context: 3 }
    },
    {
      name: 'Match Expressions',
      pattern: 'match $EXPR { $$$ARMS }',
      language: 'rust',
      options: { context: 4 }
    }
  ],
  execa: [
    {
      name: 'Async Functions',
      pattern: 'async function $NAME($$$PARAMS) { $$$BODY }',
      language: 'javascript',
      options: { context: 3 }
    },
    {
      name: 'Await Expressions',
      pattern: 'await $EXPR',
      language: 'javascript',
      options: { context: 1 }
    }
  ]
};

// Run all tests
async function runAllTests() {
  const results = {};
  
  for (const [repo, scenarios] of Object.entries(tests)) {
    console.log(`\n=== Testing ${repo} ===`);
    results[repo] = [];
    
    const repoPath = join(TEST_REPOS_DIR, repo);
    
    for (const scenario of scenarios) {
      console.log(`  Running: ${scenario.name}...`);
      const result = await runAstGrep(
        repoPath,
        scenario.pattern,
        scenario.language,
        scenario.options
      );
      
      results[repo].push({
        ...scenario,
        ...result
      });
      
      console.log(`    ✓ Completed in ${result.executionTime}ms, found ${result.matchCount} matches`);
    }
  }
  
  return results;
}

// Main execution
(async () => {
  console.log('Starting test execution...\n');
  console.log('Repository file counts:');
  console.log('  chalk: 34 total, 19 JS/TS');
  console.log('  typer: 737 total, 601 Python');
  console.log('  hyperfine: 69 total, 41 Rust');
  console.log('  execa: 624 total, 581 JS/TS');
  
  const results = await runAllTests();
  
  // Save results to JSON file
  const outputPath = join(__dirname, 'test-results.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log(`\n✓ Results saved to ${outputPath}`);
  console.log('\nSummary:');
  for (const [repo, scenarios] of Object.entries(results)) {
    console.log(`\n${repo}:`);
    for (const test of scenarios) {
      console.log(`  ${test.name}: ${test.matchCount} matches in ${test.executionTime}ms`);
    }
  }
})();
