/**
 * Bun Test Setup File
 *
 * This file is preloaded before all tests run (configured in bunfig.toml).
 * Use this file for:
 * - Global test configuration
 * - Test environment setup
 * - Shared test utilities
 * - Mock setup
 */

import { mkdir, mkdtemp, rm } from "fs/promises";
import { rmSync } from "fs";
import * as os from "os";
import * as path from "path";

declare global {
  // Helper flags exposed to tests
  var TEST_SKIP_NETWORK: boolean;
  var TEST_BINARY_CACHE_DIR: string | undefined;
  var createTempTestDir: (label?: string) => Promise<string>;
  var cleanupTempTestDir: (dir: string) => Promise<void>;
}

// Global test configuration
(globalThis as unknown as { TEST_TIMEOUT: number }).TEST_TIMEOUT = 30000; // 30 seconds default timeout

// Environment setup for tests
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

const resolveBooleanEnv = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

const skipNetwork = resolveBooleanEnv(process.env.TEST_SKIP_NETWORK, false);
const testCacheDir = process.env.TEST_BINARY_CACHE_DIR;

globalThis.TEST_SKIP_NETWORK = skipNetwork;
globalThis.TEST_BINARY_CACHE_DIR = testCacheDir;

const tempDirectories = new Set<string>();

globalThis.createTempTestDir = async (label = "default"): Promise<string> => {
  const tempRoot = path.join(os.tmpdir(), "tree-grep-mcp-tests");
  await mkdir(tempRoot, { recursive: true });
  const dir = await mkdtemp(path.join(tempRoot, `${label}-`));
  tempDirectories.add(dir);
  return dir;
};

globalThis.cleanupTempTestDir = async (dir: string): Promise<void> => {
  if (!dir) return;
  try {
    await rm(dir, { recursive: true, force: true });
    tempDirectories.delete(dir);
  } catch {
    // Ignore cleanup failures to avoid masking test results
  }
};

// Synchronous cleanup for exit event (async handlers won't run)
process.on("exit", () => {
  for (const dir of tempDirectories) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures to avoid masking test results
    }
  }
});

// Async cleanup for beforeExit event (runs before exit event)
process.on("beforeExit", async () => {
  for (const dir of tempDirectories) {
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup failures to avoid masking test results
    }
  }
});

// Log test environment info
console.error("Test environment initialized:");
console.error(`  Platform: ${process.platform}`);
console.error(`  Node version: ${process.version}`);
console.error(`  Working directory: ${process.cwd()}`);
console.error("Binary manager test configuration:");
console.error(`  TEST_SKIP_NETWORK=${skipNetwork}`);
console.error(`  TEST_BINARY_CACHE_DIR=${testCacheDir ?? "(default)"}`);
