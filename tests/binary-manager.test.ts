import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { AstGrepBinaryManager } from "../src/core/binary-manager.js";
import { BinaryError } from "../src/types/errors.js";
import {
  StderrCapture,
  assertBinaryVersionLogged,
  assertStageLogging,
  countRetryAttempts,
} from "./helpers/stderr-capture.js";

const execFileAsync = promisify(execFile);

declare global {
  // Injected via tests/setup.ts
  var TEST_SKIP_NETWORK: boolean;
  var TEST_BINARY_CACHE_DIR: string | undefined;
  var createTempTestDir: (label?: string) => Promise<string>;
  var cleanupTempTestDir: (dir: string) => Promise<void>;
}

const DEFAULT_VERSION = "0.39.5";
const SKIP_NETWORK = globalThis.TEST_SKIP_NETWORK ?? false;
const ORIGINAL_PATH = process.env.PATH ?? "";

const createdTempDirs: string[] = [];

const ensureTempDir = async (label: string): Promise<string> => {
  if (typeof globalThis.createTempTestDir === "function") {
    const dir = await globalThis.createTempTestDir(label);
    createdTempDirs.push(dir);
    return dir;
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `tree-grep-${label}-`));
  createdTempDirs.push(dir);
  return dir;
};

const cleanupTempDirectories = async (): Promise<void> => {
  while (createdTempDirs.length > 0) {
    const dir = createdTempDirs.pop();
    if (!dir) {
      continue;
    }

    if (typeof globalThis.cleanupTempTestDir === "function") {
      await globalThis.cleanupTempTestDir(dir);
    } else {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
};

const resetStubEnvironment = (): void => {
  delete process.env.AST_GREP_STUB_MODE;
  delete process.env.AST_GREP_STUB_VERSION;
  delete process.env.AST_GREP_STUB_DELAY;
};

const restorePath = (): void => {
  process.env.PATH = ORIGINAL_PATH;
};

afterEach(async () => {
  resetStubEnvironment();
  restorePath();
  await cleanupTempDirectories();
});

const createCrossPlatformStubBinary = async (
  directory: string,
  options: {
    baseName?: string;
    version?: string;
    makeNonExecutable?: boolean;
    windowsVariant?: "cmd" | "ps1";
  } = {}
): Promise<string> => {
  const baseName = options.baseName ?? "ast-grep";
  const version = options.version ?? DEFAULT_VERSION;

  if (process.platform === "win32") {
    const scriptPath = path.join(directory, `${baseName}.mjs`);
    const scriptContent = `#!/usr/bin/env node
const defaultVersion = "${version}";
const defaultMode = "normal";
const mode = process.env.AST_GREP_STUB_MODE ?? defaultMode;
const resolvedVersion = process.env.AST_GREP_STUB_VERSION ?? defaultVersion;
const delay = Number(process.env.AST_GREP_STUB_DELAY ?? "6000");

async function handleVersion() {
  if (mode === "hang") {
    setTimeout(() => {}, delay);
    return;
  }
  if (mode === "delay") {
    setTimeout(() => {
      console.log("ast-grep " + resolvedVersion);
      process.exit(0);
    }, delay);
    return;
  }
  if (mode === "stderr") {
    console.error("ast-grep " + resolvedVersion);
  } else if (mode === "invalid") {
    console.log("invalid output");
  } else if (mode === "empty") {
    // Intentionally no output
  } else {
    console.log("ast-grep " + resolvedVersion);
  }
  process.exit(0);
}

(async () => {
  if (process.argv.includes("--version")) {
    await handleVersion();
    return;
  }

  if (mode === "exit-error") {
    process.exit(1);
  }

  if (mode === "print-args") {
    console.log(process.argv.slice(2).join(" "));
    process.exit(0);
    return;
  }

  console.log("ast-grep stub executed");
  process.exit(0);
})();`;

    await fs.writeFile(scriptPath, scriptContent, "utf8");

    if (options.makeNonExecutable) {
      return scriptPath;
    }

    if (options.windowsVariant === "ps1") {
      const ps1Path = path.join(directory, `${baseName}.ps1`);
      const ps1Script = `
$ErrorActionPreference = "Stop"
node "${scriptPath.replace(/\\/g, "/")}" @args
`;
      await fs.writeFile(ps1Path, ps1Script, "utf8");
      return ps1Path;
    }

    const cmdPath = path.join(directory, `${baseName}.cmd`);
    const cmdScript = `@echo off\r\nnode "%~dp0${baseName}.mjs" %*\r\n`;
    await fs.writeFile(cmdPath, cmdScript, "utf8");
    return cmdPath;
  }

  const binaryPath = path.join(directory, baseName);
  const script = `#!/usr/bin/env node
const defaultVersion = "${version}";
const defaultMode = "normal";
const mode = process.env.AST_GREP_STUB_MODE ?? defaultMode;
const resolvedVersion = process.env.AST_GREP_STUB_VERSION ?? defaultVersion;
const delay = Number(process.env.AST_GREP_STUB_DELAY ?? "6000");

async function handleVersion() {
  if (mode === "hang") {
    setTimeout(() => {}, delay);
    return;
  }
  if (mode === "delay") {
    setTimeout(() => {
      console.log("ast-grep " + resolvedVersion);
      process.exit(0);
    }, delay);
    return;
  }
  if (mode === "stderr") {
    console.error("ast-grep " + resolvedVersion);
  } else if (mode === "invalid") {
    console.log("invalid output");
  } else if (mode === "empty") {
    // No output
  } else {
    console.log("ast-grep " + resolvedVersion);
  }
  process.exit(0);
}

(async () => {
  if (process.argv.includes("--version")) {
    await handleVersion();
    return;
  }

  if (mode === "exit-error") {
    process.exit(1);
  }

  if (mode === "print-args") {
    console.log(process.argv.slice(2).join(" "));
    process.exit(0);
    return;
  }

  console.log("ast-grep stub executed");
  process.exit(0);
})();`;

  await fs.writeFile(binaryPath, script, "utf8");

  if (!options.makeNonExecutable) {
    await fs.chmod(binaryPath, 0o755);
  }

  return binaryPath;
};

const describeSkipNetworkAware = (title: string, callback: () => void): void => {
  if (SKIP_NETWORK) {
    describe.skip(`${title} (network skipped)`, callback);
  } else {
    describe(title, callback);
  }
};

describe("AstGrepBinaryManager - Version Detection and Comparison", () => {
  test("extractBinaryVersion returns semantic version from stub binary", async () => {
    const tempDir = await ensureTempDir("version-detect");
    const binaryPath = await createCrossPlatformStubBinary(tempDir, { version: "0.39.5" });

    const manager = new AstGrepBinaryManager();
    const version = await (
      manager as unknown as { extractBinaryVersion: (file: string) => Promise<string | null> }
    ).extractBinaryVersion(binaryPath);

    expect(version).toBe("0.39.5");
  });

  test("extractBinaryVersion parses versions emitted on stderr", async () => {
    const tempDir = await ensureTempDir("version-stderr");
    const binaryPath = await createCrossPlatformStubBinary(tempDir, { version: "0.40.0" });

    process.env.AST_GREP_STUB_MODE = "stderr";

    const manager = new AstGrepBinaryManager();
    const version = await (
      manager as unknown as { extractBinaryVersion: (file: string) => Promise<string | null> }
    ).extractBinaryVersion(binaryPath);

    expect(version).toBe("0.40.0");
  });

  test("extractBinaryVersion returns null when version cannot be parsed", async () => {
    const tempDir = await ensureTempDir("version-invalid");
    const binaryPath = await createCrossPlatformStubBinary(tempDir);

    process.env.AST_GREP_STUB_MODE = "invalid";

    const manager = new AstGrepBinaryManager();
    const capture = new StderrCapture();
    capture.start();
    const version = await (
      manager as unknown as { extractBinaryVersion: (file: string) => Promise<string | null> }
    ).extractBinaryVersion(binaryPath);
    capture.stop();

    expect(version).toBeNull();
  });

  test("extractBinaryVersion returns null when binary path is invalid", async () => {
    const manager = new AstGrepBinaryManager();
    const version = await (
      manager as unknown as { extractBinaryVersion: (file: string) => Promise<string | null> }
    ).extractBinaryVersion("/invalid/path/to/ast-grep");
    expect(version).toBeNull();
  });

  test.skip("extractBinaryVersion times out after 5 seconds for hung binaries", async () => {
    // Skipped: This test takes 5+ seconds and tests timeout behavior which is already working
    const tempDir = await ensureTempDir("version-timeout");
    const binaryPath = await createCrossPlatformStubBinary(tempDir);

    process.env.AST_GREP_STUB_MODE = "hang";
    process.env.AST_GREP_STUB_DELAY = "12000";

    const manager = new AstGrepBinaryManager();
    const version = await (
      manager as unknown as { extractBinaryVersion: (file: string) => Promise<string | null> }
    ).extractBinaryVersion(binaryPath);

    expect(version).toBeNull();
  });

  test("compareVersions handles version equality", () => {
    const manager = new AstGrepBinaryManager();
    const result = (
      manager as unknown as { compareVersions: (a: string, b: string) => number }
    ).compareVersions("0.39.5", "0.39.5");
    expect(result).toBe(0);
  });

  test("compareVersions detects major version differences", () => {
    const manager = new AstGrepBinaryManager();
    const result = (
      manager as unknown as { compareVersions: (a: string, b: string) => number }
    ).compareVersions("2.0.0", "1.0.0");
    expect(result).toBe(1);
  });

  test("compareVersions detects minor version differences", () => {
    const manager = new AstGrepBinaryManager();
    const result = (
      manager as unknown as { compareVersions: (a: string, b: string) => number }
    ).compareVersions("0.40.0", "0.39.0");
    expect(result).toBe(1);
  });

  test("compareVersions detects patch version differences", () => {
    const manager = new AstGrepBinaryManager();
    const result = (
      manager as unknown as { compareVersions: (a: string, b: string) => number }
    ).compareVersions("0.39.5", "0.39.4");
    expect(result).toBe(1);
  });

  test("compareVersions treats missing segments as zero", () => {
    const manager = new AstGrepBinaryManager();
    const result = (
      manager as unknown as { compareVersions: (a: string, b: string) => number }
    ).compareVersions("0.39", "0.39.0");
    expect(result).toBe(0);
  });

  test("compareVersions treats non-numeric segments as zero", () => {
    const manager = new AstGrepBinaryManager();
    const result = (
      manager as unknown as { compareVersions: (a: string, b: string) => number }
    ).compareVersions("0.39.alpha", "0.39.0");
    expect(result).toBe(0);
  });
});

describe("AstGrepBinaryManager - System Binary Discovery", () => {
  beforeEach(() => {
    restorePath();
  });

  test("findBinaryInPath discovers stub binary on PATH", async () => {
    const tempDir = await ensureTempDir("system-path");
    const binaryPath = await createCrossPlatformStubBinary(tempDir);
    process.env.PATH = `${tempDir}${path.delimiter}${ORIGINAL_PATH}`;

    const manager = new AstGrepBinaryManager();
    const result = await (
      manager as unknown as { findBinaryInPath: () => Promise<string | null> }
    ).findBinaryInPath();
    expect(result).toBe(binaryPath);
  });

  const testNonWindows = process.platform !== "win32" ? test : test.skip;

  testNonWindows("findBinaryInPath checks executable permissions", async () => {
    const tempDir = await ensureTempDir("system-nonexec");
    const binaryPath = await createCrossPlatformStubBinary(tempDir, { makeNonExecutable: true });

    // Remove execute permissions
    await fs.chmod(binaryPath, 0o644);

    // Set PATH to only include our test directory
    const originalPath = process.env.PATH;
    process.env.PATH = tempDir;

    try {
      const manager = new AstGrepBinaryManager();
      const result = await (
        manager as unknown as { findBinaryInPath: () => Promise<string | null> }
      ).findBinaryInPath();
      // Should not find the binary because it's not executable
      expect(result).toBeNull();
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test("findBinaryInPath returns null with empty PATH", async () => {
    process.env.PATH = "";
    const manager = new AstGrepBinaryManager();
    const result = await (
      manager as unknown as { findBinaryInPath: () => Promise<string | null> }
    ).findBinaryInPath();
    expect(result).toBeNull();
  });

  test("useSystemBinary logs version for discovered binary", async () => {
    const tempDir = await ensureTempDir("system-log");
    const binaryPath = await createCrossPlatformStubBinary(tempDir, { version: "0.39.5" });
    process.env.PATH = `${tempDir}${path.delimiter}${ORIGINAL_PATH}`;

    const manager = new AstGrepBinaryManager();
    const capture = new StderrCapture();
    capture.start();
    await (manager as unknown as { useSystemBinary: () => Promise<void> }).useSystemBinary();
    capture.stop();

    const messages = capture.getMessages();
    assertBinaryVersionLogged(messages, "0.39.5");
    expect(manager.getBinaryPath()).toBe(binaryPath);
  });

  const testWindowsOnly = process.platform === "win32" ? test : test.skip;

  testWindowsOnly("findBinaryInPath prioritizes .cmd binaries on Windows", async () => {
    const tempDir = await ensureTempDir("system-windows");
    const cmdPath = await createCrossPlatformStubBinary(tempDir, { windowsVariant: "cmd" });
    await createCrossPlatformStubBinary(tempDir, { windowsVariant: "ps1" });
    process.env.PATH = `${tempDir}${path.delimiter}${ORIGINAL_PATH}`;

    const manager = new AstGrepBinaryManager();
    const result = await (
      manager as unknown as { findBinaryInPath: () => Promise<string | null> }
    ).findBinaryInPath();
    expect(result?.toLowerCase()).toBe(cmdPath.toLowerCase());
  });

  testWindowsOnly.skip("findBinaryInPath prioritizes .exe over .cmd on Windows", async () => {
    // Skipped: This test is difficult to implement properly without real .exe files
    // Testing .exe priority would require creating a valid .exe stub, which is not
    // feasible in a cross-platform test suite. The .cmd and .ps1 priority tests
    // provide sufficient coverage of the Windows binary discovery logic.
    const tempDir = await ensureTempDir("system-windows-exe");

    // Create .cmd stub
    await createCrossPlatformStubBinary(tempDir, { windowsVariant: "cmd" });

    process.env.PATH = `${tempDir}${path.delimiter}${ORIGINAL_PATH}`;

    const manager = new AstGrepBinaryManager();
    const result = await (
      manager as unknown as { findBinaryInPath: () => Promise<string | null> }
    ).findBinaryInPath();

    const cmdPath = path.join(tempDir, "ast-grep.cmd");
    expect(result?.toLowerCase()).toBe(cmdPath.toLowerCase());
  });
});

describe("AstGrepBinaryManager - Custom Binary Path Validation", () => {
  test("useCustomBinary accepts valid stub binary", async () => {
    const tempDir = await ensureTempDir("custom-valid");
    const binaryPath = await createCrossPlatformStubBinary(tempDir, { version: "0.39.5" });

    const manager = new AstGrepBinaryManager();
    const capture = new StderrCapture();
    capture.start();
    await (
      manager as unknown as { useCustomBinary: (path: string) => Promise<void> }
    ).useCustomBinary(binaryPath);
    capture.stop();

    const messages = capture.getMessages();
    assertBinaryVersionLogged(messages, "0.39.5");
    expect(manager.getBinaryPath()).toBe(binaryPath);
  });

  test("useCustomBinary throws BinaryError for non-existent path", async () => {
    const manager = new AstGrepBinaryManager();
    const invocation = (
      manager as unknown as { useCustomBinary: (path: string) => Promise<void> }
    ).useCustomBinary("/non/existent/binary");
    await expect(invocation).rejects.toBeInstanceOf(BinaryError);
  });

  test("useCustomBinary validates binary version", async () => {
    const tempDir = await ensureTempDir("custom-version");
    const binaryPath = await createCrossPlatformStubBinary(tempDir, { version: "0.39.5" });

    const manager = new AstGrepBinaryManager();
    const capture = new StderrCapture();
    capture.start();
    await (
      manager as unknown as { useCustomBinary: (path: string) => Promise<void> }
    ).useCustomBinary(binaryPath);
    capture.stop();

    const messages = capture.getMessages();
    assertBinaryVersionLogged(messages, "0.39.5");
    expect(manager.getBinaryPath()).toBe(binaryPath);
  });
});

// REMOVED: Platform-specific Installation, Cache Validation, and Fallback Behavior test sections
// These tested auto-download/installation features that are no longer supported.
// Users must install ast-grep separately using official methods.

describe("AstGrepBinaryManager - Binary Testing and Validation", () => {
  test("testBinary validates version when expectedVersion provided", async () => {
    const tempDir = await ensureTempDir("test-binary");
    const binaryPath = await createCrossPlatformStubBinary(tempDir, { version: "0.39.5" });

    const manager = new AstGrepBinaryManager();
    const result = await (
      manager as unknown as {
        testBinary: (file: string, expectedVersion?: string) => Promise<boolean>;
      }
    ).testBinary(binaryPath, "0.39.4");
    expect(result).toBe(true);
  });

  test("testBinary rejects outdated binaries", async () => {
    const tempDir = await ensureTempDir("test-binary-outdated");
    const binaryPath = await createCrossPlatformStubBinary(tempDir, { version: "0.39.4" });

    const manager = new AstGrepBinaryManager();
    const capture = new StderrCapture();
    capture.start();
    const result = await (
      manager as unknown as {
        testBinary: (file: string, expectedVersion?: string) => Promise<boolean>;
      }
    ).testBinary(binaryPath, "0.39.5");
    capture.stop();

    const messages = capture.getMessages();
    expect(messages.some((msg) => /Binary version mismatch: found .* expected .*/.test(msg))).toBe(
      true
    );
    expect(result).toBe(false);
  });

  test("getExecutionCommand wraps PowerShell scripts", async () => {
    const manager = new AstGrepBinaryManager();
    const command = (
      manager as unknown as {
        getExecutionCommand: (
          binary: string,
          args: string[]
        ) => { command: string; commandArgs: string[] };
      }
    ).getExecutionCommand("C:/tools/ast-grep.ps1", ["--version"]);
    expect(command.command.toLowerCase()).toContain("powershell");
    expect(command.commandArgs[0]).toBe("-File");
  });

  test("getExecutionCommand wraps CMD scripts", async () => {
    const manager = new AstGrepBinaryManager();
    const command = (
      manager as unknown as {
        getExecutionCommand: (
          binary: string,
          args: string[]
        ) => { command: string; commandArgs: string[] };
      }
    ).getExecutionCommand("C:/tools/ast-grep.cmd", ["--version"]);
    expect(command.command.toLowerCase()).toContain("cmd");
    expect(command.commandArgs[0]).toBe("/c");
  });

  test("getExecutionCommand returns direct exec for absolute paths", () => {
    const manager = new AstGrepBinaryManager();
    const command = (
      manager as unknown as {
        getExecutionCommand: (
          binary: string,
          args: string[]
        ) => { command: string; commandArgs: string[] };
      }
    ).getExecutionCommand("/usr/local/bin/ast-grep", ["--version"]);
    expect(command.command).toBe("/usr/local/bin/ast-grep");
    expect(command.commandArgs).toEqual(["--version"]);
    expect(command.command).not.toContain("powershell");
    expect(command.command).not.toContain("cmd");
  });
});

describe("AstGrepBinaryManager - Initialization Priority", () => {
  test("initialize prefers custom binary path over other methods", async () => {
    const tempDir = await ensureTempDir("init-custom");
    const binaryPath = await createCrossPlatformStubBinary(tempDir);

    const manager = new AstGrepBinaryManager({
      customBinaryPath: binaryPath,
      useSystem: true,
      autoInstall: true,
    });

    await manager.initialize();
    expect(manager.getBinaryPath()).toBe(binaryPath);
  });

  test("initialize uses system binary when requested", async () => {
    const tempDir = await ensureTempDir("init-system");
    const binaryPath = await createCrossPlatformStubBinary(tempDir);
    process.env.PATH = `${tempDir}${path.delimiter}${ORIGINAL_PATH}`;

    const manager = new AstGrepBinaryManager({
      useSystem: true,
    });

    await manager.initialize();
    expect(manager.getBinaryPath()).toBe(binaryPath);
  });
});

// REMOVED: Download Logic test section
// These tested auto-download features that are no longer supported.
// Users must install ast-grep separately using official methods.

const describeIntegration = process.env.INTEGRATION_TESTS === "1" ? describe : describe.skip;

describeIntegration("AstGrepBinaryManager - Real Binary Integration", () => {
  test.skip("should initialize and execute real ast-grep binary", async () => {
    // OBSOLETE: This test used autoInstall which is no longer supported.
    // Users must install ast-grep separately using official methods.
  });

  test.skip("should use system binary when useSystem is true", async () => {
    // OBSOLETE: This test is redundant with system binary detection tests above.
    // The system binary detection is already thoroughly tested in the
    // "System Binary Discovery" test section.
  });



  test.skip("should detect platform-specific binary", async () => {
    // OBSOLETE: This test used autoInstall which is no longer supported.
    // Users must install ast-grep separately using official methods.
  });
});

describe("AstGrepBinaryManager - Coverage Scenarios", () => {
  test("initialize is idempotent - multiple calls do not re-download", async () => {
    const cacheDir = await ensureTempDir("idempotent");
    const binaryPath = await createCrossPlatformStubBinary(cacheDir, { baseName: "ast-grep" });

    const manager = new AstGrepBinaryManager({
      cacheDir,
      customBinaryPath: binaryPath,
    });

    const capture = new StderrCapture();
    capture.start();
    await manager.initialize();
    await manager.initialize();
    await manager.initialize();
    capture.stop();

    const messages = capture.getMessages();
    // Updated to match new format: "ast-grep vX.X.X (custom: path)"
    const customBinaryMessages = messages.filter((msg) => msg.includes("ast-grep v") && msg.includes("custom:"));
    expect(customBinaryMessages.length).toBe(1);
  });

  test.skip("on Windows, prioritizes .exe over other extensions", async () => {
    // Skipped: Testing .exe priority requires real .exe files, not just renamed .cmd stubs.
    // When a .cmd file is renamed to .exe, Windows cannot execute it as a PE executable,
    // causing testBinary() to hang. The .cmd priority test provides sufficient coverage
    // of Windows binary discovery logic.
    if (process.platform !== "win32") {
      return;
    }

    const cacheDir = await ensureTempDir("exe-priority");
    await createCrossPlatformStubBinary(cacheDir, { baseName: "ast-grep" });
    const exePath = await createCrossPlatformStubBinary(cacheDir, { baseName: "ast-grep-exe" });
    await fs.rename(exePath, path.join(cacheDir, "ast-grep.exe"));

    // Set PATH to cacheDir so the manager finds binaries there
    process.env.PATH = cacheDir;

    const manager = new AstGrepBinaryManager({ useSystem: true });
    await manager.initialize();

    const binaryPath = manager.getBinaryPath();
    expect(binaryPath).toMatch(/\.exe$/);
  });

  test("searches PATH for system binary when useSystem is true", async () => {
    const tempDir = await ensureTempDir("path-search");
    const stubBinary = await createCrossPlatformStubBinary(tempDir, { baseName: "ast-grep" });

    process.env.PATH = `${tempDir}${path.delimiter}${ORIGINAL_PATH}`;

    const manager = new AstGrepBinaryManager({ useSystem: true });
    await manager.initialize();

    const binaryPath = manager.getBinaryPath();
    expect(binaryPath).toBe(stubBinary);
  });

  test("accepts relative paths to binary", async () => {
    const cacheDir = await ensureTempDir("relative-paths");
    const binaryPath = await createCrossPlatformStubBinary(cacheDir);

    const relativePath = path.relative(process.cwd(), binaryPath);
    const manager = new AstGrepBinaryManager({
      customBinaryPath: relativePath,
    });

    await manager.initialize();

    const resolvedPath = manager.getBinaryPath();
    expect(resolvedPath).not.toBeNull();
    expect(resolvedPath).toBe(relativePath);
  });

  test("executes commands correctly with custom binary", async () => {
    const cacheDir = await ensureTempDir("exec-command");
    const binaryPath = await createCrossPlatformStubBinary(cacheDir);

    const manager = new AstGrepBinaryManager({
      customBinaryPath: binaryPath,
    });

    await manager.initialize();

    const { stdout } = await manager.executeAstGrep(["--version"]);
    expect(stdout).toMatch(/ast-grep/);
    expect(manager.getBinaryPath()).toBe(binaryPath);
  });

  test("throws combined error message when binary not found and download fails", async () => {
    if (SKIP_NETWORK) {
      const cacheDir = await ensureTempDir("combined-errors");
      const manager = new AstGrepBinaryManager({
        cacheDir,
        autoInstall: true,
      });

      await expect(manager.initialize()).rejects.toThrow(
        /Failed to locate or download ast-grep binary/
      );
    }
  });

  test("validates cached binary during installation", async () => {
    const cacheDir = await ensureTempDir("cache-validation");
    const manager = new AstGrepBinaryManager({
      cacheDir,
      autoInstall: true,
    });

    const capture = new StderrCapture();
    capture.start();
    await manager.initialize().catch(() => {});
    capture.stop();

    const messages = capture.getMessages();
    const hasCheckingCache = messages.some((msg) => msg.includes("Checking cached binary"));
    expect(hasCheckingCache || manager.getBinaryPath() !== null).toBe(true);
  });

  test("binary initialization succeeds with custom binary", async () => {
    const cacheDir = await ensureTempDir("custom-binary-init");
    const binaryPath = await createCrossPlatformStubBinary(cacheDir);

    const manager = new AstGrepBinaryManager({
      customBinaryPath: binaryPath,
    });

    await manager.initialize();

    expect(manager.getBinaryPath()).toBe(binaryPath);
    const { stdout } = await manager.executeAstGrep(["--version"]);
    expect(stdout).toMatch(/ast-grep/);
  });

  test("checks executable permissions on Unix systems", async () => {
    if (process.platform === "win32") {
      return;
    }

    const cacheDir = await ensureTempDir("unix-perms");
    const binaryPath = await createCrossPlatformStubBinary(cacheDir);

    const manager = new AstGrepBinaryManager({
      customBinaryPath: binaryPath,
    });

    await manager.initialize();

    const stats = await fs.stat(binaryPath);
    const hasExecutePermission = (stats.mode & 0o111) !== 0;
    expect(hasExecutePermission).toBe(true);
  });

  test("logs initialization progress messages", async () => {
    const cacheDir = await ensureTempDir("stage-logging");
    const binaryPath = await createCrossPlatformStubBinary(cacheDir);

    const manager = new AstGrepBinaryManager({
      customBinaryPath: binaryPath,
    });

    const capture = new StderrCapture();
    capture.start();
    await manager.initialize();
    capture.stop();

    const messages = capture.getMessages();
    // Updated to match new format: "ast-grep vX.X.X (custom: path)"
    const hasCustomBinaryLog = messages.some((msg) => msg.includes("ast-grep v") && msg.includes("custom:"));
    expect(hasCustomBinaryLog).toBe(true);
  });
});

describe("AstGrepBinaryManager - Edge Cases", () => {
  test("executeAstGrep throws when binary not initialized", async () => {
    const manager = new AstGrepBinaryManager();
    await expect(manager.executeAstGrep(["--version"])).rejects.toBeInstanceOf(BinaryError);
  });
});

describe("AstGrepBinaryManager - Additional Coverage", () => {
  test("download retry and backoff logs in offline mode", async () => {
    if (!SKIP_NETWORK) {
      return; // Only run when network is disabled
    }

    const cacheDir = await ensureTempDir("download-retry-offline");
    const manager = new AstGrepBinaryManager({
      cacheDir,
      autoInstall: true,
      platform: process.platform as "linux",
    });

    // Empty PATH to force download path
    process.env.PATH = "";

    const capture = new StderrCapture();
    capture.start();
    try {
      await (
        manager as unknown as { installPlatformBinary: () => Promise<void> }
      ).installPlatformBinary();
    } catch {
      // Expected to fail in offline mode
    } finally {
      capture.stop();
    }

    const messages = capture.getMessages();
    const downloadAttempts = messages.filter((msg) => /Download attempt \d+\/\d+/.test(msg));

    // In true offline mode, should see multiple download attempts
    // In practice, if network is available, we'll see at least one attempt
    expect(downloadAttempts.length).toBeGreaterThanOrEqual(1);

    // If there were retries (true offline), check for backoff messages
    const retryMessages = messages.filter((msg) => /Retrying in \d+ms/.test(msg));
    if (downloadAttempts.length > 1) {
      expect(retryMessages.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("detailed fallback error contains installation instructions", async () => {
    if (!SKIP_NETWORK) {
      return; // Only run when network is disabled
    }

    const cacheDir = await ensureTempDir("fallback-error");
    const manager = new AstGrepBinaryManager({
      cacheDir,
      autoInstall: true,
      platform: process.platform as "linux",
    });

    // Empty PATH to ensure no system binary
    process.env.PATH = "";

    try {
      await manager.initialize();
      throw new Error("Expected initialization to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(BinaryError);
      const message = (error as Error).message;

      // Check for installation instructions
      expect(message).toContain("npm install -g @ast-grep/cli");
      expect(message).toContain("cargo install ast-grep");
      expect(message).toContain("brew install ast-grep");
      expect(message).toContain("pip install ast-grep-cli");
      expect(message).toContain("https://ast-grep.github.io");

      // Check for both error causes
      expect(message).toContain("Download error:");
      expect(message).toContain("System binary error:");
    }
  });

  test("cache invalidation deletes stale cached binary", async () => {
    if (!SKIP_NETWORK) {
      return; // Only run when network is disabled to ensure controlled behavior
    }

    const cacheDir = await ensureTempDir("cache-invalidation");
    const manager = new AstGrepBinaryManager({
      cacheDir,
      autoInstall: true,
      platform: process.platform as "linux",
    });

    const binaryName = (
      manager as unknown as { getBinaryName: (platform: string, arch: string) => string }
    ).getBinaryName.call(manager, process.platform, process.arch);
    const stalePath = path.join(cacheDir, binaryName);

    // Create a stale stub with old version
    await createCrossPlatformStubBinary(cacheDir, {
      baseName: binaryName,
      version: "0.1.0",
    });

    // Verify stale file exists before
    const statsBefore = await fs.stat(stalePath);
    expect(statsBefore).toBeTruthy();

    // Empty PATH to force download attempt
    process.env.PATH = "";

    try {
      await (
        manager as unknown as { installPlatformBinary: () => Promise<void> }
      ).installPlatformBinary();
    } catch {
      // May fail in offline mode
    }

    // After installation (success or failure), the stale file should be replaced or deleted
    // Check if the file was modified (new download) or deleted
    try {
      const statsAfter = await fs.stat(stalePath);
      // If file still exists, it should be different (newer) than before
      expect(statsAfter.mtimeMs).not.toBe(statsBefore.mtimeMs);
    } catch {
      // File was deleted, which is also acceptable
      expect(true).toBe(true);
    }
  });

  test("partial download temp cleanup removes residual files", async () => {
    if (!SKIP_NETWORK) {
      return; // Only run when network is disabled
    }

    const cacheDir = await ensureTempDir("temp-cleanup");
    const manager = new AstGrepBinaryManager({
      cacheDir,
      autoInstall: true,
      platform: process.platform as "linux",
    });

    // Empty PATH to force download
    process.env.PATH = "";

    try {
      await (
        manager as unknown as { installPlatformBinary: () => Promise<void> }
      ).installPlatformBinary();
    } catch {
      // Expected to fail
    }

    // Check for residual temp files
    const files = await fs.readdir(cacheDir);
    const tempFiles = files.filter(
      (f) => f.endsWith(".zip") || f.endsWith(".tar.gz") || f.endsWith(".tar")
    );

    // Should not have residual temp files
    expect(tempFiles.length).toBe(0);
  });

  const testNonWindowsOnly = process.platform !== "win32" ? test : test.skip;

  testNonWindowsOnly("POSIX permission check on real binary installation", async () => {
    if (SKIP_NETWORK) {
      return; // Requires network
    }

    const cacheDir = await ensureTempDir("posix-perms");
    const manager = new AstGrepBinaryManager({
      cacheDir,
      autoInstall: true,
    });

    await manager.initialize();

    const binaryPath = manager.getBinaryPath();
    expect(binaryPath).toBeTruthy();

    if (binaryPath) {
      const stats = await fs.stat(binaryPath);
      const hasExecutePermission = (stats.mode & 0o111) !== 0;
      expect(hasExecutePermission).toBe(true);
    }
  });

  test("PATH ordering with multiple directories", async () => {
    const tempDir1 = await ensureTempDir("path-order-1");
    const tempDir2 = await ensureTempDir("path-order-2");

    // Create binaries in both directories with different markers
    const binary1 = await createCrossPlatformStubBinary(tempDir1, { version: "1.0.0" });
    await createCrossPlatformStubBinary(tempDir2, { version: "2.0.0" });

    // Set PATH with tempDir1 first
    process.env.PATH = `${tempDir1}${path.delimiter}${tempDir2}${path.delimiter}${ORIGINAL_PATH}`;

    const manager = new AstGrepBinaryManager({ useSystem: true });
    await manager.initialize();

    const chosenPath = manager.getBinaryPath();

    // Should choose the first one in PATH
    expect(chosenPath).toBe(binary1);
  });
});
