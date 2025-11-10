// Simple test to verify verbose mode works correctly
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSimpleTest() {
  console.log("=== Simple Verbose Mode Test ===");

  const serverPath = path.join(__dirname, "..", "build", "index.js");
  const testDir = path.join(__dirname, "src");

  // Helper to execute a command and capture output
  async function executeCommand(args) {
    return new Promise((resolve) => {
      const process = spawn("node", [serverPath, "--use-system", ...args], {
        stdio: ["pipe", "pipe", "pipe"], // Capture stderr as well
        cwd: __dirname,
      });

      let output = "";
      let stderrOutput = "";
      process.stdout.on("data", (data) => {
        output += data.toString();
      });
      process.stderr.on("data", (data) => {
        stderrOutput += data.toString();
      });

      process.on("close", () => {
        resolve(output);
      });

      // Force close after 5 seconds
      setTimeout(() => process.kill(), 5000);
    });
  }

  // Create a simple MCP request
  const createRequest = (verbose) =>
    JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "ast_search",
        arguments: {
          pattern: "function $NAME($$$PARAMS) { $$$BODY }",
          language: "javascript",
          paths: [testDir],
          verbose,
        },
      },
    }) + "\n";

  try {
    // Test with verbose=true
    console.log("\n1. Testing with verbose=true:");
    const verboseInput = createRequest(true);
    const verboseOutput = await executeCommand(["--stdio"]);

    // Write verbose request to stdin
    const verboseProcess = spawn("node", [serverPath, "--use-system"], {
      stdio: ["pipe", "pipe", "pipe"], // Capture stderr as well
      cwd: __dirname,
    });

    let verboseStderr = "";
    verboseProcess.stdin.write(verboseInput);
    let verboseResult = "";
    verboseProcess.stdout.on("data", (data) => {
      verboseResult += data.toString();
    });
    verboseProcess.stderr.on("data", (data) => {
      verboseStderr += data.toString();
    });

    await new Promise((resolve) => {
      verboseProcess.on("close", resolve);
      setTimeout(() => verboseProcess.kill(), 3000);
    });

    // Test with verbose=false
    console.log("\n2. Testing with verbose=false:");
    const nonVerboseInput = createRequest(false);
    // Write non-verbose request to stdin
    const nonVerboseProcess = spawn("node", [serverPath, "--use-system"], {
      stdio: ["pipe", "pipe", "pipe"], // Capture stderr as well
      cwd: __dirname,
    });

    let nonVerboseStderr = "";
    nonVerboseProcess.stdin.write(nonVerboseInput);
    let nonVerboseResult = "";
    nonVerboseProcess.stdout.on("data", (data) => {
      nonVerboseResult += data.toString();
    });
    nonVerboseProcess.stderr.on("data", (data) => {
      nonVerboseStderr += data.toString();
    });

    await new Promise((resolve) => {
      nonVerboseProcess.on("close", resolve);
      setTimeout(() => nonVerboseProcess.kill(), 3000);
    });

    // Parse results
    const verboseLines = verboseResult.split("\n");
    const nonVerboseLines = nonVerboseResult.split("\n");

    const verboseResultLine = verboseLines.find(
      (line) => line.includes('"result"') && !line.includes('"protocolVersion"')
    );

    const nonVerboseResultLine = nonVerboseLines.find(
      (line) => line.includes('"result"') && !line.includes('"protocolVersion"')
    );

    if (verboseResultLine && nonVerboseResultLine) {
      const verboseData = JSON.parse(verboseResultLine);
      const nonVerboseData = JSON.parse(nonVerboseResultLine);

      const verboseSearch = JSON.parse(verboseData.result.content[0].text);
      const nonVerboseSearch = JSON.parse(nonVerboseData.result.content[0].text);

      console.log("\n=== Results ===");
      console.log("Verbose mode:");
      console.log(`  - Total matches: ${verboseSearch.summary.totalMatches}`);
      console.log(`  - Matches array length: ${verboseSearch.matches.length}`);
      console.log(`  - Has detailed data: ${verboseSearch.matches.length > 0 ? "Yes" : "No"}`);

      console.log("\nNon-verbose mode:");
      console.log(`  - Total matches: ${nonVerboseSearch.summary.totalMatches}`);
      console.log(`  - Matches array length: ${nonVerboseSearch.matches.length}`);
      console.log(`  - Has detailed data: ${nonVerboseSearch.matches.length > 0 ? "Yes" : "No"}`);

      // Verify behavior
      const isWorking =
        verboseSearch.matches.length > 0 &&
        nonVerboseSearch.matches.length === 0 &&
        verboseSearch.summary.totalMatches === nonVerboseSearch.summary.totalMatches;

      console.log(
        `\n${isWorking ? "✅ Verbose mode is working correctly!" : "❌ Verbose mode is not working as expected"}`
      );
    } else {
      console.log("❌ Failed to parse results from MCP server");
      console.log("Verbose result lines:", verboseLines.length > 0 ? "Available" : "None");
      console.log("Non-verbose result lines:", nonVerboseLines.length > 0 ? "Available" : "None");
      console.log("Verbose stderr:", verboseStderr);
      console.log("Non-verbose stderr:", nonVerboseStderr);
    }
  } catch (error) {
    console.error("Test failed with error:", error);
  }
}

runSimpleTest();
