// Manual test to verify verbose mode functionality
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testVerboseMode() {
  console.log("Testing verbose mode functionality...\n");

  const testDir = path.resolve(__dirname);
  const srcDir = path.join(testDir, "src");
  const serverPath = path.join(__dirname, "..", "build", "index.js");

  // Helper to send MCP request and get response
  async function runMCPRequest(request) {
    const server = spawn("node", [serverPath, "--use-system"], {
      stdio: ["pipe", "pipe", "inherit"],
      cwd: testDir,
    });

    server.stdin.write(JSON.stringify(request) + "\n");

    let output = "";
    server.stdout.on("data", (data) => {
      output += data.toString();
    });

    return new Promise((resolve) => {
      let outputBuffer = "";
      server.stdout.on("data", (data) => {
        outputBuffer += data.toString();
      });

      server.on("close", () => {
        console.error("Raw output from server:");
        console.error(outputBuffer);

        // Try to extract the result
        try {
          const lines = outputBuffer.split("\n");
          console.error("All lines:");
          lines.forEach((line, i) => console.error(`${i}: ${line}`));

          const resultLine = lines.find(
            (line) => line.includes('"result"') && !line.includes('"protocolVersion"')
          );
          console.error("Found result line:", resultLine);

          if (resultLine) {
            const response = JSON.parse(resultLine);
            return resolve(response);
          }
        } catch (e) {
          console.error("Failed to parse response:", e);
          console.error("Raw output:", outputBuffer);
        }
        resolve(null);
      });
      // Force close after 3 seconds
      setTimeout(() => server.kill(), 3000);
    });
  }

  // Test 1: Search with verbose=true
  console.log("1. Testing SearchTool with verbose=true");
  const verboseResult = await runMCPRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "ast_search",
      arguments: {
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        language: "javascript",
        paths: [srcDir],
        verbose: true,
      },
    },
  });

  if (verboseResult) {
    try {
      const data = JSON.parse(verboseResult.result.content[0].text);
      console.log(`   - Total matches: ${data.summary.totalMatches}`);
      console.log(`   - Matches array length: ${data.matches.length}`);
      console.log(`   - Has detailed data: ${data.matches.length > 0 ? "Yes" : "No"}`);
    } catch (e) {
      console.error("Failed to parse verbose result:", e);
    }
  }

  // Test 2: Search with verbose=false
  console.log("\n2. Testing SearchTool with verbose=false");
  const nonVerboseResult = await runMCPRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "ast_search",
      arguments: {
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        language: "javascript",
        paths: [srcDir],
        verbose: false,
      },
    },
  });

  if (nonVerboseResult) {
    try {
      const data = JSON.parse(nonVerboseResult.result.content[0].text);
      console.log(`   - Total matches: ${data.summary.totalMatches}`);
      console.log(`   - Matches array length: ${data.matches.length}`);
      console.log(`   - Has detailed data: ${data.matches.length > 0 ? "Yes" : "No"}`);
    } catch (e) {
      console.error("Failed to parse non-verbose result:", e);
    }
  }

  console.log("\n=== Summary ===");
  if (verboseResult && nonVerboseResult) {
    try {
      const verboseData = JSON.parse(verboseResult.result.content[0].text);
      const nonVerboseData = JSON.parse(nonVerboseResult.result.content[0].text);

      const working =
        verboseData.matches.length > 0 &&
        nonVerboseData.matches.length === 0 &&
        verboseData.summary.totalMatches === nonVerboseData.summary.totalMatches;

      console.log(
        working ? "✅ Verbose mode working correctly!" : "❌ Verbose mode not working as expected"
      );
    } catch (e) {
      console.error("Failed to verify:", e);
    }
  } else {
    console.log("❌ Tests failed - could not get results");
  }
}

testVerboseMode().catch(console.error);
