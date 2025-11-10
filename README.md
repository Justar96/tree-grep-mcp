# tree-ast-grep MCP Server

A Model Context Protocol server that provides structural code search and transformation using ast-grep. Direct wrapper with zero abstractions for maximum performance and perfect CLI compatibility.

> Official ast-grep documentation: https://github.com/ast-grep/ast-grep , https://ast-grep.github.io/

## Installation

**Step 1: Install ast-grep**

This MCP server requires ast-grep to be installed on your system. Choose one of the following methods:

```bash
# Using npm (recommended)
npm install -g @ast-grep/cli

# Using Homebrew (macOS/Linux)
brew install ast-grep

# Using Cargo
cargo install ast-grep

# Using Scoop (Windows)
scoop install ast-grep
```

For more installation options, see the [official ast-grep installation guide](https://ast-grep.github.io/guide/quick-start.html#installation).

**Step 2: Add to your MCP settings configuration**

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

This server exposes four tools for structural code operations:

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
- `verbose` (optional): Control output verbosity (default: `true`)
  - When `false`, returns only summary information without detailed match data
  - Useful in CLI to prevent excessive output

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
- `verbose` (optional): Control output verbosity (default: `true`)
  - When `false`, returns only summary information without detailed change data
  - Useful in CLI to prevent excessive output

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

Generate and execute ast-grep YAML rules with constraints and fix suggestions. Supports both simple patterns and complex structural rules.

**Parameters:**
- `id` (required): Unique rule identifier in kebab-case
- `language` (required): Programming language
- `pattern` (optional): Simple AST pattern string (use either `pattern` OR `rule`, not both)
- `rule` (optional): Complex structural rule object with kind/has/inside/all/any/not (use either `pattern` OR `rule`, not both)
- `message` (optional): Human-readable issue description
- `severity` (optional): Issue severity (`error`, `warning`, `info`, default: `warning`)
- `where` (optional): Array of constraints on metavariables
  - `metavariable`: Name without `$` prefix
  - `regex`: Regular expression to match content
  - `equals`: Exact string to match content
  - `not_regex`: Exclude matches with regex pattern
  - `not_equals`: Exclude exact matches
  - `kind`: Match specific AST node type (e.g., 'identifier', 'string_literal')
- `fix` (optional): Fix template using pattern metavariables
- `code` (optional): Inline code to scan (requires `language`)
- `paths` (optional): Array of file/directory paths
- `timeoutMs` (optional): Timeout in milliseconds (1000-300000, default: 30000)
- `verbose` (optional): Control output verbosity (default: `true`)
  - When `false`, returns only summary information without detailed finding data
  - Useful in CLI to prevent excessive output

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

<<<<<<< Updated upstream
**Example with structural rule (IMPORTANT: always use `stopBy: "end"` for relational rules):**
```json
{
  "id": "async-function-with-await",
  "language": "javascript",
  "rule": {
    "kind": "function_declaration",
    "has": {
      "pattern": "await $EXPR",
      "stopBy": "end"
    }
  },
  "message": "Function contains await expression"
}
```

### ast_explain_pattern

Debug and understand AST patterns by showing metavariable captures, AST node kinds, and helpful suggestions. Perfect for pattern development and troubleshooting.

**Parameters:**
- `pattern` (required): AST pattern with metavariables
- `code` (required): Inline code to test the pattern against
- `language` (required): Programming language
- `showAst` (optional): Include AST debug output (default: `false`)
- `timeoutMs` (optional): Timeout in milliseconds (1000-300000, default: 10000)
=======
### ast_explain_pattern

Debug and understand AST patterns by showing metavariable captures, AST node kinds, and helpful suggestions.

**Parameters:**
- `pattern` (required): AST pattern with metavariables
- `code` (required): Code snippet to test pattern against
- `language` (required): Programming language for the code snippet
- `showAst` (optional): Show AST debug output (default: `false`)
- `timeoutMs` (optional): Timeout in milliseconds (1000-300000, default: 10000)
- `verbose` (optional): Control output verbosity (default: `true`)
  - When `false`, returns only match status without detailed metavariable data
  - Useful in CLI to prevent excessive output
>>>>>>> Stashed changes

**Example:**
```json
{
  "pattern": "console.log($ARG)",
<<<<<<< Updated upstream
  "code": "console.log('hello');",
=======
  "code": "console.log('hello')",
>>>>>>> Stashed changes
  "language": "javascript"
}
```

<<<<<<< Updated upstream
**Output:**
```json
{
  "matched": true,
  "metavariables": {
    "ARG": {
      "value": "'hello'",
      "line": 1,
      "column": 12
    }
  },
  "astNodes": ["call_expression", "string"],
  "suggestions": []
}
```

**When to use:**
- Developing new AST patterns - see what metavariables capture
- Debugging pattern match failures - get actionable suggestions
- Learning AST structure - see node kinds for your code
- Testing patterns quickly before using in search/replace/scan

=======
**Example with AST debug:**
```json
{
  "pattern": "function $NAME($$$PARAMS) { $$$BODY }",
  "code": "function test(a, b) { return a + b; }",
  "language": "javascript",
  "showAst": true
}
```

>>>>>>> Stashed changes
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

**Structural Rules:**
When using relational rules (`inside`, `has`, `precedes`, `follows`) in `ast_run_rule`, **always use `stopBy: "end"`** to ensure thorough searching:
```yaml
has:
  pattern: await $EXPR
  stopBy: end
```
Without `stopBy: "end"`, the search may terminate prematurely and miss matches.

**Examples:**
```
console.log($ARG)                          // Matches: console.log("hello")
var $NAME = $VALUE                         // Matches: var x = 5
function $NAME($$$PARAMS) { $$$BODY }      // Matches: function add(a, b) { return a + b; }
```

For more pattern examples across multiple languages, see the [Pattern Library](PATTERN_LIBRARY.md).

## Configuration Options

The server supports these command-line flags:

```bash
# Use system-installed ast-grep (recommended)
npx -y @cabbages/tree-grep

# Use system-installed ast-grep (explicit flag)
npx -y @cabbages/tree-grep --use-system
```

**Environment Variables:**
- `AST_GREP_BINARY_PATH`: Path to custom ast-grep binary (if not using system installation)

**Note:** The `--use-system` flag is now the default behavior. The server will use the ast-grep binary from your system PATH.

## Workspace Detection

The server automatically detects project boundaries by searching for:

**Primary indicators:** `.git`, `package.json`, `Cargo.toml`, `go.mod`, `pom.xml`
**Secondary indicators:** `pyproject.toml`, `composer.json`, `build.gradle`, `tsconfig.json`
**Tertiary indicators:** `Makefile`, `README.md`, `.vscode`, `.idea`, `Gemfile`

## Security

All file paths are validated to prevent access outside the workspace:

- Paths must be within detected workspace root
- System directories blocked (`/etc`, `/bin`, `C:\Windows`, etc.)
- Sensitive directories blocked (`.ssh`, `.aws`, etc.)
- Maximum path depth: 10 levels

## Troubleshooting

### "ast-grep binary not found" error

If you see an error about ast-grep not being found, make sure you have installed ast-grep on your system:

```bash
# Verify ast-grep is installed
ast-grep --version

# If not installed, use one of these methods:
npm install -g @ast-grep/cli        # npm
brew install ast-grep                # Homebrew
cargo install ast-grep               # Cargo
scoop install ast-grep               # Scoop (Windows)
```

For more installation options, see the [official ast-grep installation guide](https://ast-grep.github.io/guide/quick-start.html#installation).

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Run tests
bun test

# Binary manager suite
bun run test:binary-manager

# Coverage for binary manager
bun run test:binary-manager:coverage

# Development mode
bun run dev:bun
```

## Testing

The test suite includes three main categories:

### 1. CLI Flag Mapping Tests (`tests/cli-flag-mapping.test.ts`)

Verifies that MCP parameters correctly map to ast-grep CLI flags. Uses command interception to capture CLI arguments without executing ast-grep.

**Test Coverage:**
- SearchTool: `--pattern`, `--lang`, `--json=stream`, `--context`, `--stdin`, positional paths
- ReplaceTool: `--pattern`, `--rewrite`, `--lang`, `--update-all`, `--stdin`, positional paths
- ScanTool: `--rule`, `--json=stream`, temp file paths, YAML generation
- Language normalization (javascript→js, typescript→ts, python→py, rust→rs, golang→go, c++→cpp)
- Path handling and validation
- Temp file lifecycle (creation, cleanup)

**Run CLI flag mapping tests:**
```bash
bun run test:cli-mapping              # Run CLI flag mapping tests
bun run test:cli-mapping:verbose      # Verbose output for debugging
bun run test:cli-mapping:coverage     # Coverage reporting
```

**CLI Compliance Verified:**

| Tool | Verified Flags |
|------|----------------|
| `ast_search` | `run`, `--pattern`, `--lang`, `--json=stream`, `--context`, `--stdin`, `<paths>` |
| `ast_replace` | `run`, `--pattern`, `--rewrite`, `--lang`, `--update-all`, `--stdin`, `<paths>` |
| `ast_run_rule` | `scan`, `--rule`, `--json=stream`, `<paths>` |
| `ast_explain_pattern` | `run`, `--pattern`, `--lang`, `--json=stream`, `--stdin` |

All flags verified against ast-grep documentation (AST_GREP_ALL_DOCUMENTS.md lines 355-814).

### 2. Integration Tests (`tests/integration.test.ts`)

End-to-end tests using real ast-grep binary execution. 87 comprehensive tests covering:
- Search-then-replace workflows (inline code + file-based)
- Rule creation with constraints and fixes
- Multi-language support (JS, TS, Python, Rust, Go, Java, C++)
- Error handling and validation
- Timeout handling and process cleanup
- Stdin vs file mode behavior
- Context parameter edge cases
- Dry-run vs update-all behavior
- JSON stream format verification

**Run integration tests:**
```bash
bun run test:integration             # Run all integration tests (includes CLI flag mapping)
INTEGRATION_TESTS=1 bun test         # Force integration tests (fail if ast-grep missing)
```

### 3. Binary Manager Tests (`tests/binary-manager.test.ts`)

Dedicated test suite for binary management with ≥95% coverage expectations.

**Run binary manager tests:**
```bash
bun run test:binary-manager          # Run suite in isolation
bun run test:binary-manager:verbose  # Verbose logging for debugging
bun run test:binary-manager:coverage # Collect coverage numbers
```

### Test Infrastructure

- **No mocking policy**: Tests use real binaries and filesystem interactions by design
- **Environment variables:**
  - `TEST_SKIP_NETWORK=1` – skips download tests when network access is unavailable
  - `TEST_BINARY_CACHE_DIR=<path>` – points binary cache at a custom directory for CI or reproducible runs
  - `INTEGRATION_TESTS=1` – forces integration tests in CI pipelines (fails if ast-grep missing)
- **Requirements**: Integration and binary manager tests require ast-grep to be installed on your system (see Installation section)

### Run All Tests

```bash
bun test                              # Run all test suites
bun run test:all                      # Alias for bun test
bun run test:unit                     # Run only unit tests (validation, binary manager)
```

## Requirements

- Node.js >= 18.0.0 or Bun >= 1.0.0
- ast-grep installed on your system (see Installation section)

## License

MIT License

## Links

- GitHub: https://github.com/justar96/tree-grep-mcp
- npm: https://www.npmjs.com/package/@cabbages/tree-grep
- ast-grep: https://github.com/ast-grep/ast-grep

---

## Early Version Notice

This project is in early development. If you encounter any issues, bugs, or have feature requests, please report them on our [GitHub Issues](https://github.com/justar96/tree-grep-mcp/issues) page. Your feedback is extremely valuable and helps improve the project for everyone!
