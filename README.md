# tree-ast-grep MCP Server

MCP server for structural code search and transformation using ast-grep. Direct CLI wrapper with zero abstractions.

> Official ast-grep documentation: https://github.com/ast-grep/ast-grep, https://ast-grep.github.io/

**Note:** This project is in early development. Please report issues at [GitHub Issues](https://github.com/justar96/tree-grep-mcp/issues).

## Installation

**1. Install ast-grep:**

```bash
npm install -g @ast-grep/cli   # or: brew install ast-grep
```

**2. Add to MCP config:**

```json
{
  "mcpServers": {
    "tree-ast-grep": {
      "command": "npx",
      "args": ["-y", "@cabbages/tree-grep"]
    }
  }
}
```

## Tools

This server provides four tools for LLM agents:

- **ast_search** - Search code using AST pattern matching
- **ast_replace** - Replace code using AST patterns (supports dry-run mode)
- **ast_run_rule** - Execute YAML rules with constraints and fixes
- **ast_explain_pattern** - Debug patterns and see metavariable captures

***Tool schemas and parameters are provided via MCP protocol.***

## Troubleshooting

**Binary not found:**
```bash
npm install -g @ast-grep/cli
ast-grep --version
```

## Requirements

- Node.js >= 18.0.0 or Bun >= 1.0.0
- ast-grep installed on system

## Token Usage

The MCP server exposes 4 tools with a total context cost of **~10,898 tokens** (approximation method, ±20% variance).

### Context Window Impact

```
╔══════════════════════════════════════════════════════════════════════════════╗
║ 🚀 Context Window Impact - Latest 2025 Models                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ 🤖 GPT-5                  400K │  2.72% ██████░░░░░░░░░░░░░░░░░░░░░░░░ ║
║ 🧠 Claude Sonnet 4.5      200K │  5.45% ███████████░░░░░░░░░░░░░░░░░░░ ║
║ ⚡ Grok 4               2,000K │  0.54% ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ║
║ 💎 Gemini 2.5 Pro       1,000K │  1.09% ███░░░░░░░░░░░░░░░░░░░░░░░░░░░ ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

**Run Token analysis:**
```bash
node scripts/count-tool-tokens.js
```

## Links

- GitHub: https://github.com/justar96/tree-grep-mcp
- npm: https://www.npmjs.com/package/@cabbages/tree-grep
- ast-grep: https://ast-grep.github.io

## License

MIT
