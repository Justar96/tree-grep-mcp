#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

async function runCLITest(config) {
  console.log(`\nTesting: ${config.name}`);
  console.log(`Repository: ${config.repository}`);
  console.log(`Pattern: ${config.pattern}`);
  
  const outputFile = path.join(config.workingDir, `cli-test-${Date.now()}.jsonl`);
  const startTime = Date.now();
  
  try {
    const command = `ast-grep run --pattern "${config.pattern}" --lang ${config.language} --json=stream . > ${outputFile}`;
    await execAsync(command, {
      cwd: config.workingDir,
      maxBuffer: 20 * 1024 * 1024,
      shell: 'powershell.exe',
      timeout: 30000
    });
    
    const executionTime = Date.now() - startTime;
    
    const output = fs.readFileSync(outputFile, 'utf8');
    const lines = output.trim().split('\n').filter(line => line.trim());
    const matchCount = lines.length;
    
    // Get sample matches
    const samples = lines.slice(0, 3).map(line => {
      try {
        const match = JSON.parse(line);
        return {
          file: match.file || match.path,
          line: match.line || match.range?.start?.line,
          text: (match.text || match.code || '').substring(0, 60)
        };
      } catch (e) {
        return null;
      }
    }).filter(s => s);
    
    fs.unlinkSync(outputFile);
    
    console.log(`  Time: ${executionTime}ms`);
    console.log(`  Matches: ${matchCount}`);
    console.log(`  Samples:`, samples.length > 0 ? samples : 'none');
    
    return {
      success: true,
      executionTime,
      matchCount,
      samples
    };
  } catch (error) {
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    console.log(`  ERROR: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

const tests = [
  {
    name: 'Express: Middleware Functions',
    repository: 'express',
    pattern: 'function($REQ, $RES, $NEXT) { $$$BODY }',
    language: 'js',
    workingDir: 'D:\\_Project\\_test-repos\\medium\\express'
  },
  {
    name: 'Express: App Method Calls',
    repository: 'express',
    pattern: 'app.$METHOD($$$ARGS)',
    language: 'js',
    workingDir: 'D:\\_Project\\_test-repos\\medium\\express'
  },
  {
    name: 'Flask: Decorators',
    repository: 'flask',
    pattern: '@$DECORATOR',
    language: 'py',
    workingDir: 'D:\\_Project\\_test-repos\\medium\\flask'
  },
  {
    name: 'Hugo: Error Checks',
    repository: 'hugo',
    pattern: 'if err != nil { $$$BODY }',
    language: 'go',
    workingDir: 'D:\\_Project\\_test-repos\\medium\\hugo'
  },
  {
    name: 'Fastify: Register Calls',
    repository: 'fastify',
    pattern: 'fastify.register($$$ARGS)',
    language: 'js',
    workingDir: 'D:\\_Project\\_test-repos\\medium\\fastify'
  }
];

(async () => {
  console.log('='.repeat(80));
  console.log('CLI BASELINE TESTING');
  console.log('ast-grep version: 0.39.6');
  console.log('='.repeat(80));
  
  const results = [];
  for (const test of tests) {
    const result = await runCLITest(test);
    results.push({ ...test, ...result });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.success);
  console.log(`\nSuccessful tests: ${successful.length}/${results.length}`);
  console.log(`\nResults by repository:`);
  
  const byRepo = {};
  successful.forEach(r => {
    if (!byRepo[r.repository]) byRepo[r.repository] = [];
    byRepo[r.repository].push(r);
  });
  
  Object.entries(byRepo).forEach(([repo, tests]) => {
    console.log(`\n${repo}:`);
    tests.forEach(t => {
      console.log(`  - ${t.name}: ${t.matchCount} matches in ${t.executionTime}ms`);
    });
  });
  
  const avgTime = successful.reduce((s, r) => s + r.executionTime, 0) / successful.length;
  console.log(`\nAverage execution time: ${avgTime.toFixed(0)}ms`);
  
})().catch(console.error);
