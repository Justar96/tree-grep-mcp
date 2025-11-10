// Direct test to verify verbose mode functionality
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createWriteStream } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testVerboseMode() {
  console.log("=== Direct Verbose Mode Test ===\n");

  const serverPath = path.join(__dirname, "..", "..", "build", "index.js");
  const testDir = path.join(__dirname, "..", "test-verbose");
  const srcDir = path.join(testDir, "src");

  // Create a proper MCP client
  function createMCPClient() {
    return new Promise((resolve, reject) => {
      const client = spawn("node", [serverPath, "--use-system"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      client.stdout.on("data", (data) => {
        output += data.toString();

        // Process each line separately
        const lines = data.toString().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              if (message.method === "tools/list") {
                client.emit("tools_list", message.params);
              } else if (message.method === "notification/initialized") {
                // Send ready notification
                client.stdin.write(
                  JSON.stringify({
                    jsonrpc: "2.0",
                    method: "notify",
                    params: {},
                  }) + "\n"
                );
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        }
      });

      client.stderr.on("data", (data) => {
        console.error("STDERR:", data.toString());
      });

      client.on("close", () => {
        resolve({ client, output });
      });

      // Send initialization
      client.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        }) + "\n"
      );

      // Send tools/list request
      client.stdin.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }) + "\n"
      );

      // Timeout after 5 seconds
      setTimeout(() => {
        resolve({ client, output });
      }, 5000);
    });
  }

  // Helper to send a tool call
  async function callTool(client, toolName, args, id) {
    const request = {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    };

    client.stdin.write(JSON.stringify(request) + "\n");

    // Wait for response
    return new Promise((resolve) => {
      let buffer = "";
      const responseHandler = (data) => {
        buffer += data.toString();

        try {
          const lines = buffer.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              const message = JSON.parse(line);
              if (message.id === id) {
                client.stdout.off("data", responseHandler);
                resolve(message);
                return;
              }
            }
          }
        } catch (e) {
          // Ignore parsing errors
        }
      };

      client.stdout.on("data", responseHandler);

      // Timeout after 3 seconds
      setTimeout(() => {
        client.stdout.off("data", responseHandler);
        resolve(null);
      }, 3000);
    });
  }

  try {
    // Create MCP client
    const { client } = await createMCPClient();
    console.log("MCP client connected");

    // Wait a moment for initialization
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Test 1: Search with verbose=true
    console.log("\n1. Testing SearchTool with verbose=true");
    const verboseResponse = await callTool(
      client,
      "ast_search",
      {
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        language: "javascript",
        paths: [srcDir],
        verbose: true,
      },
      10
    );

    if (verboseResponse) {
      console.log("Verbose response:", JSON.stringify(verboseResponse, null, 2));
      const verboseResult = JSON.parse(verboseResponse.result.content[0].text);
      console.log(`  - Total matches: ${verboseResult.summary.totalMatches}`);
      console.log(`  - Matches array length: ${verboseResult.matches.length}`);
      console.log(`  - Has detailed data: ${verboseResult.matches.length > 0 ? "Yes" : "No"}`);
    } else {
      console.log("  - Failed to get response");
    }

    // Test 2: Search with verbose=false
    console.log("\n2. Testing SearchTool with verbose=false");
    const nonVerboseResponse = await callTool(
      client,
      "ast_search",
      {
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        language: "javascript",
        paths: [srcDir],
        verbose: false,
      },
      11
    );

    if (nonVerboseResponse) {
      console.log("Non-verbose response:", JSON.stringify(nonVerboseResponse, null, 2));
      const nonVerboseResult = JSON.parse(nonVerboseResponse.result.content[0].text);
      console.log(`  - Total matches: ${nonVerboseResult.summary.totalMatches}`);
      console.log(`  - Matches array length: ${nonVerboseResult.matches.length}`);
      console.log(`  - Has detailed data: ${nonVerboseResult.matches.length > 0 ? "Yes" : "No"}`);
    } else {
      console.log("  - Failed to get response");
    }

    // Test 3: Replace with verbose=true
    console.log("\n3. Testing ReplaceTool with verbose=true");
    const replaceVerboseResponse = await callTool(
      client,
      "ast_replace",
      {
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        replacement: "const $NAME = ($$$PARAMS) => { $$$BODY }",
        language: "javascript",
        paths: [srcDir],
        dryRun: true,
        verbose: true,
      },
      12
    );

    if (replaceVerboseResponse) {
      const replaceVerboseResult = JSON.parse(replaceVerboseResponse.result.content[0].text);
      console.log(`  - Total changes: ${replaceVerboseResult.summary.totalChanges}`);
      console.log(`  - Changes array length: ${replaceVerboseResult.changes.length}`);
      console.log(
        `  - Has detailed data: ${replaceVerboseResult.changes.length > 0 ? "Yes" : "No"}`
      );
    } else {
      console.log("  - Failed to get response");
    }

    // Test 4: Replace with verbose=false
    console.log("\n4. Testing ReplaceTool with verbose=false");
    const replaceNonVerboseResponse = await callTool(
      client,
      "ast_replace",
      {
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        replacement: "const $NAME = ($$$PARAMS) => { $$$BODY }",
        language: "javascript",
        paths: [srcDir],
        dryRun: true,
        verbose: false,
      },
      13
    );

    if (replaceNonVerboseResponse) {
      const replaceNonVerboseResult = JSON.parse(replaceNonVerboseResponse.result.content[0].text);
      console.log(`  - Total changes: ${replaceNonVerboseResult.summary.totalChanges}`);
      console.log(`  - Changes array length: ${replaceNonVerboseResult.changes.length}`);
      console.log(
        `  - Has detailed data: ${replaceNonVerboseResult.changes.length > 0 ? "Yes" : "No"}`
      );
    } else {
      console.log("  - Failed to get response");
    }

    // Test 5: Scan with verbose=true
    console.log("\n5. Testing ScanTool with verbose=true");
    const scanVerboseResponse = await callTool(
      client,
      "ast_run_rule",
      {
        id: "test-function-scan",
        language: "javascript",
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        paths: [srcDir],
        verbose: true,
      },
      14
    );

    if (scanVerboseResponse) {
      const scanVerboseResult = JSON.parse(scanVerboseResponse.result.content[0].text);
      console.log(`  - Total findings: ${scanVerboseResult.scan.summary.totalFindings}`);
      console.log(`  - Findings array length: ${scanVerboseResult.scan.findings.length}`);
      console.log(
        `  - Has detailed data: ${scanVerboseResult.scan.findings.length > 0 ? "Yes" : "No"}`
      );
    } else {
      console.log("  - Failed to get response");
    }

    // Test 6: Scan with verbose=false
    console.log("\n6. Testing ScanTool with verbose=false");
    const scanNonVerboseResponse = await callTool(
      client,
      "ast_run_rule",
      {
        id: "test-function-scan",
        language: "javascript",
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        paths: [srcDir],
        verbose: false,
      },
      15
    );

    if (scanNonVerboseResponse) {
      const scanNonVerboseResult = JSON.parse(scanNonVerboseResponse.result.content[0].text);
      console.log(`  - Total findings: ${scanNonVerboseResult.scan.summary.totalFindings}`);
      console.log(`  - Findings array length: ${scanNonVerboseResult.scan.findings.length}`);
      console.log(
        `  - Has detailed data: ${scanNonVerboseResult.scan.findings.length > 0 ? "Yes" : "No"}`
      );
    } else {
      console.log("  - Failed to get response");
    }

    // Test 7: Explain with verbose=true
    console.log("\n7. Testing ExplainTool with verbose=true");
    const explainVerboseResponse = await callTool(
      client,
      "ast_explain_pattern",
      {
        pattern: "console.log($ARG)",
        code: 'console.log("Hello, world!");',
        language: "javascript",
        verbose: true,
      },
      16
    );

    if (explainVerboseResponse) {
      const explainVerboseResult = JSON.parse(explainVerboseResponse.result.content[0].text);
      console.log(`  - Pattern matched: ${explainVerboseResult.matched}`);
      console.log(
        `  - Metavariables count: ${Object.keys(explainVerboseResult.metavariables).length}`
      );
      console.log(
        `  - Has detailed data: ${Object.keys(explainVerboseResult.metavariables).length > 0 ? "Yes" : "No"}`
      );
    } else {
      console.log("  - Failed to get response");
    }

    // Test 8: Explain with verbose=false
    console.log("\n8. Testing ExplainTool with verbose=false");
    const explainNonVerboseResponse = await callTool(
      client,
      "ast_explain_pattern",
      {
        pattern: "console.log($ARG)",
        code: 'console.log("Hello, world!");',
        language: "javascript",
        verbose: false,
      },
      17
    );

    if (explainNonVerboseResponse) {
      const explainNonVerboseResult = JSON.parse(explainNonVerboseResponse.result.content[0].text);
      console.log(`  - Pattern matched: ${explainNonVerboseResult.matched}`);
      console.log(
        `  - Metavariables count: ${Object.keys(explainNonVerboseResult.metavariables).length}`
      );
      console.log(
        `  - Has detailed data: ${Object.keys(explainNonVerboseResult.metavariables).length > 0 ? "Yes" : "No"}`
      );
    } else {
      console.log("  - Failed to get response");
    }

    // Clean up
    client.kill();
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testVerboseMode();
