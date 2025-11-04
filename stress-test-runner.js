/**
 * Large Repository Stress Test Runner
 *
 * Purpose: Execute comprehensive stress tests on large repositories
 * Requirements: Node.js 18+, --expose-gc flag for memory profiling
 *
 * USAGE:
 *
 * Option 1 - Using built output (recommended):
 *   node --expose-gc stress-test-runner.js [repository-name]
 *
 * Option 2 - Using ts-node/tsx from source:
 *   tsx --expose-gc stress-test-runner.ts [repository-name]
 *
 * IMPORT PATHS:
 *
 * For built output (after running `npm run build` or `bun run build`):
 *   - Adjust paths below to match your build directory (./build/ or ./dist/)
 *
 * For ts-node/tsx execution:
 *   - Change imports to use ./src/ instead of ./build/
 *   - Example: import { SearchTool } from './src/tools/search.js';
 */

// Option 1: Built output imports (default - adjust to ./dist/ if needed)
import { SearchTool, ReplaceTool, ScanTool } from './build/tools/index.js';
import { AstGrepBinaryManager } from './build/core/binary-manager.js';
import { WorkspaceManager } from './build/core/workspace-manager.js';

// Option 2: Source imports (uncomment if using ts-node/tsx)
// import { SearchTool } from './src/tools/search.js';
// import { ReplaceTool } from './src/tools/replace.js';
// import { ScanTool } from './src/tools/scan.js';
// import { AstGrepBinaryManager } from './src/core/binary-manager.js';
// import { WorkspaceManager } from './src/core/workspace-manager.js';

import fs from 'fs/promises';
import path from 'path';

// =================================================================
// Configuration
// =================================================================

const CONFIG = {
  // Test workspace location
  workspaceRoot: './test-repos/large',
  
  // Repositories to test
  repositories: {
    react: {
      path: './test-repos/large/react',
      language: 'javascript',
      expectedFiles: 3500,
      description: 'React - JavaScript/TypeScript UI library'
    },
    django: {
      path: './test-repos/large/django',
      language: 'python',
      expectedFiles: 4500,
      description: 'Django - Python web framework'
    },
    tokio: {
      path: './test-repos/large/tokio',
      language: 'rust',
      expectedFiles: 3000,
      description: 'Tokio - Rust async runtime'
    }
  },
  
  // Timeout thresholds to test (milliseconds)
  timeoutThresholds: [30000, 60000, 120000, 180000, 240000, 300000],
  
  // maxMatches thresholds to test
  maxMatchesThresholds: [100, 500, 1000, 5000, 10000],
  
  // Output directory for results
  outputDir: './stress-test-results'
};

// =================================================================
// Utility Functions
// =================================================================

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  const mb = bytes / 1024 / 1024;
  return mb.toFixed(2) + ' MB';
}

/**
 * Format milliseconds to human-readable duration
 */
function formatDuration(ms) {
  if (ms < 1000) return ms + 'ms';
  const seconds = ms / 1000;
  if (seconds < 60) return seconds.toFixed(1) + 's';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get current memory usage
 */
function getMemoryUsage() {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss,
    heapTotal: mem.heapTotal,
    heapUsed: mem.heapUsed,
    external: mem.external,
    formatted: {
      rss: formatBytes(mem.rss),
      heapTotal: formatBytes(mem.heapTotal),
      heapUsed: formatBytes(mem.heapUsed),
      external: formatBytes(mem.external)
    }
  };
}

/**
 * Force garbage collection if available
 */
async function forceGC() {
  if (global.gc) {
    global.gc();
    await new Promise(resolve => setTimeout(resolve, 1000));
  } else {
    console.warn('⚠ Garbage collection not available. Run with --expose-gc flag for accurate memory profiling.');
  }
}

/**
 * Save test results to JSON file
 */
