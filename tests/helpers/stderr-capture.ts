/**
 * Test utilities for capturing and validating console output
 */

/**
 * Captures console.error calls during test execution
 */
export class StderrCapture {
  private originalError: typeof console.error;
  private capturedMessages: string[] = [];

  constructor() {
    this.originalError = console.error;
  }

  /**
   * Start capturing console.error output
   */
  start(): void {
    this.capturedMessages = [];
    console.error = (...args: unknown[]) => {
      this.capturedMessages.push(args.map((arg) => String(arg)).join(" "));
    };
  }

  /**
   * Stop capturing and restore original console.error
   */
  stop(): void {
    console.error = this.originalError;
  }

  /**
   * Get all captured messages
   */
  getMessages(): string[] {
    return [...this.capturedMessages];
  }

  /**
   * Check if any message contains the given substring
   */
  hasMessageContaining(substring: string): boolean {
    return this.capturedMessages.some((msg) => msg.includes(substring));
  }

  /**
   * Get all messages containing the given substring
   */
  getMessagesContaining(substring: string): string[] {
    return this.capturedMessages.filter((msg) => msg.includes(substring));
  }

  /**
   * Clear captured messages without stopping capture
   */
  clear(): void {
    this.capturedMessages = [];
  }

  /**
   * Get count of captured messages
   */
  getCount(): number {
    return this.capturedMessages.length;
  }
}

/**
 * Helper function to run a test with stderr capture
 *
 * @param fn - Test function to execute
 * @returns Tuple of [test result, captured messages]
 */
export async function withStderrCapture<T>(fn: () => T | Promise<T>): Promise<[T, string[]]> {
  const capture = new StderrCapture();
  capture.start();

  try {
    const result = await fn();
    return [result, capture.getMessages()];
  } finally {
    capture.stop();
  }
}

/**
 * Diff output fixtures for testing replace tool parsing
 */
export const DiffFixtures = {
  /**
   * Valid ast-grep diff output
   */
  validDiff: `test.js
1  1 │ // Sample JavaScript file
2  2 │ function test() {
3    │ -  console.log('old');
   3 │ +  logger.info('new');
4  4 │ }`,

  /**
   * Diff with multiple changes
   */
  multipleChanges: `test.js
1  1 │ const x = 1;
2    │ -var y = 2;
   2 │ +const y = 2;
3  3 │ const z = 3;
4    │ -var a = 4;
   4 │ +const a = 4;`,

  /**
   * Diff with only context lines (no changes)
   */
  noChanges: `test.js
1  1 │ const x = 1;
2  2 │ const y = 2;
3  3 │ const z = 3;`,

  /**
   * Malformed diff with unexpected format
   */
  malformed: `Something went wrong
Error: unexpected token
at line 42`,

  /**
   * Diff with truly unexpected lines (have │ but invalid format)
   */
  withUnexpectedLines: `test.js
1  1 │ valid context
│ this line has box but wrong format
another │ weird line
2  2 │ valid context`,

  /**
   * Diff with Unicode characters
   */
  unicode: `test.js
1  1 │ const msg = "Hello";
2    │ -const emoji = "😀";
   2 │ +const emoji = "🎉";
3  3 │ console.log(msg);`,

  /**
   * Diff with Windows-style line numbers
   */
  windowsStyle: `C:\\Users\\test\\file.js
1  1 │ function test() {
2    │ -  var x = 1;
   2 │ +  const x = 1;
3  3 │ }`,

  /**
   * Empty diff
   */
  empty: "",

  /**
   * Diff with very long lines
   */
  longLines: `test.js
1  1 │ ${'const x = "a".repeat(1000);'.repeat(10)}
2    │ -${'var y = "b".repeat(1000);'.repeat(10)}
   2 │ +${'const y = "b".repeat(1000);'.repeat(10)}`,

  /**
   * Diff with file deletion
   */
  fileDeletion: `--- a/old-file.js
+++ /dev/null
1    │ -const x = 1;
2    │ -const y = 2;`,

  /**
   * Diff with file creation
   */
  fileCreation: `--- /dev/null
+++ b/new-file.js
   1 │ +const x = 1;
   2 │ +const y = 2;`,

  /**
   * Diff with mixed separators (edge case)
   */
  mixedFormat: `1  1 │ line 1
2  2 - line 2 old
   2 + line 2 new
3  3 | line 3`,

  /**
   * Diff with binary file marker
   */
  binaryFile: `Binary files a/image.png and b/image.png differ`,
};

