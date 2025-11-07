# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2025-01-XX

### Added
- **NEW TOOL: ast_explain_pattern** - Pattern debugging tool for understanding metavariable captures and match failures
  - Shows metavariable values, positions (line/column), and AST node kinds
  - Provides actionable suggestions when patterns fail to match
  - Supports optional AST debug output with showAst parameter
  - Executes `ast-grep run --json=stream --stdin` for inline code testing
  - Comprehensive 120+ line tool schema with examples and error recovery tips
- **Enhanced Constraints** - Extended `where` clause support in ast_run_rule with three new constraint types:
  - `not_regex` - Exclude matches with regex pattern (generates `not: { regex: ... }` in YAML)
  - `not_equals` - Exclude exact matches (generates `not: { regex: ^value$ }` in YAML)
  - `kind` - Match specific AST node types (e.g., 'identifier', 'function_declaration')
  - Mutual exclusivity validation (regex vs equals, not_regex vs not_equals)
  - Kind format validation (lowercase with underscores only)
  - Support for combining multiple constraint operators on same metavariable
- **Pattern Library Documentation** - Added links to PATTERN_LIBRARY.md in README.md and all tool schemas
  - 508-line pattern library with examples for JavaScript/TypeScript, Python, Rust, Go, Java
  - GitHub URL used for MCP client compatibility
  - Concise 1-2 line references in tool descriptions

### Changed
- Tool schemas updated with PATTERN LIBRARY sections linking to comprehensive examples
- Enhanced constraint validation now checks kind format (lowercase with underscores)
- YAML generation in ScanTool now supports nested `not:` structures for negative constraints

### Fixed
- None - All changes are additive with zero breaking changes

### Testing
- Added 70+ new tests across explain.test.ts and enhanced-constraints.test.ts
- CLI flag mapping tests verify correct parameter-to-flag translation for new features
- Integration tests cover cross-language support (JS, TS, Python, Rust)
- Test coverage maintained at ≥95%

## [1.1.0] - 2025-01-07

### Added
- Expanded language support: Python, Rust, Go, Java, C++, Kotlin
- Language normalization across all tools (python→py, rust→rs, golang→go, etc.)
- Comprehensive temp file extension mapping for inline code mode
- JSX/TSX pattern matching documentation with warnings and examples
- Metavariable rules documentation (4 key rules)
- Result truncation guidance by repository size
- Diff parsing caveats in Replace tool documentation
- YAML escaping details for ScanTool
- Timeout guidance with recommendations by repo size
- MCP→CLI parameter mapping with concrete examples
- Path validation behavior documentation
- Inline code mode language requirement enforcement (bold emphasis in docs)
- Windows diff format recognition in replace tool parser

### Changed
- Standardized `skippedLines` reporting (available at top-level and in summary)
- Enhanced all tool schemas with comprehensive documentation
- Improved error messages for validation failures with specific path details
- Updated temp file extension handling in ScanTool
- Pattern complexity thresholds adjusted for more accurate classification

### Fixed
- **CRITICAL**: Fixed YAML constraints indentation bug - constraints now at top-level (not nested under rule)
- **CRITICAL**: Fixed pattern validation false positives for valid patterns like `console.log($ARG)`, `$VAR1`, `$VAR.method()`
- Pattern validation regex now correctly distinguishes embedded metavariables from valid usage
- String literal detection improved to avoid false positives with Rust lifetime annotations
- Diff parser now recognizes Windows-style line numbers (`N N│ code`)
- Error messages now include specific validation failure details instead of generic "Invalid paths"
- Language normalization consistency across ast_search, ast_replace, and ast_run_rule
- Temp file extensions now correctly mapped for all supported languages
- Documentation gaps addressed across all tools
- All 250 unit and integration tests now passing (from 41 failures)

## [1.0.0] - 2024-11-04

### Added
- Initial release of tree-grep-mcp
- Three core tools: ast_search, ast_replace, ast_run_rule
- Support for JavaScript, TypeScript, JSX, TSX
- Pattern-based AST search and replacement
- YAML rule generation and execution
- Inline code mode and file mode
- Context lines in search results
- Fix suggestions in rule scanning
- Workspace path validation
- Binary auto-installation

### Security
- Workspace boundary enforcement
- Path validation to prevent directory escape
- Input validation for all parameters

## Notes

### Upgrading

To upgrade to the latest version:

```bash
npm install -g @cabbages/tree-grep@latest
```

Or with npx (no install):
```bash
npx @cabbages/tree-grep@latest
```

### Breaking Changes

None yet. This project follows semantic versioning:
- MAJOR version for incompatible API changes
- MINOR version for backwards-compatible functionality
- PATCH version for backwards-compatible bug fixes

[Unreleased]: https://github.com/justar96/tree-grep-mcp/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/justar96/tree-grep-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/justar96/tree-grep-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/justar96/tree-grep-mcp/releases/tag/v1.0.0
