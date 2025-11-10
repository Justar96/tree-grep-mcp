import { spawn } from "child_process";

// Simple test to verify verbose mode works through MCP protocol
async function testVerboseMode() {
  console.log("Testing verbose mode through MCP...");

  // Start the MCP server process
  const server = spawn("node", ["../../build/index.js", "--use-system"], {
    stdio: ["pipe", "pipe", "inherit"], // Inherit stderr to see debug logs
  });

  let responseBuffer = "";
  server.stdout.on("data", (data) => {
    responseBuffer += data.toString();
  });

  // Function to send a request
  function sendRequest(request) {
    const requestStr =
      JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        ...request,
      }) + "\n";

    console.log("Sending request:", requestStr);
    server.stdin.write(requestStr);
  }

  // Initialize connection
  sendRequest({
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  });

  // Wait for server to initialize
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Test 1: Search with verbose=true
  console.log("\n=== Test 1: Search with verbose=true ===");
  sendRequest({
    method: "tools/call",
    params: {
      name: "ast_search",
      arguments: {
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        language: "javascript",
        paths: ["../src"],
        verbose: true,
      },
    },
  });

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Test 2: Search with verbose=false
  console.log("\n=== Test 2: Search with verbose=false ===");
  sendRequest({
    method: "tools/call",
    params: {
      name: "ast_search",
      arguments: {
        pattern: "function $NAME($$$PARAMS) { $$$BODY }",
        language: "javascript",
        paths: ["../src"],
        verbose: false,
      },
    },
  });

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Parse and analyze responses
  const responses = responseBuffer
    .split("\n")
    .filter((line) => line.trim())
    .filter((line) => line.includes('"result"'))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.error("Failed to parse response:", line);
        return null;
      }
    })
    .filter((r) => r !== null)
    .filter((r) => r.result?.content?.[0]?.text);

  console.log("\n=== Analysis ===");
  console.log(`Found ${responses.length} response(s)`);

  // Analyze first response (verbose=true)
  if (responses.length >= 1) {
    try {
      const verboseResult = JSON.parse(responses[0].result.content[0].text);
      console.log("Verbose mode result:");
      console.log(`- Total matches: ${verboseResult.summary.totalMatches}`);
      console.log(`- Matches array length: ${verboseResult.matches.length}`);
      console.log(`- Has detailed match data: ${verboseResult.matches.length > 0}`);
    } catch (e) {
      console.error("Failed to parse verbose result:", e);
      console.log("Raw response:", responses[0]);
    }
  }

  // Analyze second response (verbose=false)
  if (responses.length >= 2) {
    try {
      const nonVerboseResult = JSON.parse(responses[1].result.content[0].text);
      console.log("\nNon-verbose mode result:");
      console.log(`- Total matches: ${nonVerboseResult.summary.totalMatches}`);
      console.log(`- Matches array length: ${nonVerboseResult.matches.length}`);
      console.log(`- Has detailed match data: ${nonVerboseResult.matches.length > 0}`);
    } catch (e) {
      console.error("Failed to parse non-verbose result:", e);
      console.log("Raw response:", responses[1]);
    }
  }

  // Clean up
  server.kill();
  console.log("\nTest completed!");
}

testVerboseMode().catch(console.error);
