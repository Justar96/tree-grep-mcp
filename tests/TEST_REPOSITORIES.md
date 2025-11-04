# Test Repositories for ast-grep MCP Tools

## Purpose

This document catalogs 13 carefully selected GitHub repositories for comprehensive testing of the three MCP tools provided by this server:
- `ast_search`: Search for AST patterns in code
- `ast_replace`: Replace code patterns with ast-grep rules
- `ast_run_rule`: Execute custom ast-grep rules with fix capabilities

## Selection Criteria

Repositories were selected based on:
- **Size diversity**: Small (100-500 files), Medium (500-2000 files), Large (2000+ files)
- **Language coverage**: JavaScript, TypeScript, Python, Rust, Go, Java
- **Real-world representativeness**: Popular, actively maintained projects
- **Pattern diversity**: Various code patterns suitable for ast-grep testing
- **Public accessibility**: Open-source with permissive licenses

## Testing Methodology

Repositories will be tested in sequential phases:
1. **Phase 1**: Small repositories (quick validation)
2. **Phase 2**: Medium repositories (moderate complexity)
3. **Phase 3**: Large repositories (stress testing)
4. **Phase 4**: Refinement plan based on findings

## Table of Contents

- [Small Repositories (100-500 files)](#small-repositories-100-500-files)
- [Medium Repositories (500-2000 files)](#medium-repositories-500-2000-files)
- [Large Repositories (2000+ files)](#large-repositories-2000-files)
- [Testing Guidelines](#testing-guidelines)
- [Cross-References](#cross-references)
- [Notes and Considerations](#notes-and-considerations)

## Legend

Each repository entry includes:
- **URL**: GitHub repository link
- **Approximate Size**: Estimated file count
- **Primary Language(s)**: Main programming languages used
- **Why Chosen**: Rationale for selection
- **Test Scenarios**: 4-6 specific test patterns derived from ast-grep rule catalog

---

## Small Repositories (100-500 files)

### 1. chalk/chalk (JavaScript/TypeScript)

**URL**: https://github.com/chalk/chalk

**Approximate Size**: ~150-200 files

**Primary Language**: JavaScript, TypeScript

**Why Chosen**: Popular terminal styling library with clean, focused codebase. Excellent for testing function call patterns, module exports, and TypeScript type definitions. Represents typical utility library structure.

**Test Scenarios**:
1. Search for function definitions using pattern `function $NAME($$$PARAMS) { $$$ }`
2. Find all `module.exports` patterns for CommonJS analysis
3. Search for console.log statements using `console.log($$$ARGS)`
4. Test TypeScript interface definitions with `interface $NAME { $$$ }`
5. Find arrow function patterns `const $NAME = ($$$ARGS) => $$$`
6. Console.log rule with constraints
7. **Detect deprecated API usage patterns** - Search for JSDoc @deprecated tags, specific deprecated method calls using regex constraints, and comment-based deprecation markers

---

### 2. fastapi/typer (Python)

**URL**: https://github.com/fastapi/typer

**Approximate Size**: ~200-300 files

**Primary Language**: Python

**Why Chosen**: Modern Python CLI framework with type hints. Great for testing Python-specific patterns, decorators, and type annotations. Clean architecture for pattern matching.

**Test Scenarios**:
1. Search for function decorators using pattern `@$DECORATOR\ndef $FUNC($$$ARGS): $$$`
2. Find type-annotated function parameters `def $NAME($$$PARAMS): $$$`
3. Detect class definitions with inheritance `class $NAME($BASE): $$$`
4. Search for import statements `from $MODULE import $ITEMS`
5. Find all `if __name__ == "__main__":` patterns
6. Test constraint-based rules for specific decorator names (e.g., @app.command)

---

### 3. sharkdp/hyperfine (Rust)

**URL**: https://github.com/sharkdp/hyperfine

**Approximate Size**: ~100-150 files

**Primary Language**: Rust

**Why Chosen**: Command-line benchmarking tool with idiomatic Rust code. Excellent for testing Rust patterns including match expressions, Result types, and trait implementations.

**Test Scenarios**:
1. Search for function definitions `fn $NAME($$$PARAMS) -> $RET { $$$ }`
2. Find match expressions `match $EXPR { $$$ }`
3. Detect Result/Option unwrapping patterns `.unwrap()` or `.expect($MSG)`
4. Search for struct definitions `struct $NAME { $$$ }`
5. Find trait implementations `impl $TRAIT for $TYPE { $$$ }`
6. Test error handling patterns with `?` operator

---

### 4. sindresorhus/execa (JavaScript/TypeScript)

**URL**: https://github.com/sindresorhus/execa

**Approximate Size**: ~150-200 files

**Primary Language**: JavaScript, TypeScript

**Why Chosen**: Process execution library with modern async/await patterns. Good for testing promise-based code, async functions, and error handling patterns.

**Test Scenarios**:
1. Search for async function definitions `async function $NAME($$$PARAMS) { $$$ }`
2. Find await expressions `await $EXPR`
3. Detect try-catch blocks `try { $$$ } catch ($ERR) { $$$ }`
4. Search for Promise patterns `new Promise(($RESOLVE, $REJECT) => { $$$ })`
5. Find export statements `export { $$$EXPORTS }`
6. Test replacement: modernize var to const/let

---

### 5. remkop/picocli (Java)

**URL**: https://github.com/remkop/picocli

**Approximate Size**: ~300-400 files

**Primary Language**: Java

**Why Chosen**: Modern command-line framework with extensive use of Java annotations. Excellent for testing Java-specific patterns including class declarations, annotation detection, method overrides, and stream API usage. Clean codebase representative of contemporary Java development practices.

**Test Scenarios**:
1. Search for class declarations `class $NAME { $$$ }`
2. Find method annotations, particularly `@Override` decorator pattern
3. Detect annotation usage patterns `@$ANNOTATION($$$ARGS)`
4. Search for stream API usage `.stream().$METHOD($$$ARGS)`
5. Find try-with-resources patterns `try ($RESOURCE = $INIT) { $$$ }`
6. Test generic type declarations `class $NAME<$TYPE> { $$$ }`

---

## Medium Repositories (500-2000 files)

### 1. expressjs/express (JavaScript)

**URL**: https://github.com/expressjs/express

**Approximate Size**: ~400-600 files

**Primary Language**: JavaScript

**Why Chosen**: Iconic Node.js web framework with extensive middleware patterns. Perfect for testing complex function compositions, callback patterns, and middleware chains.

**Test Scenarios**:
1. Search for middleware functions `function($REQ, $RES, $NEXT) { $$$ }`
2. Find route definitions `app.$METHOD($PATH, $$$HANDLERS)`
3. Detect callback patterns with error-first convention `function($ERR, $$$ARGS) { $$$ }`
4. Search for deprecated API usage (e.g., old Express 3.x patterns)
5. Find all `require()` statements for dependency analysis
6. Test rule with constraints: find routes with specific HTTP methods
7. Replace callback patterns with async/await equivalents (dry-run)

---

### 2. pallets/flask (Python)

**URL**: https://github.com/pallets/flask

**Approximate Size**: ~500-700 files

**Primary Language**: Python

**Why Chosen**: Popular Python web framework with decorator-heavy routing. Excellent for testing Python decorator patterns, class-based views, and context managers.

**Test Scenarios**:
1. Search for route decorators `@app.route($PATH)\ndef $FUNC($$$ARGS): $$$`
2. Find class-based views `class $NAME(MethodView): $$$`
3. Detect context manager usage `with $EXPR as $VAR: $$$`
4. Search for blueprint definitions `Blueprint($NAME, $$$ARGS)`
5. Find all import statements from flask package
6. Test constraint-based rule: find routes with specific HTTP methods in decorator
7. Create rule to detect missing error handlers

---

### 3. gohugoio/hugo (Go)

**URL**: https://github.com/gohugoio/hugo

**Approximate Size**: ~1200-1500 files

**Primary Language**: Go

**Why Chosen**: Static site generator with complex Go patterns. Great for testing Go-specific constructs like goroutines, channels, interfaces, and error handling.

**Test Scenarios**:
1. Search for function definitions `func $NAME($$$PARAMS) $RET { $$$ }`
2. Find goroutine launches `go $FUNC($$$ARGS)`
3. Detect defer statements `defer $EXPR`
4. Search for interface definitions `type $NAME interface { $$$ }`
5. Find error handling patterns `if err != nil { $$$ }`
6. Test struct initialization patterns `$TYPE{$$$}`
7. Create rule to detect missing error checks

---

### 4. fastify/fastify (JavaScript/TypeScript)

**URL**: https://github.com/fastify/fastify

**Approximate Size**: ~800-1000 files

**Primary Language**: JavaScript, TypeScript

**Why Chosen**: High-performance web framework with plugin architecture. Good for testing TypeScript generics, plugin patterns, and schema validation.

**Test Scenarios**:
1. Search for plugin registration `fastify.register($PLUGIN, $OPTS)`
2. Find route handlers with schema validation
3. Detect TypeScript generic function definitions
4. Search for hook definitions `fastify.addHook($HOOK, $HANDLER)`
5. Find all async route handlers
6. Test replacement: convert callback-based routes to async/await
7. Create rule with fix: add missing error handling

---

## Large Repositories (2000+ files)

### 1. facebook/react (JavaScript/TypeScript)

**URL**: https://github.com/facebook/react

**Approximate Size**: ~3000-4000 files

**Primary Language**: JavaScript, TypeScript

**Why Chosen**: Industry-leading UI library with complex codebase. Excellent stress test for performance, timeout handling, and result truncation. Contains diverse patterns including JSX, hooks, and internal APIs.

**Test Scenarios**:
1. Search for React component definitions (class and functional)
2. Find all useState hook usage `useState($$$ARGS)`
3. Detect useEffect patterns with dependency arrays
4. Search for JSX elements `<$TAG $$$PROPS>$$$CHILDREN</$TAG>`
5. Find deprecated lifecycle methods (componentWillMount, etc.)
6. Test maxMatches parameter with large result sets
7. Test timeout handling with complex patterns
8. Create rule to detect missing dependency arrays in useEffect

---

### 2. django/django (Python)

**URL**: https://github.com/django/django

**Approximate Size**: ~4000-5000 files

**Primary Language**: Python

**Why Chosen**: Comprehensive web framework with extensive ORM patterns. Perfect for testing large-scale Python codebases, class hierarchies, and metaclass usage.

**Test Scenarios**:
1. Search for model definitions `class $NAME(models.Model): $$$`
2. Find view functions and class-based views
3. Detect ORM query patterns `$MODEL.objects.filter($$$ARGS)`
4. Search for signal definitions and handlers
5. Find all middleware classes
6. Test performance with deeply nested class hierarchies
7. Create rule to detect N+1 query patterns
8. Test memory usage with large file counts

---

### 3. tokio-rs/tokio (Rust)

**URL**: https://github.com/tokio-rs/tokio

**Approximate Size**: ~2500-3500 files

**Primary Language**: Rust

**Why Chosen**: Async runtime with complex macro usage and trait implementations. Excellent for testing Rust's advanced features including macros, lifetimes, and async/await.

**Test Scenarios**:
1. Search for async function definitions `async fn $NAME($$$PARAMS) -> $RET { $$$ }`
2. Find macro definitions `macro_rules! $NAME { $$$ }`
3. Detect trait bounds in generic functions
4. Search for unsafe blocks `unsafe { $$$ }`
5. Find all tokio::spawn calls
6. Test complex pattern matching with lifetime annotations
7. Create rule to detect missing Send bounds on async functions
8. Test result parsing robustness with complex Rust syntax

---

### 4. kubernetes/kubernetes (Go)

**URL**: https://github.com/kubernetes/kubernetes

**Approximate Size**: ~10000+ files (very large)

**Primary Language**: Go

**Why Chosen**: Massive container orchestration platform. Ultimate stress test for performance, memory usage, and scalability. Contains diverse Go patterns across hundreds of packages.

**Test Scenarios**:
1. Search for API handler functions across multiple packages
2. Find all context.Context usage patterns
3. Detect error wrapping patterns with fmt.Errorf
4. Search for interface implementations across codebase
5. Find all test functions `func Test$NAME(t *testing.T) { $$$ }`
6. Test extreme timeout scenarios (may need 300s timeout)
7. Test maxMatches truncation with 10000 limit
8. Monitor memory consumption during large-scale scans
9. Test error recovery with malformed files

---

## Testing Guidelines

### General Testing Approach

1. **Clone repositories** to local machine before testing
2. **Use inline code mode** for initial pattern testing (quick validation)
3. **Use file/directory mode** for full repository scans
4. **Document performance metrics**: execution time, memory usage
5. **Record failures**: any tool failures or unexpected behavior
6. **Compare results**: MCP tool results vs direct ast-grep CLI when possible

### Performance Benchmarks to Track

- **Execution time** for search operations
- **Memory usage** during large scans
- **Result parsing accuracy** (skippedLines count)
- **Timeout behavior** with complex patterns
- **MaxMatches truncation** behavior

### Common Test Patterns from ast-grep Rule Catalog

Reference `AST_GREP_TEXT.md` for comprehensive examples:

- **Function call detection**: `$FUNC($$$ARGS)`
- **Class definitions**: `class $NAME { $$$ }`
- **Import/require statements**: language-specific
- **Deprecated API detection**: specific function names with constraints
- **Console.log removal**: `console.log($$$ARGS)` → remove or replace
- **Var to const modernization**: `var $NAME = $VALUE` → `const $NAME = $VALUE`
- **Async/await patterns**: `async function` and `await` expressions
- **Error handling**: try-catch, Result types, error checks

### Testing Phase Deliverables

Each testing phase should produce:
- **Results document**: detailed findings for each repository
- **Performance metrics**: execution times, memory usage
- **Issue log**: failures, edge cases, unexpected behavior
- **Pattern library**: successful patterns for each language
- **Recommendations**: improvements for MCP tools

---

## Cross-References

### Related Documentation

- **`AST_GREP_TEXT.md`**: Comprehensive rule catalog with examples for all supported languages
- **`EDGE_CASES_AND_IMPROVEMENTS.md`**: Edge cases and validation improvements implemented in tools
- **`tests/integration.test.ts`**: Integration tests demonstrating tool usage patterns
- **`tests/validation.test.ts`**: Unit tests for validation utilities

### Subsequent Testing Phases

- **Phase 1**: Small repository testing (to be documented in `tests/SMALL_REPO_RESULTS.md`)
- **Phase 2**: Medium repository testing (to be documented in `tests/MEDIUM_REPO_RESULTS.md`)
- **Phase 3**: Large repository testing (to be documented in `tests/LARGE_REPO_RESULTS.md`)
- **Phase 4**: Refinement plan creation (to be documented in `tests/REFINEMENT_PLAN.md`)

---

## Notes and Considerations

### Language Support Notes

- **JavaScript/TypeScript**: Excellent support, most mature patterns
- **Python**: Good support, test decorators and type hints
- **Rust**: Strong support, test complex macro and lifetime patterns
- **Go**: Good support, test goroutines and interfaces
- **Java**: Basic support, focus on class and method patterns

### Repository Maintenance

- All selected repositories are **actively maintained** (as of November 2025)
- **File counts are approximate** and may change with new releases
- Use `tokei` or similar tools to verify current file counts before testing
- Some repositories may have moved or been archived; **verify URLs before cloning**

### Testing Priorities

1. **Verify basic pattern matching** works across all languages
2. **Test constraint-based rules** with metavariable validation
3. **Test replacement operations** in dry-run mode
4. **Stress test with large repositories** for performance
5. **Document language-specific limitations** or issues

### Expected Challenges

- **Large repository timeouts**: May need to adjust timeout parameters
- **Memory consumption**: Large scans may require monitoring
- **Result truncation**: Test maxMatches behavior with large result sets
- **Language parser limitations**: Some advanced language features may not parse correctly
- **Performance variability**: Execution times may vary based on system resources

### Success Criteria

- ✓ All 13 repositories successfully cloned and scanned
- ✓ All test scenarios executed without critical failures
- ✓ Performance metrics documented for each size category
- ✓ Edge cases and limitations identified and documented
- ✓ Refinement plan created based on comprehensive testing results
