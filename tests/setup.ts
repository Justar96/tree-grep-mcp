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

// Global test configuration
globalThis.TEST_TIMEOUT = 30000; // 30 seconds default timeout

// Environment setup for tests
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Log test environment info
console.error('Test environment initialized:');
console.error(`  Platform: ${process.platform}`);
console.error(`  Node version: ${process.version}`);
console.error(`  Working directory: ${process.cwd()}`);