/**
 * Warning message patterns for validation
 */
export const WarningPatterns = {
  diffSkipped: /Warning: Skipped unexpected diff line/,
  diffSkippedSummary: /Warning: Skipped \d+ unexpected diff lines/,
  typeAnnotation: /Pattern contains type annotations/,
  modifier: /Pattern contains modifiers with metavariables/,
  decorator: /Pattern contains decorators/,
  complexity: /Pattern contains \d+ metavariables \(threshold: 10\)/,
  veryComplex: /Pattern complexity: very_complex/,
  unusedMetavariable: /Pattern metavariables not used in replacement/,
  multiNodeEnd: /Multi-node metavariable \$\$\$ appears at end/,
  pythonDecorator: /Python decorators.*require exact AST structure/,
  pythonTypeHint: /Python type hints require exact AST structure/,
  typescriptDecorator: /TypeScript decorators require exact AST structure/,
  typescriptGeneric: /Generic type parameters may require structural rules/,
  javaAnnotation: /Java annotations require exact AST structure/,
  javaModifier: /Java modifiers require exact AST structure/,
  rustAttribute: /Rust attributes require exact AST structure/,
  rustLifetime: /Rust lifetime parameters may require structural rules/,
  binaryVersionDetected:
    /Using (custom|system|downloaded|cached) binary: .* \(version: (?:[\w.]+|unknown)\)/,
  binaryVersionMismatch: /Binary version mismatch: found .*expected .*/,
  cacheValidationRetry: /Cache validation attempt \d+\/\d+ failed, retrying in \d+ms/,
  downloadAttempt: /Download attempt \d+\/\d+\.\.\./,
  downloadProgress: /Download progress: \d+% \(\d+\/\d+ bytes\)/,
  stageLogging: /\[Stage \d+\/\d+] .+/,
  fallbackToSystem: /Falling back to system binary/,
  githubVersionFetchFailed: /Warning: Could not fetch latest version from GitHub/,
};

/**
 * Assert that stderr contains expected warning
 */
export function assertWarning(messages: string[], pattern: RegExp, description: string): void {
  const found = messages.some((msg) => pattern.test(msg));
  if (!found) {
    throw new Error(
      `Expected warning not found: ${description}\nPattern: ${pattern}\nCaptured messages:\n${messages.join("\n")}`
    );
  }
}

/**
 * Assert that stderr does NOT contain a warning
 */
export function assertNoWarning(messages: string[], pattern: RegExp, description: string): void {
  const found = messages.some((msg) => pattern.test(msg));
  if (found) {
    const matchingMsg = messages.find((msg) => pattern.test(msg));
    throw new Error(
      `Unexpected warning found: ${description}\nPattern: ${pattern}\nMatching message: ${matchingMsg}`
    );
  }
}

/**
 * Count warnings matching a pattern
 */
export function countWarnings(messages: string[], pattern: RegExp): number {
  return messages.filter((msg) => pattern.test(msg)).length;
}

/**
 * Assert that a binary version log entry was emitted.
 */
export function assertBinaryVersionLogged(messages: string[], expectedVersion: string): void {
  // Updated to match new format: "ast-grep vX.X.X (path)"
  const pattern = new RegExp(
    `ast-grep v${expectedVersion.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`
  );
  const match = messages.find((msg) => pattern.test(msg));
  if (!match) {
    throw new Error(
      `Expected binary version log with version "${expectedVersion}", but none found.\nMessages:\n${messages.join(
        "\n"
      )}`
    );
  }
}

/**
 * Assert that a specific installation stage log entry exists.
 */
