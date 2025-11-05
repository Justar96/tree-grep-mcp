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
      this.capturedMessages.push(args.map(arg => String(arg)).join(' '));
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
    return this.capturedMessages.some(msg => msg.includes(substring));
  }

  /**
   * Get all messages containing the given substring
   */
  getMessagesContaining(substring: string): string[] {
    return this.capturedMessages.filter(msg => msg.includes(substring));
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
export async function withStderrCapture<T>(
  fn: () => T | Promise<T>
): Promise<[T, string[]]> {
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
  empty: '',

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
};

/**
 * Assert that stderr contains expected warning
 */
export function assertWarning(
  messages: string[],
  pattern: RegExp,
  description: string
): void {
  const found = messages.some(msg => pattern.test(msg));
  if (!found) {
    throw new Error(
      `Expected warning not found: ${description}\nPattern: ${pattern}\nCaptured messages:\n${messages.join('\n')}`
    );
  }
}

/**
 * Assert that stderr does NOT contain a warning
 */
export function assertNoWarning(
  messages: string[],
  pattern: RegExp,
  description: string
): void {
  const found = messages.some(msg => pattern.test(msg));
  if (found) {
    const matchingMsg = messages.find(msg => pattern.test(msg));
    throw new Error(
      `Unexpected warning found: ${description}\nPattern: ${pattern}\nMatching message: ${matchingMsg}`
    );
  }
}

/**
 * Count warnings matching a pattern
 */
export function countWarnings(messages: string[], pattern: RegExp): number {
  return messages.filter(msg => pattern.test(msg)).length;
}
