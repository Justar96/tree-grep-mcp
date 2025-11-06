#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AstGrepBinaryManager } from "./core/binary-manager.js";
import { InstallationOptions } from "./types/errors.js";
import { WorkspaceManager } from "./core/workspace-manager.js";
import { SearchTool } from "./tools/search.js";
import { ReplaceTool } from "./tools/replace.js";
import { ScanTool } from "./tools/scan.js";
import { BinaryError, ValidationError, ExecutionError } from "./types/errors.js";
// Removed complex schema imports - using simple any types now

/**
 * Parse CLI arguments and environment variables into installation options.
 */
function parseArgs(): InstallationOptions {
  const args = process.argv.slice(2);
  const options: InstallationOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--use-system") {
      options.useSystem = true;
    } else if (arg === "--auto-install") {
      options.autoInstall = true;
    } else if (arg.startsWith("--platform=")) {
      options.platform = arg.split("=")[1] as "win32" | "darwin" | "linux" | "auto";
    } else if (arg.startsWith("--cache-dir=")) {
      options.cacheDir = arg.split("=")[1];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  // Environment variable overrides
  options.customBinaryPath = process.env.AST_GREP_BINARY_PATH;
  options.cacheDir = options.cacheDir || process.env.AST_GREP_CACHE_DIR;

  return options;
}

/**
 * Print usage information for installing and configuring the MCP server.
 */
function printHelp(): void {
  console.log(`
tree-ast-grep MCP Server - Installation Options:

LIGHTWEIGHT OPTIONS:
  --use-system              Use ast-grep from system PATH (200KB package)
  --platform=<os>          Install platform-specific binary (7MB)
                           Options: win32, darwin, linux
  --auto-install           Auto-detect and install for current platform (7MB)

CONFIGURATION:
  --cache-dir=<path>       Custom cache directory for binaries

ENVIRONMENT VARIABLES:
  AST_GREP_BINARY_PATH     Path to custom ast-grep binary
  AST_GREP_CACHE_DIR       Cache directory for downloaded binaries (recommended: use absolute path)
  WORKSPACE_ROOT           Explicit workspace root directory

EXAMPLES:
  # Lightweight (requires system ast-grep)
  npx -y tree-ast-grep-mcp --use-system

  # Platform-specific
  npx -y tree-ast-grep-mcp --platform=win32

  # Auto-install (recommended)
  npx -y tree-ast-grep-mcp --auto-install

MCP CONFIGURATION (Recommended for Claude Desktop):
  Add to your MCP settings with absolute cache path:
  {
    "mcpServers": {
      "tree-ast-grep": {
        "command": "npx",
        "args": ["-y", "@cabbages/tree-ast-grep-mcp", "--auto-install"],
        "env": {
          "WORKSPACE_ROOT": "\${workspaceFolder}",
          "AST_GREP_CACHE_DIR": "C:\\\\Users\\\\YourUsername\\\\.ast-grep-mcp\\\\binaries"
        }
      }
    }
  }

  Note: Replace YourUsername with your actual username.
  macOS/Linux: use /Users/YourUsername/.ast-grep-mcp/binaries
`);
}

/**
 * Entry point for launching the MCP server and registering available tools.
 */
async function main(): Promise<void> {
  try {
    // Parse installation options
    const installOptions = parseArgs();

    // Initialize workspace manager
    const workspaceRoot = process.env.WORKSPACE_ROOT;
    const workspaceManager = new WorkspaceManager(workspaceRoot);

    console.error(`tree-ast-grep MCP server starting...`);
    console.error(`Workspace root: ${workspaceManager.getWorkspaceRoot()}`);

    // Initialize binary manager
    const binaryManager = new AstGrepBinaryManager(installOptions);
    await binaryManager.initialize();

    console.error(`Binary initialized: ${binaryManager.getBinaryPath()}`);

    // Initialize tools
    const searchTool = new SearchTool(binaryManager, workspaceManager);
    const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
    const scanTool = new ScanTool(workspaceManager, binaryManager);

    // Create MCP server
    const server = new Server(
      {
        name: "tree-ast-grep",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [SearchTool.getSchema(), ReplaceTool.getSchema(), ScanTool.getSchema()],
      };
    });

    // Handle tool calls
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "ast_search":
            const searchResult = await searchTool.execute(args as Record<string, unknown>);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(searchResult, null, 2),
                },
              ],
            };

          case "ast_replace":
            const replaceResult = await replaceTool.execute(args as Record<string, unknown>);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(replaceResult, null, 2),
                },
              ],
            };

          case "ast_run_rule":
            const scanResult = await scanTool.execute(args as Record<string, unknown>);
            return {
              content: [
                { type: "text", text: scanResult.yaml },
                { type: "text", text: `\n---\n${JSON.stringify(scanResult.scan, null, 2)}` },
              ],
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        // Handle different error types
        let errorMessage = "An unknown error occurred";
        let isRecoverable = false;

        if (error instanceof ValidationError) {
          errorMessage = `Validation Error: ${error.message}`;
          if (error.context?.errors && Array.isArray(error.context.errors)) {
            errorMessage += `\nDetails: ${(error.context.errors as string[]).join(", ")}`;
          }
          isRecoverable = true;
        } else if (error instanceof BinaryError) {
          errorMessage = `Binary Error: ${error.message}`;
          isRecoverable = false;
        } else if (error instanceof ExecutionError) {
          errorMessage = `Execution Error: ${error.message}`;
          isRecoverable = true;
        } else if (error instanceof Error) {
          errorMessage = `Error: ${error.message}`;
          isRecoverable = true;
        }

        return {
          content: [
            {
              type: "text",
              text: errorMessage,
            },
          ],
          isError: !isRecoverable,
        };
      }
    });

    // Start the server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("tree-ast-grep MCP server running on stdio");
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error("Shutting down tree-ast-grep MCP server...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Shutting down tree-ast-grep MCP server...");
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
