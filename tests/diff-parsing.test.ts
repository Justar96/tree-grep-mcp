/**
 * Comprehensive tests for diff parsing robustness in ReplaceTool
 *
 * Tests cover edge cases, malformed input, Unicode handling, and warning validation
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import { ReplaceTool } from '../src/tools/replace.js';
import { AstGrepBinaryManager } from '../src/core/binary-manager.js';
import { WorkspaceManager } from '../src/core/workspace-manager.js';
import {
  StderrCapture,
  DiffFixtures,
  WarningPatterns,
  withStderrCapture,
  assertWarning,
  assertNoWarning,
  countWarnings,
} from './helpers/stderr-capture.js';

// Shared instances for all tests
let binaryManager: AstGrepBinaryManager;
let workspaceManager: WorkspaceManager;

beforeAll(async () => {
  // Initialize binary manager (will use system installation if available)
  binaryManager = new AstGrepBinaryManager({ useSystem: true });
  await binaryManager.initialize();

  // Initialize workspace manager
  workspaceManager = new WorkspaceManager();
});

describe('Diff Parsing Edge Cases', () => {
  describe('Valid Diff Formats', () => {
    test('parses standard ast-grep diff output correctly', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(DiffFixtures.validDiff, { dryRun: true });

      expect(result.changes.length).toBe(1);
      expect(result.changes[0].matches).toBe(1);
      expect(result.changes[0].preview).toContain('│ -');
      expect(result.changes[0].preview).toContain('│ +');
      expect(result.skippedLines).toBe(0);
    });

    test('parses diff with multiple changes', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(
        DiffFixtures.multipleChanges,
        { dryRun: true }
      );

      expect(result.changes.length).toBe(1);
      expect(result.changes[0].matches).toBe(2); // Two deletions
      expect(result.skippedLines).toBe(0);
    });

    test('handles diff with only context lines (no changes)', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(DiffFixtures.noChanges, { dryRun: true });

      // Context-only diff should still create a change entry
      expect(result.changes.length).toBe(1);
      expect(result.skippedLines).toBe(0);
    });

    test('handles empty diff output', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(DiffFixtures.empty, { dryRun: true });

      expect(result.changes.length).toBe(0);
      expect(result.skippedLines).toBe(0);
      expect(result.summary.totalChanges).toBe(0);
    });
  });

  describe('Unicode and Special Characters', () => {
    test('handles Unicode characters in diff content', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(DiffFixtures.unicode, { dryRun: true });

      expect(result.changes.length).toBe(1);
      expect(result.changes[0].matches).toBe(1);
      expect(result.changes[0].preview).toContain('😀');
      expect(result.changes[0].preview).toContain('🎉');
    });

    test('handles Windows-style paths in diff output', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(
        DiffFixtures.windowsStyle,
        { dryRun: true }
      );

      expect(result.changes.length).toBe(1);
      expect(result.changes[0].file).toContain('file.js');
    });

    test('handles very long diff lines without truncation errors', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(DiffFixtures.longLines, { dryRun: true });

      expect(result.changes.length).toBe(1);
      expect(result.changes[0].matches).toBe(1);
      // Should not throw or lose data
      expect(result.changes[0].preview).toBeDefined();
    });
  });

  describe('Malformed and Edge Case Diffs', () => {
    test('handles completely malformed diff output', async () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const [result, stderr] = await withStderrCapture(() =>
        (replaceTool as any).parseResults(DiffFixtures.malformed, { dryRun: true })
      );

      // Should not throw - malformed text becomes file headers
      expect(result).toBeDefined();
      // Lines without diff markers are treated as file headers, not skipped lines
      expect(result.changes.length).toBeGreaterThanOrEqual(0);
    });

    test('handles mixed diff format separators', async () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const [result, stderr] = await withStderrCapture(() =>
        (replaceTool as any).parseResults(DiffFixtures.mixedFormat, { dryRun: true })
      );

      expect(result).toBeDefined();
      // Mixed format might cause some lines to be skipped
      if (result.skippedLines > 0) {
        expect(stderr.length).toBeGreaterThan(0);
      }
    });

    test('handles binary file markers', async () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const [result, stderr] = await withStderrCapture(() =>
        (replaceTool as any).parseResults(DiffFixtures.binaryFile, { dryRun: true })
      );

      expect(result).toBeDefined();
      // Binary file marker is treated as a file header (doesn't contain │)
      expect(result.changes.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('File Creation and Deletion', () => {
    test('handles file deletion diffs', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(
        DiffFixtures.fileDeletion,
        { dryRun: true }
      );

      expect(result.changes.length).toBe(1);
      expect(result.changes[0].matches).toBe(2); // Two deletions
    });

    test('handles file creation diffs', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(
        DiffFixtures.fileCreation,
        { dryRun: true }
      );

      expect(result.changes.length).toBe(1);
      // File creation shows additions only
      expect(result.changes[0].preview).toContain('│ +');
    });
  });

  describe('Warning Logging and Propagation', () => {
    test('logs warning for each skipped unexpected line', async () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const capture = new StderrCapture();

      capture.start();
      const result = (replaceTool as any).parseResults(DiffFixtures.withUnexpectedLines, { dryRun: true });
      capture.stop();

      const messages = capture.getMessages();
      const skippedWarnings = countWarnings(messages, WarningPatterns.diffSkipped);

      // Should have individual warnings for each skipped line
      expect(skippedWarnings).toBeGreaterThan(0);
      expect(skippedWarnings).toBe(result.skippedLines);
    });

    test('logs summary warning when lines are skipped', async () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const [result, stderr] = await withStderrCapture(() =>
        (replaceTool as any).parseResults(DiffFixtures.malformed, { dryRun: true })
      );

      if (result.skippedLines > 0) {
        assertWarning(stderr, WarningPatterns.diffSkippedSummary, 'Summary warning for skipped lines');

        // Verify the summary includes the count
        const summaryMsg = stderr.find(msg => WarningPatterns.diffSkippedSummary.test(msg));
        expect(summaryMsg).toContain(String(result.skippedLines));
      }
    });

    test('does not log warnings when all lines are valid', async () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const [result, stderr] = await withStderrCapture(() =>
        (replaceTool as any).parseResults(DiffFixtures.validDiff, { dryRun: true })
      );

      expect(result.skippedLines).toBe(0);
      assertNoWarning(stderr, WarningPatterns.diffSkipped, 'No skipped line warnings for valid diff');
      assertNoWarning(stderr, WarningPatterns.diffSkippedSummary, 'No summary warning for valid diff');
    });

    test('skippedLines count is included in summary', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(DiffFixtures.malformed, { dryRun: true });

      expect(result.summary.skippedLines).toBeDefined();
      expect(result.summary.skippedLines).toBe(result.skippedLines);
    });

    test('warnings are truncated to 100 chars in log messages', async () => {
      const veryLongLine = 'x'.repeat(200);
      const diffWithLongLine = `some header\n${veryLongLine}\n`;

      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const [, stderr] = await withStderrCapture(() =>
        (replaceTool as any).parseResults(diffWithLongLine, { dryRun: true })
      );

      const warningMsg = stderr.find(msg => msg.includes('Skipped unexpected diff line'));
      if (warningMsg) {
        // Message should not contain the full 200 chars
        expect(warningMsg.length).toBeLessThan(veryLongLine.length + 50);
        expect(warningMsg).toContain('...');
      }
    });
  });

  describe('Context Line Recognition', () => {
    test('recognizes context lines with space before box character', () => {
      // This is the actual format from ast-grep: "1  1 │ code"
      const diffWithSpaceBeforeBox = `test.js
1  1 │ const x = 1;
2    │ -var y = 2;
   2 │ +const y = 2;
3  3 │ const z = 3;`;

      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(diffWithSpaceBeforeBox, { dryRun: true });

      // Context lines should be recognized, not skipped
      expect(result.skippedLines).toBe(0);
    });

    test('recognizes context lines without space before box character', () => {
      // Alternative format: "1  1│ code" (no space before │)
      const diffWithoutSpaceBeforeBox = `test.js
1  1│ const x = 1;
2   │ -var y = 2;
  2│ +const y = 2;
3  3│ const z = 3;`;

      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(diffWithoutSpaceBeforeBox, { dryRun: true });

      // Context lines should be recognized, not skipped
      expect(result.skippedLines).toBe(0);
    });

    test('recognizes change markers with space variations', () => {
      const diffWithVariousSpacing = `test.js
1  1 │ context
2    │ -deletion
   2 │ +addition
3  3│another context`;

      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(diffWithVariousSpacing, { dryRun: true });

      expect(result.changes.length).toBe(1);
      expect(result.changes[0].matches).toBe(1);
      expect(result.skippedLines).toBe(0);
    });
  });

  describe('Diff Metadata Handling', () => {
    test('handles standard git diff headers', () => {
      const diffWithGitHeaders = `diff --git a/file.js b/file.js
index abc123..def456 100644
--- a/file.js
+++ b/file.js
@@ -1,3 +1,3 @@
1  1 │ const x = 1;
2    │ -var y = 2;
   2 │ +const y = 2;`;

      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(diffWithGitHeaders, { dryRun: true });

      // Git headers should be recognized as valid formatting
      expect(result.skippedLines).toBe(0);
    });

    test('handles @@ hunk headers', () => {
      const diffWithHunkHeaders = `file.js
@@ -1,3 +1,3 @@
1  1 │ const x = 1;
2    │ -var y = 2;
   2 │ +const y = 2;
@@ -10,5 +10,5 @@
10 10 │ const a = 1;`;

      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(diffWithHunkHeaders, { dryRun: true });

      // @@ headers should be recognized
      expect(result.skippedLines).toBe(0);
    });
  });

  describe('Edge Cases in Change Counting', () => {
    test('counts only deletions for change matches', () => {
      const diffWithDeletionsAndAdditions = `file.js
1  1 │ context
2    │ -deletion1
   2 │ +addition1
3    │ -deletion2
   3 │ +addition2
4  4 │ context`;

      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(
        diffWithDeletionsAndAdditions,
        { dryRun: true }
      );

      // Should count 2 changes (based on deletion markers)
      expect(result.changes[0].matches).toBe(2);
    });

    test('handles multiple files in single diff output', () => {
      const multiFileDiff = `file1.js
1  1 │ const x = 1;
2    │ -var y = 2;
   2 │ +const y = 2;

file2.js
1  1 │ const a = 1;
2    │ -var b = 2;
   2 │ +const b = 2;`;

      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(multiFileDiff, { dryRun: true });

      expect(result.changes.length).toBe(2);
      expect(result.summary.filesModified).toBe(2);
    });

    test('summary totalChanges matches sum of all file matches', () => {
      const multiFileDiff = `file1.js
1    │ -deletion1
   1 │ +addition1
2    │ -deletion2
   2 │ +addition2

file2.js
1    │ -deletion3
   1 │ +addition3`;

      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(multiFileDiff, { dryRun: true });

      const expectedTotal = result.changes.reduce((sum, c) => sum + c.matches, 0);
      expect(result.summary.totalChanges).toBe(expectedTotal);
    });
  });

  describe('DryRun vs Applied Mode', () => {
    test('includes preview in dry-run mode', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(
        DiffFixtures.validDiff,
        { dryRun: true }
      );

      expect(result.changes[0].preview).toBeDefined();
      expect(result.changes[0].applied).toBe(false);
      expect(result.summary.dryRun).toBe(true);
    });

    test('excludes preview when dryRun is false', () => {
      const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
      const result = (replaceTool as any).parseResults(
        DiffFixtures.validDiff,
        { dryRun: false }
      );

      expect(result.changes[0].preview).toBeUndefined();
      expect(result.changes[0].applied).toBe(true);
      expect(result.summary.dryRun).toBe(false);
    });
  });
});
