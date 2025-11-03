#!/usr/bin/env node
import { AstGrepBinaryManager } from '../build/core/binary-manager.js';

async function main() {
  try {
    const mgr = new AstGrepBinaryManager({ autoInstall: true });
    await mgr.initialize();
    const p = mgr.getBinaryPath();
    console.log(p ? `ast-grep ready at: ${p}` : 'ast-grep ready');
    process.exit(0);
  } catch (e) {
    console.error('Failed to install or locate ast-grep:', e?.message || e);
    process.exit(1);
  }
}

main();
