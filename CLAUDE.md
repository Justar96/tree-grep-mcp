# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that provides structural code search and transformation using ast-grep. The project is a **direct wrapper with zero abstractions** - it passes commands directly to ast-grep CLI for maximum performance and perfect CLI compatibility.

**Key Philosophy:** No abstractions layer, no custom DSL - just direct ast-grep command execution with validation and workspace security.

## Core Architecture

### Entry Point: `src/index.ts`
- MCP server initialization and tool registration
- CLI argument parsing for installation options
- Request routing to three main tools: `ast_search`, `ast_replace`, `ast_run_rule`
- Error handling with typed exceptions (ValidationError, BinaryError, ExecutionError)

### Binary Management: `src/core/binary-manager.ts`
Handles ast-grep binary resolution with priority:
1. Custom binary path (via `AST_GREP_BINARY_PATH` env var)
2. System binary (via `--use-system` flag)
3. Platform-specific binary (auto-install with `--auto-install`)

**Important:** Binary is downloaded from ast-grep GitHub releases (v0.39.5) and cached in `~/.ast-grep-mcp/binaries/`. The manager validates binaries with `--version` test before use.

### Workspace Management: `src/core/workspace-manager.ts`
Detects project boundaries and enforces security constraints:
- **Workspace detection hierarchy:**
  - Primary: `.git`, `package.json`, `Cargo.toml`, `go.mod`, `pom.xml`
  - Secondary: `pyproject.toml`, `composer.json`, `build.gradle`, `tsconfig.json`
  - Tertiary: `Makefile`, `README.md`, `.vscode`, `.idea`, `Gemfile`
- **Security:** Blocks system directories (`/etc`, `/bin`, `C:\Windows`, `.ssh`, `.aws`)
- **Path validation:** All paths normalized to forward slashes for ast-grep compatibility
- **Max depth:** 10 levels to prevent excessive traversal

### Tool Implementation: `src/tools/`
Three tools implement direct ast-grep command construction:

**SearchTool (`search.ts`):**
- Executes `ast-grep run --pattern <pattern>`
- Uses `--json=stream` for structured output
- Supports inline code via stdin or file paths via command args

**ReplaceTool (`replace.ts`):**
- Executes `ast-grep run --pattern <pattern> --rewrite <replacement>`
- Defaults to dry-run mode (`dryRun: true`)
- Validates metavariable consistency between pattern and replacement

**ScanTool (`scan.ts`):**
- Generates YAML rule files dynamically
- Executes `ast-grep scan --rule <temp-rule-file>`
- Supports constraints (`where` clauses) and fix suggestions
- Cleans up temp files after execution

### Validation: `src/utils/validation.ts`
Centralized validation for:
- **Pattern syntax:** Validates metavariables (`$VAR`, `$$$NAME`, `$_`)
- **Parameter ranges:** Context (0-100), maxMatches (1-10000), timeout (1000-300000ms)
- **YAML rules:** Rule ID format (kebab-case), severity levels
- **Path safety:** Windows path detection, normalization to forward slashes

## Development Commands

```bash
# Build
bun run build              # TypeScript compilation
bun run build:bun          # Bun-specific build with declarations

# Development
bun run dev                # Run with tsx (Node-based)
bun run dev:bun            # Run with bun --watch (hot reload)

# Testing
bun test                   # Run all tests
bun run test:unit          # Unit tests only (validation.test.ts)
bun run test:integration   # Integration tests only (integration.test.ts)

# Clean
bun run clean              # Remove build directory
```

## Testing Strategy (from AGENTS.md)

**Critical rules:**
- Use real services only - **no mocking**
- Complete each test fully before proceeding
- Write verbose tests for debugging
- Check existing test patterns before adding new tests

Test file structure:
- `tests/validation.test.ts` - Unit tests for validation logic
- `tests/integration.test.ts` - End-to-end MCP tool execution tests
- `tests/setup.ts` - Global test configuration (preloaded via bunfig.toml)
- `tests/fixtures/` - Test code samples

## Code Quality Standards (from AGENTS.md)

**Non-negotiable:**
- No partial implementations or TODO comments
- No code duplication - reuse existing functions
- No dead code - delete entirely
- No emojis in code
- Complete functions only - ask if requirements unclear
- All docstrings follow Google style conventions

**Path handling:**
- Never assume `process.cwd()` equals project root
- Always use `WorkspaceManager` for path validation
- Never hardcode paths - use configuration
- Always normalize Windows paths to forward slashes for ast-grep

## Publishing

Version bumps use standard npm versioning:
```bash
npm version patch          # 1.0.0 → 1.0.1
npm version minor          # 1.0.0 → 1.1.0
npm version major          # 1.0.0 → 2.0.0
git push origin develop --tags
```

GitHub Actions handles automated publishing to npm when tags are pushed. See `.github/PUBLISHING.md` for details.

## Important ast-grep References

Always consult ast-grep documentation for pattern syntax and best practices:
- https://ast-grep.github.io/
- https://ast-grep.github.io/guide/introduction.html

## Common Patterns

### Adding a new tool parameter
1. Add validation in `src/utils/validation.ts` (e.g., `ParameterValidator.validateNewParam()`)
2. Update tool schema in tool class (e.g., `SearchTool.getSchema()`)
3. Add parameter to command args construction in tool's `execute()` method
4. Add test cases in `tests/integration.test.ts`

### Handling new programming languages
Languages are normalized via language alias maps in each tool (e.g., `javascript` → `js`, `typescript` → `ts`). The map is defined in tool execute methods.

### Error handling flow
1. Validation errors → throw `ValidationError` with actionable messages
2. Binary errors → throw `BinaryError` (not recoverable)
3. Execution errors → throw `ExecutionError` (recoverable)
4. MCP server catches all and returns structured error responses

## Runtime Environment

- Node.js >= 18.0.0 or Bun >= 1.0.0
- Uses native `fetch` for downloads (Node 18+ built-in)
- TypeScript with strict mode enabled
- ESM modules only (`"type": "module"`)
