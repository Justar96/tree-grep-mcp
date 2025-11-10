// Test script to verify verbose mode functionality
import {
  SearchTool,
  ReplaceTool,
  ScanTool,
  ExplainTool,
  AstGrepBinaryManager,
  WorkspaceManager,
} from "../../build/index.js";
import path from "path";

async function runTests() {
  console.log("Starting verbose mode tests...");

  // Initialize components
  const installOptions = {
    useSystem: true, // Use system binary for testing
  };

  const binaryManager = new AstGrepBinaryManager(installOptions);
  await binaryManager.initialize();

  const workspaceRoot = path.resolve(__dirname, "..");
  const workspaceManager = new WorkspaceManager(workspaceRoot);

  // Test 1: SearchTool with verbose=true (default)
  console.log("\n=== Test 1: SearchTool with verbose=true ===");
  const searchTool = new SearchTool(binaryManager, workspaceManager);
  const searchResultVerbose = await searchTool.execute({
    pattern: "function $NAME($$$PARAMS) { $$$BODY }",
    language: "javascript",
    paths: [path.join(workspaceRoot, "src")],
    verbose: true,
  });

  console.log("Verbose result:");
  console.log(`- Total matches: ${searchResultVerbose.summary.totalMatches}`);
  console.log(`- Matches array length: ${searchResultVerbose.matches.length}`);
  console.log(`- First match file: ${searchResultVerbose.matches[0]?.file}`);
  console.log(`- First match text: ${searchResultVerbose.matches[0]?.text.substring(0, 50)}...`);

  // Test 2: SearchTool with verbose=false
  console.log("\n=== Test 2: SearchTool with verbose=false ===");
  const searchResultNonVerbose = await searchTool.execute({
    pattern: "function $NAME($$$PARAMS) { $$$BODY }",
    language: "javascript",
    paths: [path.join(workspaceRoot, "src")],
    verbose: false,
  });

  console.log("Non-verbose result:");
  console.log(`- Total matches: ${searchResultNonVerbose.summary.totalMatches}`);
  console.log(`- Matches array length: ${searchResultNonVerbose.matches.length}`);
  console.log(`- First match file: ${searchResultNonVerbose.matches[0] || "undefined"}`);

  // Test 3: ReplaceTool with verbose=true (default)
  console.log("\n=== Test 3: ReplaceTool with verbose=true ===");
  const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
  const replaceResultVerbose = await replaceTool.execute({
    pattern: "function $NAME($$$PARAMS) { $$$BODY }",
    replacement: "const $NAME = ($$$PARAMS) => { $$$BODY }",
    language: "javascript",
    paths: [path.join(workspaceRoot, "src")],
    dryRun: true, // Preview mode only
    verbose: true,
  });

  console.log("Verbose result:");
  console.log(`- Total changes: ${replaceResultVerbose.summary.totalChanges}`);
  console.log(`- Changes array length: ${replaceResultVerbose.changes.length}`);
  console.log(`- First change file: ${replaceResultVerbose.changes[0]?.file}`);
  console.log(`- Preview present: ${!!replaceResultVerbose.changes[0]?.preview}`);

  // Test 4: ReplaceTool with verbose=false
  console.log("\n=== Test 4: ReplaceTool with verbose=false ===");
  const replaceResultNonVerbose = await replaceTool.execute({
    pattern: "function $NAME($$$PARAMS) { $$$BODY }",
    replacement: "const $NAME = ($$$PARAMS) => { $$$BODY }",
    language: "javascript",
    paths: [path.join(workspaceRoot, "src")],
    dryRun: true, // Preview mode only
    verbose: false,
  });

  console.log("Non-verbose result:");
  console.log(`- Total changes: ${replaceResultNonVerbose.summary.totalChanges}`);
  console.log(`- Changes array length: ${replaceResultNonVerbose.changes.length}`);
  console.log(`- First change file: ${replaceResultNonVerbose.changes[0] || "undefined"}`);

  // Test 5: ScanTool with verbose=true (default)
  console.log("\n=== Test 5: ScanTool with verbose=true ===");
  const scanTool = new ScanTool(workspaceManager, binaryManager);
  const scanResultVerbose = await scanTool.execute({
    id: "test-function-scan",
    language: "javascript",
    pattern: "function $NAME($$$PARAMS) { $$$BODY }",
    paths: [path.join(workspaceRoot, "src")],
    verbose: true,
  });

  console.log("Verbose result:");
  console.log(`- Total findings: ${scanResultVerbose.scan.summary.totalFindings}`);
  console.log(`- Findings array length: ${scanResultVerbose.scan.findings.length}`);
  console.log(`- First finding file: ${scanResultVerbose.scan.findings[0]?.file || "undefined"}`);

  // Test 6: ScanTool with verbose=false
  console.log("\n=== Test 6: ScanTool with verbose=false ===");
  const scanResultNonVerbose = await scanTool.execute({
    id: "test-function-scan",
    language: "javascript",
    pattern: "function $NAME($$$PARAMS) { $$$BODY }",
    paths: [path.join(workspaceRoot, "src")],
    verbose: false,
  });

  console.log("Non-verbose result:");
  console.log(`- Total findings: ${scanResultNonVerbose.scan.summary.totalFindings}`);
  console.log(`- Findings array length: ${scanResultNonVerbose.scan.findings.length}`);
  console.log(
    `- Findings array empty: ${scanResultNonVerbose.scan.findings.length === 0 ? "Yes" : "No"}`
  );
  console.log(
    `- First finding file: ${scanResultNonVerbose.scan.findings[0]?.file || "undefined"}`
  );

  // Test 7: ExplainTool with verbose=true (default)
  console.log("\n=== Test 7: ExplainTool with verbose=true ===");
  const explainTool = new ExplainTool(binaryManager, workspaceManager);
  const explainResultVerbose = await explainTool.execute({
    pattern: "console.log($ARG)",
    code: 'console.log("Hello, world!");',
    language: "javascript",
    verbose: true,
  });

  console.log("Verbose result:");
  console.log(`- Pattern matched: ${explainResultVerbose.matched}`);
  console.log(`- Metavariables count: ${Object.keys(explainResultVerbose.metavariables).length}`);
  console.log(
    `- First metavariable: ${Object.keys(explainResultVerbose.metavariables)[0] || "None"}`
  );

  // Test 8: ExplainTool with verbose=false
  console.log("\n=== Test 8: ExplainTool with verbose=false ===");
  const explainResultNonVerbose = await explainTool.execute({
    pattern: "console.log($ARG)",
    code: 'console.log("Hello, world!");',
    language: "javascript",
    verbose: false,
  });

  console.log("Non-verbose result:");
  console.log(`- Pattern matched: ${explainResultNonVerbose.matched}`);
  console.log(
    `- Metavariables count: ${Object.keys(explainResultNonVerbose.metavariables).length}`
  );

  console.log("\nAll tests completed successfully!");
}

runTests().catch(console.error);
