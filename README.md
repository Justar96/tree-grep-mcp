# tree-ast-grep MCP Server

A **simple, direct wrapper** around ast-grep for AI coding agents. Zero abstractions, maximum performance, perfect ast-grep compatibility.

## 🚀 Quick Start

Add to your MCP settings:

```json
{
  "mcpServers": {
    "tree-ast-grep": {
      "command": "npx",
      "args": ["-y", "@cabbages/tree-grep", "--auto-install"]
    }
  }
}
```

**Using Bun (for development):**
```json
{
  "mcpServers": {
    "tree-ast-grep": {
      "command": "bunx",
      "args": ["@cabbages/tree-grep", "--auto-install"]
    }
  }
}
```

## 🎯 What It Does

Three simple tools that directly execute ast-grep commands:

- **`ast_search`** → `ast-grep run --pattern` (structural code search)
- **`ast_replace`** → `ast-grep run --rewrite` (AST-aware replacements)
- **`ast_run_rule`** → `ast-grep scan --rule` (generate & run custom rules)

## ✨ Key Features

- **Zero Overhead** - Direct ast-grep execution, no abstractions
- **Perfect Compatibility** - Behaves exactly like ast-grep CLI
- **Inline Code Support** - Test patterns without files
- **Named Metavariables** - `$NAME`, `$ARG`, `$$$BODY` work perfectly
- **Auto-Install** - Downloads platform-specific ast-grep binary
- **Minimal Codebase** - ~300 lines, crystal clear logic
- **🔍 MCP Inspector** - Enhanced testing with Model Context Protocol integration

## 📖 Usage Examples

### Search for Patterns
```javascript
// Find all console.log statements
ast_search({
  pattern: "console.log($ARG)",
  language: "javascript",
  code: "console.log('hello'); console.log('world');"
})
```

### Replace Code Structures
```javascript
// Convert var to let
ast_replace({
  pattern: "var $NAME = $VALUE",
  replacement: "let $NAME = $VALUE",
  language: "javascript",
  code: "var x = 5; var y = 10;"
})
```

### Generate Custom Rules
```javascript
// Create linting rule
ast_run_rule({
  id: "no-console-log",
  pattern: "console.log($ARG)",
  message: "Use logger.info instead",
  language: "javascript",
  fix: "logger.info($ARG)"
})
```

## 🏗️ Architecture

**Intentionally Simple:**
```
src/
├── index.ts           # MCP server
├── core/
│   ├── binary-manager.ts    # Execute ast-grep
│   └── workspace-manager.ts # Find workspace root
├── tools/
│   ├── search.ts      # Direct search
│   ├── replace.ts     # Direct replace
│   └── scan.ts        # Direct scan
└── types/errors.ts    # Basic errors
```

Each tool: Validate → Build Command → Execute → Parse → Return

## 🧪 Testing

Patterns work exactly like ast-grep CLI:

```bash
# Run unit suites via Vitest adapter (fast)
npm test

# Using Bun (faster)
bun test
# or
npm run test:bun

# Watch mode
npm run test:watch

# Run specific test suites
npm run test:unit          # Node.js
npm run test:unit:bun      # Bun
npm run test:integration:bun

# Integration/e2e via adapter (requires ast-grep availability)
$env:AST_GREP_AVAILABLE="1"; npm test   # PowerShell
# or
AST_GREP_AVAILABLE=1 npm test           # bash

# Direct ast-grep CLI examples
ast-grep run --pattern "console.log($ARG)" --lang js file.js
ast-grep run --pattern "var $NAME" --rewrite "let $NAME" --lang js file.js
ast-grep scan --rule rule.yml file.js
```

## ⚡ Performance

- **Direct Execution** - No overhead vs ast-grep CLI
- **Streaming JSON** - Fast results parsing
- **Binary Caching** - One-time download per platform
- **Minimal Memory** - No complex abstractions

## 🔧 Configuration Options

```bash
# Lightweight (requires system ast-grep)
npx @cabbages/tree-grep --use-system

# Platform-specific binary
npx @cabbages/tree-grep --platform=win32

# Auto-detect platform (recommended)
npx @cabbages/tree-grep --auto-install
```

## 📝 Metavariable Guide

**✅ Reliable Patterns:**
- `$NAME`, `$ARG`, `$VALUE` (single nodes)
- `$$$BODY`, `$$$ARGS` (named multi-nodes)
- `console.log($ARG)` → `logger.info($ARG)`

**⚠️ Use With Care:**
- Always name multi-node variables: use `$$$BODY`, `$$$ARGS` instead of bare `$$$`
- Bare `$$$` in replacements does not expand and is now rejected by this server
- Keep patterns aligned with ast-grep docs; test them with the CLI

## 🔤 Language IDs and Paths

- Accepted languages are ast-grep’s IDs: `js`, `ts`, `jsx`, `tsx`, etc.
- Aliases like `javascript`/`typescript` are mapped internally to `js`/`ts`.
- Inline `code` requires `language`.
- For file scans:
  - Paths are resolved relative to `WORKSPACE_ROOT` (auto-detected if unset).
  - Absolute paths are supported; Windows paths are normalized.
  - If a single file with a known extension is provided and `language` is omitted, the server infers `--lang` from the filename.

## 🚫 What This ISN'T

- ❌ A complex AST manipulation framework
- ❌ A wrapper with proprietary pattern syntax
- ❌ An abstraction layer over ast-grep
- ❌ A reimplementation of ast-grep functionality

## ✅ What This IS

- ✅ Direct ast-grep command execution
- ✅ Minimal MCP protocol wrapper
- ✅ Perfect CLI compatibility
- ✅ Zero-overhead tool integration
- ✅ Simple, maintainable codebase

## 🔍 MCP Inspector Integration

Enhanced testing capabilities with Model Context Protocol integration for real-world agent usage alignment:

```bash
# Run tests with MCP Inspector
npm run test:mcp

# View MCP Inspector demo
npm run demo:mcp

# Generate comprehensive MCP reports
npm run test:mcp-all
```

**Key MCP Inspector Features:**
- Pattern matching validation with structured results
- Code transformation inspection and verification
- Real-world usage simulation for AI agents
- MCP-compliant test reporting format
- Enhanced debugging with inspection data

See [`docs/MCP_INSPECTOR.md`](docs/MCP_INSPECTOR.md) for detailed documentation.

## 🚀 Development

This project supports both **Node.js** (for users) and **Bun** (for developers):

```bash
# Quick start with Bun (recommended for development)
bun install
bun run dev:bun
bun test

# Or use Node.js (works everywhere)
npm install
npm run dev
npm test
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup and performance comparison.

## 🤝 Contributing

Keep it simple! Follow the CLAUDE.md guidelines:
- No abstractions or base classes
- Direct command execution only
- Test against ast-grep CLI behavior
- Favor duplication over complexity

## 📄 License

MIT License - Use freely, keep it simple!