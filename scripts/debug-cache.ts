import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { AstGrepBinaryManager } from "../src/core/binary-manager.js";
import { StderrCapture, countRetryAttempts } from "../tests/helpers/stderr-capture.ts";
import { inflateRawSync } from "zlib";

async function createWindowsStubBinary(directory: string, baseName: string, version: string) {
  const scriptPath = path.join(directory, `${baseName}.mjs`);
  const scriptContent = `#!/usr/bin/env node
const defaultVersion = "${version}";
const mode = process.env.AST_GREP_STUB_MODE ?? "normal";
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
    // no-op
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

  console.log("ast-grep stub executed");
  process.exit(0);
})();`;

  await fs.writeFile(scriptPath, scriptContent, "utf8");
  const cmdPath = path.join(directory, `${baseName}.cmd`);
  const cmdScript = `@echo off\r\nnode "%~dp0${baseName}.mjs" %*\r\n`;
  await fs.writeFile(cmdPath, cmdScript, "utf8");
  return cmdPath;
}

async function listZipEntries(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    console.error("Failed to fetch zip:", response.status);
    return;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await manualExtract(buffer);
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocdOffset = buffer.lastIndexOf(eocdSignature);
  if (eocdOffset === -1) {
    console.error("EOCD not found");
    return;
  }
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;
  console.log(`Zip entries (${totalEntries}):`);
  for (let index = 0; index < totalEntries; index++) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x02014b50) {
      console.error("Invalid central directory signature");
      break;
    }
    const generalPurpose = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const rawName = buffer.subarray(fileNameStart, fileNameEnd).toString("utf8");
    console.log(
      ` - ${rawName} (flag=${generalPurpose}, method=${compressionMethod}, compressed=${compressedSize}, uncompressed=${uncompressedSize})`
    );
    offset = fileNameEnd + extraFieldLength + commentLength;
  }
}

async function manualExtract(buffer: Buffer): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "manual-extract-"));
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocdOffset = buffer.lastIndexOf(eocdSignature);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index++) {
    const signature = buffer.readUInt32LE(offset);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const rawName = buffer.subarray(fileNameStart, fileNameEnd).toString("utf8");
    const normalizedName = rawName.replace(/\\/g, "/");
    offset = fileNameEnd + extraFieldLength + commentLength;
    if (!normalizedName || normalizedName.endsWith("/")) {
      await fs.mkdir(path.join(tempDir, normalizedName), { recursive: true });
      continue;
    }
    const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
    let fileBuffer: Buffer;
    if (compressionMethod === 0) {
      fileBuffer = Buffer.from(compressedData);
    } else {
      fileBuffer = inflateRawSync(compressedData);
    }
    const outputPath = path.join(tempDir, normalizedName);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, fileBuffer);
  }
  console.log("Manual extract contents:");
  const files = await fs.readdir(tempDir);
  console.log(files);
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "debug-cache-"));
  const manager = new AstGrepBinaryManager({
    cacheDir: tempDir,
    autoInstall: true,
    platform: process.platform as "win32",
  });

  const binaryName = (manager as unknown as {
    getBinaryName(platform: string, arch: string): string;
  }).getBinaryName.call(manager, process.platform, process.arch);

  await createWindowsStubBinary(tempDir, binaryName.replace(/\.exe$/, ""), "0.39.4");

  const capture = new StderrCapture();
  capture.start();
  try {
    await (manager as unknown as { installPlatformBinary(): Promise<void> }).installPlatformBinary();
  } catch (error) {
    console.error("INSTALL FAILED", error);
  } finally {
    capture.stop();
  }

  console.log("Captured messages:");
  for (const message of capture.getMessages()) {
    console.log(message);
  }
  console.log("Retry count:", countRetryAttempts(capture.getMessages()));

  await listZipEntries(
    "https://github.com/ast-grep/ast-grep/releases/download/0.39.7/app-x86_64-pc-windows-msvc.zip"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