export function assertStageLogging(messages: string[], stage: number, totalStages: number): void {
  const pattern = new RegExp(`\\[Stage ${stage}/${totalStages}\\]`);
  if (!messages.some((msg) => pattern.test(msg))) {
    throw new Error(
      `Expected stage logging "[Stage ${stage}/${totalStages}]" not found.\nMessages:\n${messages.join(
        "\n"
      )}`
    );
  }
}

/**
 * Extract the first semantic version-like string from stderr messages.
 */
export function extractVersionFromMessages(messages: string[]): string | null {
  for (const message of messages) {
    const match = message.match(/\d+\.\d+\.\d+/);
    if (match) {
      return match[0];
    }
  }
  return null;
}

/**
 * Count retry log entries of the cache validation flow.
 */
export function countRetryAttempts(messages: string[]): number {
  return countWarnings(messages, WarningPatterns.cacheValidationRetry);
}

// ============================================
// CLI Flag Mapping Helper Functions
// ============================================

/**
 * Assert that CLI args contain a specific flag with expected value
 *
 * @param args - CLI arguments array
 * @param flag - Flag name (e.g., "--pattern", "--lang")
 * @param expectedValue - Expected flag value (null for boolean flags)
 * @throws Error if flag not found or value mismatch
 */
export function assertCliFlag(args: string[], flag: string, expectedValue: string | null): void {
  const flagIndex = args.indexOf(flag);
  if (flagIndex === -1) {
    throw new Error(
      `Expected CLI flag "${flag}" not found in args:\n${JSON.stringify(args, null, 2)}`
    );
  }

  if (expectedValue !== null) {
    const actualValue = args[flagIndex + 1];
    if (actualValue === undefined) {
      throw new Error(
        `Expected CLI flag "${flag}" to have value "${expectedValue}" but no value found`
      );
    }
    if (actualValue !== expectedValue) {
      throw new Error(
        `Expected CLI flag "${flag}" to have value "${expectedValue}" but got "${actualValue}"`
      );
    }
  }
}

/**
 * Assert that CLI args do NOT contain a specific flag
 *
 * @param args - CLI arguments array
 * @param flag - Flag name (e.g., "--update-all", "--stdin")
 * @throws Error if flag is found
 */
export function assertCliFlagAbsent(args: string[], flag: string): void {
  const flagIndex = args.indexOf(flag);
  if (flagIndex !== -1) {
    throw new Error(
      `Expected CLI flag "${flag}" to be absent but found at index ${flagIndex}:\n${JSON.stringify(args, null, 2)}`
    );
  }
}

/**
 * Assert that first CLI arg is the expected command
 *
 * @param args - CLI arguments array
 * @param expectedCommand - Expected command (e.g., "run", "scan")
 * @throws Error if command mismatch
 */
export function assertCliCommand(args: string[], expectedCommand: string): void {
  if (args.length === 0) {
    throw new Error(`Expected CLI command "${expectedCommand}" but args array is empty`);
  }
  if (args[0] !== expectedCommand) {
    throw new Error(
      `Expected CLI command "${expectedCommand}" but got "${args[0]}":\n${JSON.stringify(args, null, 2)}`
    );
  }
}

/**
 * Assert that CLI args contain expected positional arguments (paths)
 *
 * @param args - CLI arguments array
 * @param expectedPaths - Expected positional path arguments
 * @throws Error if paths not found or mismatch
 */
