# Pattern Library

Common AST patterns for structural code search and transformation. All patterns are tested and ready to use with tree-grep-mcp tools.

**Quick Links:**
- [JavaScript/TypeScript](#javascripttypescript)
- [Python](#python)
- [Rust](#rust)
- [Go](#go)
- [Java](#java)

---

## JavaScript/TypeScript

### Code Quality

#### Find console.log statements
```json
{
  "pattern": "console.log($$$ARGS)",
  "language": "javascript"
}
```
**Matches:** `console.log('test')`, `console.log(a, b, c)`

#### Find var declarations (prefer const/let)
```json
{
  "pattern": "var $NAME = $VALUE",
  "language": "javascript"
}
```
**Replace with:** `const $NAME = $VALUE`

#### Find == comparisons (prefer ===)
```json
{
  "pattern": "$A == $B",
  "language": "javascript"
}
```
**Replace with:** `$A === $B`

#### Find unused function parameters
```json
{
  "pattern": "function $NAME($$$PARAMS) { $$$BODY }",
  "where": [
    { "metavariable": "PARAMS", "regex": "^_" }
  ],
  "language": "javascript"
}
```

### Async/Await Patterns

#### Find Promise.then chains (convert to async/await)
```json
{
  "pattern": "$PROMISE.then($CALLBACK)",
  "language": "javascript"
}
```

#### Find missing await keywords
```json
{
  "pattern": "const $VAR = $ASYNC_FUNC()",
  "where": [
    { "metavariable": "ASYNC_FUNC", "regex": "^(fetch|axios|async)" }
  ],
  "language": "javascript"
}
```

#### Find async functions without try-catch
```json
{
  "pattern": "async function $NAME($$$PARAMS) { $$$BODY }",
  "language": "javascript"
}
```
**Note:** Use `not` constraint to exclude functions with try-catch

### React/JSX Patterns

#### Find components without key prop in lists
```json
{
  "pattern": "<$COMPONENT $$$ATTRS>",
  "language": "jsx"
}
```
**Add constraint:** `ATTRS` does not contain "key="

#### Find inline arrow functions in JSX (performance issue)
```json
{
  "pattern": "<$TAG onClick={() => $BODY}>",
  "language": "jsx"
}
```

#### Find useState without initial value
```json
{
  "pattern": "const [$STATE, $SETTER] = useState()",
  "language": "jsx"
}
```

### TypeScript Specific

#### Find any types (prefer specific types)
```json
{
  "pattern": "const $VAR: any = $VALUE",
  "language": "typescript"
}
```

#### Find non-null assertions (!)
```json
{
  "pattern": "$EXPR!",
  "language": "typescript"
}
```

#### Find missing return types
```json
{
  "pattern": "function $NAME($$$PARAMS) { $$$BODY }",
  "language": "typescript"
}
```
**Note:** Use constraint to check if return type annotation is missing

---

## Python

### Code Quality

#### Find print statements (use logging)
```json
{
  "pattern": "print($$$ARGS)",
  "language": "python"
}
```
**Replace with:** `logging.info($$$ARGS)`

#### Find bare except clauses
```json
{
  "pattern": "except:",
  "language": "python"
}
```
**Replace with:** `except Exception:`

#### Find mutable default arguments
```json
{
  "pattern": "def $NAME($$$PARAMS, $ARG=[]):
    $$$BODY",
  "language": "python"
}
```

### Type Hints

#### Find functions without type hints
```json
{
  "pattern": "def $NAME($$$PARAMS):
    $$$BODY",
  "language": "python"
}
```

#### Find missing return type annotations
```json
{
  "pattern": "def $NAME($$$PARAMS):
    return $VALUE",
  "language": "python"
}
```

### Modern Python

#### Find old-style string formatting
```json
{
  "pattern": "\"%s\" % $VAR",
  "language": "python"
}
```
**Replace with:** `f"{$VAR}"`

#### Find dict.has_key() (deprecated)
```json
{
  "pattern": "$DICT.has_key($KEY)",
  "language": "python"
}
```
**Replace with:** `$KEY in $DICT`

---

## Rust

### Ownership & Borrowing

#### Find unnecessary clones
```json
{
  "pattern": "$VAR.clone()",
  "language": "rust"
}
```

#### Find unwrap() calls (prefer ? operator)
```json
{
  "pattern": "$EXPR.unwrap()",
  "language": "rust"
}
```
**Replace with:** `$EXPR?`

#### Find expect() with generic messages
```json
{
  "pattern": "$EXPR.expect(\"error\")",
  "language": "rust"
}
```

### Error Handling

#### Find panic! in library code
```json
{
  "pattern": "panic!($$$ARGS)",
  "language": "rust"
}
```

#### Find Result types without error handling
```json
{
  "pattern": "let $VAR = $EXPR;",
  "where": [
    { "metavariable": "EXPR", "kind": "call_expression" }
  ],
  "language": "rust"
}
```

### Performance

#### Find Vec allocations in loops
```json
{
  "pattern": "for $ITEM in $ITER {
    let $VEC = Vec::new();
    $$$BODY
}",
  "language": "rust"
}
```

---

## Go

### Error Handling

#### Find ignored errors
```json
{
  "pattern": "$VAR, _ := $EXPR",
  "language": "go"
}
```

#### Find missing error checks
```json
{
  "pattern": "$VAR := $FUNC($$$ARGS)
$$$BODY",
  "where": [
    { "metavariable": "FUNC", "regex": "^(os\\.|io\\.|http\\.)" }
  ],
  "language": "go"
}
```

### Concurrency

#### Find goroutines without error handling
```json
{
  "pattern": "go func() {
    $$$BODY
}()",
  "language": "go"
}
```

#### Find channels without close()
```json
{
  "pattern": "$CH := make(chan $TYPE)",
  "language": "go"
}
```

### Code Quality

#### Find empty interfaces (interface{})
```json
{
  "pattern": "func $NAME($$$PARAMS interface{}) $$$RETURN {
    $$$BODY
}",
  "language": "go"
}
```

---

## Java

### Code Quality

#### Find System.out.println (use logger)
```json
{
  "pattern": "System.out.println($$$ARGS)",
  "language": "java"
}
```

#### Find == for string comparison
```json
{
  "pattern": "$STR1 == $STR2",
  "where": [
    { "metavariable": "STR1", "kind": "string_literal" }
  ],
  "language": "java"
}
```
**Replace with:** `$STR1.equals($STR2)`

#### Find raw types (missing generics)
```json
{
  "pattern": "List $VAR = new ArrayList()",
  "language": "java"
}
```
**Replace with:** `List<$TYPE> $VAR = new ArrayList<>()`

### Exception Handling

#### Find empty catch blocks
```json
{
  "pattern": "catch ($EXCEPTION $VAR) {
}",
  "language": "java"
}
```

#### Find catching Exception (too broad)
```json
{
  "pattern": "catch (Exception $VAR) {
    $$$BODY
}",
  "language": "java"
}
```

### Modern Java

#### Find old-style for loops (use enhanced for)
```json
{
  "pattern": "for (int $I = 0; $I < $ARRAY.length; $I++) {
    $$$BODY
}",
  "language": "java"
}
```

---

## Advanced Patterns

### Multi-Language Patterns

#### Find TODO comments
```json
{
  "pattern": "// TODO: $$$TEXT",
  "language": "javascript"
}
```
**Works in:** JavaScript, TypeScript, Java, C++, Rust, Go

#### Find magic numbers
```json
{
  "pattern": "$VAR = $NUMBER",
  "where": [
    { "metavariable": "NUMBER", "regex": "^[0-9]+$" },
    { "metavariable": "NUMBER", "not_equals": "0" },
    { "metavariable": "NUMBER", "not_equals": "1" }
  ],
  "language": "javascript"
}
```

### Structural Rules

#### Find functions with too many parameters
```json
{
  "id": "too-many-params",
  "language": "javascript",
  "pattern": "function $NAME($P1, $P2, $P3, $P4, $P5, $$$REST) { $$$BODY }",
  "message": "Function has too many parameters (>4)"
}
```

#### Find deeply nested code
```json
{
  "id": "deep-nesting",
  "language": "javascript",
  "rule": {
    "kind": "if_statement",
    "has": {
      "kind": "if_statement",
      "has": {
        "kind": "if_statement",
        "stopBy": "end"
      },
      "stopBy": "end"
    }
  },
  "message": "Deeply nested if statements (>3 levels)"
}
```

---

## Usage Tips

### Testing Patterns
Use `ast_explain_pattern` to test patterns before applying:
```json
{
  "pattern": "console.log($ARG)",
  "code": "console.log('test');",
  "language": "javascript"
}
```

### Combining Constraints
Use multiple constraints for precise matching:
```json
{
  "where": [
    { "metavariable": "NAME", "regex": "^test" },
    { "metavariable": "NAME", "not_regex": "Helper$" },
    { "metavariable": "VALUE", "kind": "string_literal" }
  ]
}
```

### Performance Tips
1. Specify language for faster parsing
2. Use specific paths instead of entire workspace
3. Add constraints to reduce false positives
4. Test patterns on small code samples first

---

## Contributing Patterns

Have a useful pattern? Submit a PR with:
1. Pattern JSON
2. Example matches
3. Suggested replacement (if applicable)
4. Language compatibility

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