async function saveResults(filename, data) {
  const outputPath = path.join(CONFIG.outputDir, filename);
  await fs.mkdir(CONFIG.outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  console.log(`  💾 Results saved to: ${outputPath}`);
}

// =================================================================
// Tool Initialization
// =================================================================

async function initializeTools() {
  console.log('🔧 Initializing MCP tools...');
  
  const binaryManager = new AstGrepBinaryManager({ useSystem: true });
  await binaryManager.initialize();
  
  const workspaceManager = new WorkspaceManager();
  
  const searchTool = new SearchTool(binaryManager, workspaceManager);
  const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
  const scanTool = new ScanTool(workspaceManager, binaryManager);

  console.log('  ✓ Tools initialized successfully\n');

  return { searchTool, replaceTool, scanTool };
}

// =================================================================
// Stress Test Functions
// =================================================================

/**
 * Test timeout thresholds with complex pattern
 */
async function testTimeouts(searchTool, repoConfig, pattern) {
  console.log('\\n=== Timeout Testing ===');
  console.log(`Pattern: ${pattern}`);

  const results = [];

  for (const timeout of CONFIG.timeoutThresholds) {
    console.log(`\\nTesting timeout: ${formatDuration(timeout)}`);

    const startTime = Date.now();
    let result;
    let completed = false;
    let error = null;

    try {
      result = await searchTool.execute({
        pattern,
        paths: [repoConfig.path],
        language: repoConfig.language,
        timeoutMs: timeout,
        maxMatches: 200
      });

      completed = true;
      const executionTime = Date.now() - startTime;

      console.log(`  ✓ Completed in ${formatDuration(executionTime)}`);
      console.log(`    Matches found: ${result.summary.totalMatches}`);

      results.push({
        timeout,
        completed: true,
        executionTime,
        matchesFound: result.summary.totalMatches
      });

      // If completed, no need to test longer timeouts
      break;

    } catch (err) {
      const executionTime = Date.now() - startTime;
      error = err.message;

      console.log(`  ✗ Timeout occurred after ${formatDuration(executionTime)}`);
      console.log(`    Error: ${error}`);

      results.push({
        timeout,
        completed: false,
        executionTime,
        error
      });
    }
  }

  return results;
}

/**
 * Test result truncation with various maxMatches values
 */
async function testTruncation(searchTool, repoConfig, pattern) {
  console.log('\\n=== Result Truncation Testing ===');
  console.log(`Pattern: ${pattern}`);

  const results = [];

  for (const maxMatches of CONFIG.maxMatchesThresholds) {
    console.log(`\\nTesting maxMatches: ${maxMatches}`);

    await forceGC();

    const memBefore = getMemoryUsage();
    const startTime = Date.now();

    try {
      const result = await searchTool.execute({
        pattern,
        paths: [repoConfig.path],
        language: repoConfig.language,
        maxMatches,
        timeoutMs: 120000  // 2 minutes
      });

      const executionTime = Date.now() - startTime;
      const memAfter = getMemoryUsage();
      const memUsed = memAfter.heapUsed - memBefore.heapUsed;

      console.log(`  ✓ Completed in ${formatDuration(executionTime)}`);
      console.log(`    Memory used: ${formatBytes(memUsed)}`);
      console.log(`    Total matches: ${result.summary.totalMatches}`);
      console.log(`    Matches returned: ${result.matches.length}`);
      console.log(`    Truncated: ${result.summary.truncated}`);

      results.push({
        maxMatches,
        executionTime,
        memoryUsed: memUsed,
        totalMatches: result.summary.totalMatches,
        matchesReturned: result.matches.length,
        truncated: result.summary.truncated,
        truncatedCorrectly: result.matches.length <= maxMatches
      });

    } catch (error) {
      console.log(`  ✗ Failed: ${error.message}`);

      results.push({
        maxMatches,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Profile memory consumption
 */
async function profileMemory(searchTool, repoConfig, pattern) {
  console.log('\\n=== Memory Profiling ===');
  console.log(`Pattern: ${pattern}`);

  await forceGC();

  const memBefore = getMemoryUsage();
  console.log('Memory before:', memBefore.formatted);

  const startTime = Date.now();
  const result = await searchTool.execute({
    pattern,
    paths: [repoConfig.path],
    language: repoConfig.language,
    maxMatches: 500,
    timeoutMs: 60000
  });
  const executionTime = Date.now() - startTime;

  const memDuring = getMemoryUsage();
  console.log('Memory during (peak):', memDuring.formatted);

  await forceGC();

  const memAfter = getMemoryUsage();
  console.log('Memory after GC:', memAfter.formatted);

  const memIncreased = memDuring.heapUsed - memBefore.heapUsed;
  const memLeaked = memAfter.heapUsed - memBefore.heapUsed;
  const leakPercentage = (memLeaked / memIncreased * 100).toFixed(1);

  console.log(`\\nMemory Analysis:`);
  console.log(`  Peak increase: ${formatBytes(memIncreased)}`);
  console.log(`  Memory leaked: ${formatBytes(memLeaked)} (${leakPercentage}%)`);
  console.log(`  Execution time: ${formatDuration(executionTime)}`);
  console.log(`  Matches found: ${result.summary.totalMatches}`);

  return {
    executionTime,
    memoryBefore: memBefore,
    memoryDuring: memDuring,
    memoryAfter: memAfter,
    memoryIncreased: memIncreased,
    memoryLeaked: memLeaked,
    leakPercentage: parseFloat(leakPercentage),
    matchesFound: result.summary.totalMatches
  };
}

/**
 * Test ReplaceTool with large-scale dry-run refactoring
 */
async function testReplace(replaceTool, repoConfig, pattern, replacement) {
  console.log('\\n=== Replace Tool Testing (Dry Run) ===');
  console.log(`Pattern: ${pattern}`);
  console.log(`Replacement: ${replacement}`);

  await forceGC();

  const memBefore = getMemoryUsage();
  const startTime = Date.now();

  try {
    const result = await replaceTool.execute({
      pattern,
      replacement,
      paths: [repoConfig.path],
      language: repoConfig.language,
      dryRun: true,
      timeoutMs: 120000  // 2 minutes
    });

    const executionTime = Date.now() - startTime;
    const memAfter = getMemoryUsage();
    const memUsed = memAfter.heapUsed - memBefore.heapUsed;

    console.log(`  ✓ Completed in ${formatDuration(executionTime)}`);
    console.log(`    Memory used: ${formatBytes(memUsed)}`);
    console.log(`    Files affected: ${result.summary.filesModified}`);
    console.log(`    Total changes: ${result.summary.totalChanges}`);
    console.log(`    Diff size: ${result.diff ? (result.diff.length / 1024).toFixed(2) : 0} KB`);

    return {
      executionTime,
      memoryUsed: memUsed,
      filesModified: result.summary.filesModified,
      totalChanges: result.summary.totalChanges,
      diffSize: result.diff ? result.diff.length : 0,
      dryRun: result.summary.dryRun
    };

  } catch (error) {
    console.log(`  ✗ Failed: ${error.message}`);

    return {
      error: error.message
    };
  }
}

/**
 * Test ScanTool with rule-based scanning
 */
async function testScan(scanTool, repoConfig, ruleConfig) {
  console.log('\\n=== Scan Tool Testing (Rule-Based) ===');
  console.log(`Rule ID: ${ruleConfig.id}`);
  console.log(`Pattern: ${ruleConfig.pattern}`);

  await forceGC();

  const memBefore = getMemoryUsage();
  const startTime = Date.now();

  try {
    const result = await scanTool.execute({
      ...ruleConfig,
      paths: [repoConfig.path],
      language: repoConfig.language,
      timeoutMs: 120000  // 2 minutes
    });

    const executionTime = Date.now() - startTime;
    const memAfter = getMemoryUsage();
    const memUsed = memAfter.heapUsed - memBefore.heapUsed;

    console.log(`  ✓ Completed in ${formatDuration(executionTime)}`);
    console.log(`    Memory used: ${formatBytes(memUsed)}`);
    console.log(`    Total findings: ${result.scan.summary.totalFindings}`);
    console.log(`    Errors: ${result.scan.summary.errors}`);
    console.log(`    Warnings: ${result.scan.summary.warnings}`);
    console.log(`    YAML size: ${result.yaml ? (result.yaml.length / 1024).toFixed(2) : 0} KB`);

    return {
      executionTime,
      memoryUsed: memUsed,
      totalFindings: result.scan.summary.totalFindings,
      errors: result.scan.summary.errors,
      warnings: result.scan.summary.warnings,
      yamlSize: result.yaml ? result.yaml.length : 0
    };

  } catch (error) {
    console.log(`  ✗ Failed: ${error.message}`);

    return {
      error: error.message
    };
  }
}

// =================================================================
// Repository-Specific Tests
// =================================================================

async function testReactRepository(tools) {
  console.log('\\n╔══════════════════════════════════════════╗');
  console.log('║   React Repository Stress Tests         ║');
  console.log('╚══════════════════════════════════════════╝');

  const repoConfig = CONFIG.repositories.react;
  const { searchTool, replaceTool, scanTool } = tools;

  const results = {
    repository: 'react',
    tests: []
  };

  // Test 1: Component search with large result sets
  console.log('\\n--- Test 1: Component Search with maxMatches Truncation ---');
  const test1Results = await testTruncation(
    searchTool,
    repoConfig,
    'function $NAME($$PROPS) { $$BODY }'
  );
  results.tests.push({
    name: 'Component Search - Result Truncation',
    type: 'truncation',
    results: test1Results
  });

  // Test 2: JSX pattern with timeout testing
  console.log('\\n--- Test 2: JSX Pattern with Timeout Testing ---');
  const test2Results = await testTimeouts(
    searchTool,
    repoConfig,
    '<$COMPONENT $$PROPS>$$CHILDREN</$COMPONENT>'
  );
  results.tests.push({
    name: 'JSX Pattern - Timeout Testing',
    type: 'timeout',
    results: test2Results
  });

  // Test 3: Hook pattern with memory profiling
  console.log('\\n--- Test 3: Hook Pattern with Memory Profiling ---');
  const test3Results = await profileMemory(
    searchTool,
    repoConfig,
    'useEffect(() => { $$ }, [$$DEPS])'
  );
  results.tests.push({
    name: 'Hook Pattern - Memory Profiling',
    type: 'memory',
    results: test3Results
  });

  // Test 4: Replace tool - var to const refactoring (dry run)
  console.log('\\n--- Test 4: Replace Tool - var to const (Dry Run) ---');
  const test4Results = await testReplace(
    replaceTool,
    repoConfig,
    'var $NAME = $VALUE',
    'const $NAME = $VALUE'
  );
  results.tests.push({
    name: 'Replace Tool - var to const',
    type: 'replace',
    results: test4Results
  });

  // Test 5: Scan tool - deprecated lifecycle methods
  console.log('\\n--- Test 5: Scan Tool - Deprecated Lifecycle Methods ---');
  const test5Results = await testScan(
    scanTool,
    repoConfig,
    {
      id: 'no-deprecated-lifecycle',
      message: 'Deprecated React lifecycle method detected',
      severity: 'error',
      note: 'Replace with modern lifecycle methods or hooks',
      pattern: 'componentWillMount($$ARGS) { $$BODY }'
    }
  );
  results.tests.push({
    name: 'Scan Tool - Deprecated Methods',
    type: 'scan',
    results: test5Results
  });

  // Test 6: Complex nested pattern stress test
  console.log('\\n--- Test 6: Complex Nested Pattern Stress Test ---');
  const test6Results = await testTimeouts(
    searchTool,
    repoConfig,
    'function $F1($$A1) { if ($C1) { if ($C2) { function $F2($$A2) { $$BODY } } } }'
  );
  results.tests.push({
    name: 'Complex Nested Pattern - Timeout Testing',
    type: 'timeout',
    results: test6Results
  });

  // Save results
  await saveResults('react-stress-test-results.json', results);

  return results;
}

async function testDjangoRepository(tools) {
  console.log('\\n╔══════════════════════════════════════════╗');
  console.log('║   Django Repository Stress Tests        ║');
  console.log('╚══════════════════════════════════════════╝');

  const repoConfig = CONFIG.repositories.django;
  const { searchTool, replaceTool, scanTool } = tools;

  const results = {
    repository: 'django',
    tests: []
  };

  // Test 1: Model definition search with memory profiling
  console.log('\\n--- Test 1: Model Definition with Memory Profiling ---');
  const test1Results = await profileMemory(
    searchTool,
    repoConfig,
    'class $NAME(models.Model): $$'
  );
  results.tests.push({
    name: 'Model Definition - Memory Profiling',
    type: 'memory',
    results: test1Results
  });

  // Test 2: ORM query pattern with timeout testing
  console.log('\\n--- Test 2: ORM Query Pattern with Timeout Testing ---');
  const test2Results = await testTimeouts(
    searchTool,
    repoConfig,
    '$MODEL.objects.filter($$ARGS)'
  );
  results.tests.push({
    name: 'ORM Query Pattern - Timeout Testing',
    type: 'timeout',
    results: test2Results
  });

  // Test 3: Replace tool - old-style string formatting (dry run)
  console.log('\\n--- Test 3: Replace Tool - String Formatting (Dry Run) ---');
  const test3Results = await testReplace(
    replaceTool,
    repoConfig,
    '"%s" % $VAR',
    'f"{$VAR}"'
  );
  results.tests.push({
    name: 'Replace Tool - String Formatting',
    type: 'replace',
    results: test3Results
  });

  // Test 4: Scan tool - SQL injection patterns
  console.log('\\n--- Test 4: Scan Tool - SQL Injection Patterns ---');
  const test4Results = await testScan(
    scanTool,
    repoConfig,
    {
      id: 'no-raw-sql',
      message: 'Potential SQL injection vulnerability',
      severity: 'error',
      note: 'Use parameterized queries instead',
      pattern: 'cursor.execute($SQL + $VAR)'
    }
  );
  results.tests.push({
    name: 'Scan Tool - SQL Injection',
    type: 'scan',
    results: test4Results
  });

  // Test 5: Decorator pattern with truncation testing
  console.log('\\n--- Test 5: Decorator Pattern with Truncation Testing ---');
  const test5Results = await testTruncation(
    searchTool,
    repoConfig,
    '@$DECORATOR\\ndef $NAME($$ARGS): $$'
  );
  results.tests.push({
    name: 'Decorator Pattern - Truncation Testing',
    type: 'truncation',
    results: test5Results
  });

  // Test 6: Complex class method pattern
  console.log('\\n--- Test 6: Complex Class Method Pattern ---');
  const test6Results = await profileMemory(
    searchTool,
    repoConfig,
    'class $CLASS($$BASES):\\n    def $METHOD(self, $$ARGS):\\n        $$BODY'
  );
  results.tests.push({
    name: 'Complex Class Method - Memory Profiling',
    type: 'memory',
    results: test6Results
  });

  // Save results
  await saveResults('django-stress-test-results.json', results);

  return results;
}

async function testTokioRepository(tools) {
  console.log('\\n╔══════════════════════════════════════════╗');
  console.log('║   Tokio Repository Stress Tests          ║');
  console.log('╚══════════════════════════════════════════╝');

  const repoConfig = CONFIG.repositories.tokio;
  const { searchTool, replaceTool, scanTool } = tools;

  const results = {
    repository: 'tokio',
    tests: []
  };

  // Test 1: Async function with memory profiling
  console.log('\\n--- Test 1: Async Function with Memory Profiling ---');
  const test1Results = await profileMemory(
    searchTool,
    repoConfig,
    'async fn $NAME($$PARAMS) -> $RET { $$BODY }'
  );
  results.tests.push({
    name: 'Async Function - Memory Profiling',
    type: 'memory',
    results: test1Results
  });

  // Test 2: Macro invocation with truncation testing
  console.log('\\n--- Test 2: Macro Invocation with Truncation Testing ---');
  const test2Results = await testTruncation(
    searchTool,
    repoConfig,
    '$MACRO!($$ARGS)'
  );
  results.tests.push({
    name: 'Macro Invocation - Truncation Testing',
    type: 'truncation',
    results: test2Results
  });

  // Test 3: Replace tool - unwrap to expect (dry run)
  console.log('\\n--- Test 3: Replace Tool - unwrap to expect (Dry Run) ---');
  const test3Results = await testReplace(
    replaceTool,
    repoConfig,
    '$EXPR.unwrap()',
    '$EXPR.expect("TODO: add error message")'
  );
  results.tests.push({
    name: 'Replace Tool - unwrap to expect',
    type: 'replace',
    results: test3Results
  });

  // Test 4: Scan tool - unsafe blocks
  console.log('\\n--- Test 4: Scan Tool - Unsafe Blocks ---');
  const test4Results = await testScan(
    scanTool,
    repoConfig,
    {
      id: 'unsafe-block-check',
      message: 'Unsafe block detected',
      severity: 'warning',
      note: 'Ensure unsafe code is properly documented and justified',
      pattern: 'unsafe { $$BODY }'
    }
  );
  results.tests.push({
    name: 'Scan Tool - Unsafe Blocks',
    type: 'scan',
    results: test4Results
  });

  // Test 5: Impl block with timeout testing
  console.log('\\n--- Test 5: Impl Block with Timeout Testing ---');
  const test5Results = await testTimeouts(
    searchTool,
    repoConfig,
    'impl $TRAIT for $TYPE { $$METHODS }'
  );
  results.tests.push({
    name: 'Impl Block - Timeout Testing',
    type: 'timeout',
    results: test5Results
  });

  // Test 6: Complex pattern with nested generics
  console.log('\\n--- Test 6: Complex Pattern with Nested Generics ---');
  const test6Results = await profileMemory(
    searchTool,
    repoConfig,
    'fn $NAME<$T: $TRAIT>($$PARAMS) -> Result<$RET, $ERR> { $$BODY }'
  );
  results.tests.push({
    name: 'Complex Generic Pattern - Memory Profiling',
    type: 'memory',
    results: test6Results
  });

  // Save results
  await saveResults('tokio-stress-test-results.json', results);

  return results;
}

// =================================================================
// Main Execution
// =================================================================

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Large Repository Stress Test Runner                 ║');
  console.log('║  Purpose: Identify performance bottlenecks & limits  ║');
  console.log('╚═══════════════════════════════════════════════════════╝\\n');

  // Check for --expose-gc flag
  if (!global.gc) {
    console.warn('⚠ WARNING: --expose-gc flag not detected');
    console.warn('  Memory profiling will be less accurate');
    console.warn('  Run with: node --expose-gc stress-test-runner.js\\n');
  }

  // Initialize tools
  const tools = await initializeTools();

  // Run tests based on command line argument
  const repoArg = process.argv[2];

  if (repoArg === 'react' || !repoArg) {
    await testReactRepository(tools);
  }

  if (repoArg === 'django' || !repoArg) {
    await testDjangoRepository(tools);
  }

  if (repoArg === 'tokio' || !repoArg) {
    await testTokioRepository(tools);
  }

  console.log('\\n✅ Stress testing complete!');
  console.log(`Results saved to: ${CONFIG.outputDir}/`);
}

// Run main function
main().catch(error => {
  console.error('\\n❌ Stress testing failed:');
  console.error(error);
  process.exit(1);
});