export function assertPositionalArgs(args: string[], expectedPaths: string[]): void {
  // Boolean flags that don't take values
  const booleanFlags = new Set(["--stdin", "--update-all", "--interactive", "--debug"]);

  // Find positional args (args that don't start with -- and are not flag values)
  const positionalArgs: string[] = [];
  let skipNext = false;

  for (let i = 1; i < args.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    const arg = args[i];
    if (arg.startsWith("--")) {
      // Check if this is a boolean flag or has embedded value (contains '=')
      if (booleanFlags.has(arg) || arg.includes("=")) {
        // Boolean flag or flag with embedded value, don't skip next
        continue;
      }
      // Check if this flag has a value (next arg doesn't start with --)
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        skipNext = true;
      }
    } else {
      positionalArgs.push(arg);
    }
  }

  // Compare positional args with expected paths
  if (positionalArgs.length !== expectedPaths.length) {
    throw new Error(
      `Expected ${expectedPaths.length} positional args but found ${positionalArgs.length}:\nExpected: ${JSON.stringify(expectedPaths)}\nActual: ${JSON.stringify(positionalArgs)}\nFull args: ${JSON.stringify(args, null, 2)}`
    );
  }

  for (let i = 0; i < expectedPaths.length; i++) {
    if (positionalArgs[i] !== expectedPaths[i]) {
      throw new Error(
        `Positional arg mismatch at index ${i}:\nExpected: "${expectedPaths[i]}"\nActual: "${positionalArgs[i]}"\nFull args: ${JSON.stringify(args, null, 2)}`
      );
    }
  }
}

/**
 * Extract CLI flag value from args
 *
 * @param args - CLI arguments array
 * @param flag - Flag name (e.g., "--rule", "--pattern")
 * @returns Flag value or null if not found
 */
export function extractCliFlag(args: string[], flag: string): string | null {
  const flagIndex = args.indexOf(flag);
  if (flagIndex === -1 || flagIndex + 1 >= args.length) {
    return null;
  }
  return args[flagIndex + 1];
}

/**
 * Assert that YAML contains a specific field with expected value
 *
 * @param yaml - Parsed YAML object
 * @param field - Field name (e.g., "id", "language")
 * @param expectedValue - Expected field value (optional)
 * @throws Error if field not found or value mismatch
 */
export function assertYamlField(
  yaml: Record<string, unknown>,
  field: string,
  expectedValue?: string | number
): void {
  if (!(field in yaml)) {
    throw new Error(`Expected YAML field "${field}" not found:\n${JSON.stringify(yaml, null, 2)}`);
  }

  if (expectedValue !== undefined && yaml[field] !== expectedValue) {
    throw new Error(
      `Expected YAML field "${field}" to be "${expectedValue}" but got "${yaml[field]}"`
    );
  }
}

/**
 * Assert that YAML contains all expected fields
 *
 * @param yaml - Parsed YAML object
 * @param expectedFields - Expected field names
 * @throws Error if any field is missing
 */
export function assertYamlStructure(yaml: Record<string, unknown>, expectedFields: string[]): void {
  const missingFields = expectedFields.filter((field) => !(field in yaml));
  if (missingFields.length > 0) {
    throw new Error(
      `Expected YAML fields missing: ${missingFields.join(", ")}\nYAML: ${JSON.stringify(yaml, null, 2)}`
    );
  }
}

/**
 * Parse YAML string safely using js-yaml library
 *
 * @param yamlString - YAML string to parse
 * @returns Parsed object
 */
export function parseYamlSafe(yamlString: string): Record<string, unknown> {
  // Dynamic import to avoid top-level import issues

  const yaml = require("js-yaml");

  try {
    const parsed = yaml.load(yamlString);
    // Ensure return type is an object
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("YAML parsing did not return an object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}\nYAML content:\n${yamlString}`
    );
  }
}

/**
 * Assert that a temp file exists at the given path
 *
 * @param filePath - File path to check
 * @throws Error if file doesn't exist
 */
export async function assertTempFileExists(filePath: string): Promise<void> {
  try {
    const fs = await import("fs/promises");
    await fs.access(filePath);
  } catch {
    throw new Error(`Expected temp file to exist at "${filePath}" but it doesn't`);
  }
}

/**
 * Assert that a temp file has been cleaned up (doesn't exist)
 *
 * @param filePath - File path to check
 * @throws Error if file still exists
 */
export async function assertTempFileCleanedUp(filePath: string): Promise<void> {
  try {
    const fs = await import("fs/promises");
    await fs.access(filePath);
    throw new Error(`Expected temp file at "${filePath}" to be cleaned up but it still exists`);
  } catch (error) {
    // File doesn't exist - this is expected
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}
