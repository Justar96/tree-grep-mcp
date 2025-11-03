#!/usr/bin/env node
// Runtime detection helper - works with both Node.js and Bun
export const isBun = typeof Bun !== 'undefined';
export const isNode = !isBun;

export function getRuntime() {
  if (isBun) {
    return {
      name: 'bun',
      version: Bun.version,
      command: 'bun'
    };
  }
  return {
    name: 'node',
    version: process.version,
    command: 'node'
  };
}

export function getPackageManager() {
  const runtime = getRuntime();
  
  // Check if bun is available
  if (runtime.name === 'bun') {
    return 'bun';
  }
  
  // Fallback to npm for Node.js
  return 'npm';
}

// Display runtime info
if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = getRuntime();
  const pm = getPackageManager();
  console.log(`Runtime: ${runtime.name} ${runtime.version}`);
  console.log(`Package Manager: ${pm}`);
}
