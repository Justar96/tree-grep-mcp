# tree-ast-grep MCP Server

A Model Context Protocol server that provides structural code search and transformation using ast-grep. Direct wrapper with zero abstractions for maximum performance and perfect CLI compatibility.

## Installation

Add to your MCP settings configuration:

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

## Tools

This server exposes three tools for structural code operations:

### ast_search

Search code using AST pattern matching (structural search, not text search).

**Parameters:**
- `pattern` (required): AST pattern with metavariables
  - `$VAR` - matches single AST node
  - `$$$NAME` - matches zero or more nodes (must be named)
  - `$_` - anonymous single match
- `code` (optional): Inline code to search (requires `language`)
- `paths` (optional): Array of file/directory paths
- `language` (optional): Programming language (required for inline code)
  - Supported: `javascript`, `typescript`, `python`, `rust`, `java`, `go`, `cpp`, etc.
  - Aliases: `js`→`javascript`, `ts`→`typescript`, `py`→`python`
- `context` (optional): Number of context lines (0-100, default: 3)
- `maxMatches` (optional): Maximum results (1-10000, default: 100)
- `timeoutMs` (optional): Timeout in milliseconds (1000-300000, default: 30000)

**Example:**
```json
{
  "pattern": "console.log($ARG)",
  "language": "javascript",
  "code": "console.log('hello'); console.log('world');"
}
```

### ast_replace

Perform structural code replacements using AST pattern matching.

**Parameters:**
- `pattern` (required): AST pattern to match
- `replacement` (required): Replacement template using same metavariables
- `code` (optional): Inline code to transform (requires `language`)
- `paths` (optional): Array of file/directory paths
- `language` (optional): Programming language (required for inline code)
- `dryRun` (optional): Preview without modifying files (default: `true`)
- `timeoutMs` (optional): Timeout in milliseconds (1000-300000, default: 60000)

**Example:**
```json
{
  "pattern": "var $NAME = $VALUE",
  "replacement": "const $NAME = $VALUE",
  "language": "javascript",
  "code": "var x = 5; var y = 10;",
  "dryRun": true
}
```

**Important:** Always test with `dryRun: true` before applying changes.

### ast_run_rule

Generate and execute ast-grep YAML rules with constraints and fix suggestions.

**Parameters:**
- `id` (required): Unique rule identifier in kebab-case
- `language` (required): Programming language
- `pattern` (required): AST pattern to match
- `message` (optional): Human-readable issue description
- `severity` (optional): Issue severity (`error`, `warning`, `info`, default: `warning`)
- `where` (optional): Array of constraints on metavariables
  - `metavariable`: Name without `$` prefix
  - `regex`: Regular expression to match content
  - `equals`: Exact string to match content
- `fix` (optional): Fix template using pattern metavariables
- `code` (optional): Inline code to scan (requires `language`)
- `paths` (optional): Array of file/directory paths
- `timeoutMs` (optional): Timeout in milliseconds (1000-300000, default: 30000)

**Example:**
```json
{
  "id": "no-console-log",
  "language": "javascript",
  "pattern": "console.log($ARG)",
  "message": "Use logger.info instead",
  "severity": "warning",
  "fix": "logger.info($ARG)"
}
```

**Example with constraints:**
```json
{
  "id": "test-vars-only",
  "language": "javascript",
  "pattern": "const $NAME = $VALUE",
  "where": [
    { "metavariable": "NAME", "regex": "^test" }
  ],
  "message": "Variables starting with test"
}
```

## Pattern Syntax

Patterns use ast-grep's metavariable syntax for structural matching:

- **Single node**: `$VAR`, `$NAME`, `$ARG`
  - Matches: expressions, identifiers, statements
  - Example: `console.log($ARG)` matches any single argument

- **Multiple nodes**: `$$$NAME`, `$$$PARAMS`, `$$$BODY`
  - Matches: zero or more nodes
  - Must be named (bare `$$$` not allowed)
  - Example: `function $NAME($$$PARAMS) { $$$BODY }`

- **Anonymous match**: `$_`
  - Use when you don't need to reference the match
  - Example: `foo($_, $_, $_)` matches three arguments

**Metavariable Rules:**
- Names must be UPPER_CASE or UPPER_SNAKE_CASE
- Multi-node metavariables must have names
- Replacement templates must use same metavariables as pattern

**Examples:**
```
console.log($ARG)                          // Matches: console.log("hello")
var $NAME = $VALUE                         // Matches: var x = 5
function $NAME($$$PARAMS) { $$$BODY }      // Matches: function add(a, b) { return a + b; }
```

## Configuration Options

The server supports these command-line flags:

```bash
# Use system-installed ast-grep
npx @cabbages/tree-grep --use-system

# Auto-install platform-specific binary (recommended)
npx @cabbages/tree-grep --auto-install

# Specify platform manually
npx @cabbages/tree-grep --platform=darwin-arm64
```

**Supported platforms:**
- `darwin-x64` (macOS Intel)
- `darwin-arm64` (macOS Apple Silicon)
- `linux-x64` (Linux x86_64)
- `linux-arm64` (Linux ARM64)
- `win32-x64` (Windows x64)
- `win32-arm64` (Windows ARM64)

## Workspace Detection

The server automatically detects project boundaries by searching for:

**Primary indicators:** `.git`, `package.json`, `Cargo.toml`, `go.mod`, `pom.xml`
**Secondary indicators:** `pyproject.toml`, `composer.json`, `build.gradle`, `tsconfig.json`
**Tertiary indicators:** `Makefile`, `README.md`, `.vscode`, `.idea`, `Gemfile`

Override with `WORKSPACE_ROOT` environment variable.

## Security

All file paths are validated to prevent access outside the workspace:

- Paths must be within detected workspace root
- System directories blocked (`/etc`, `/bin`, `C:\Windows`, etc.)
- Sensitive directories blocked (`.ssh`, `.aws`, etc.)
- Maximum path depth: 10 levels

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Run tests
bun test

# Development mode
bun run dev:bun
```

## Requirements

- Node.js >= 18.0.0 or Bun >= 1.0.0
- ast-grep binary (auto-installed with `--auto-install` flag)

## License

MIT License

## Links

- GitHub: https://github.com/justar96/tree-grep-mcp
- npm: https://www.npmjs.com/package/@cabbages/tree-grep
- ast-grep: https://ast-grep.github.io/
