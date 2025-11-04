# Testing Procedure Guide: Small Repository Testing

This guide provides step-by-step instructions for executing comprehensive tests of the ast-grep MCP tools against small real-world repositories.

## Prerequisites

### Required Software

1. **ast-grep CLI**:
   ```bash
   npm install -g @ast-grep/cli
   # OR
   cargo install ast-grep
   ```

2. **Verify ast-grep installation**:
   ```bash
   ast-grep --version
   ```
   Expected output: `ast-grep X.Y.Z`

3. **Node.js/Bun**:
   - Node.js 16+ or Bun 1.0+ required
   - Verify: `node --version` or `bun --version`

4. **Project Dependencies**:
   ```bash
   cd D:\_Project\_mcp\tree-grep-mcp
   bun install
   ```

5. **MCP Server Verification**:
   ```bash
   bun run dev
   ```
   Ensure server starts without errors (test in separate terminal)

### Optional Tools

- **tokei**: For file counting - `cargo install tokei`
- **ripgrep**: For quick searches - `cargo install ripgrep`

---

## Workspace Setup

### Step 1: Create Test Workspace

Create a directory **outside** the project to avoid workspace conflicts:

**Note**: Set `TEST_REPOS_DIR` environment variable to your preferred location, or use the default paths shown below.

**Unix/Linux/Mac**:
```bash
export TEST_REPOS_DIR="$HOME/test-repos"
mkdir -p $TEST_REPOS_DIR
cd $TEST_REPOS_DIR
```

**Windows (PowerShell)**:
```powershell
$env:TEST_REPOS_DIR = "$env:USERPROFILE\test-repos"
New-Item -ItemType Directory -Force -Path $env:TEST_REPOS_DIR
cd $env:TEST_REPOS_DIR
```

**Windows (CMD)**:
```cmd
set TEST_REPOS_DIR=%USERPROFILE%\test-repos
mkdir %TEST_REPOS_DIR%
cd %TEST_REPOS_DIR%
```

### Step 2: Clone Repositories

Clone the 4 small test repositories into `${TEST_REPOS_DIR}`:

```bash
# Repository 1: chalk/chalk (JavaScript/TypeScript)
git clone https://github.com/chalk/chalk.git

# Repository 2: fastapi/typer (Python)
git clone https://github.com/fastapi/typer.git

# Repository 3: sharkdp/hyperfine (Rust)
git clone https://github.com/sharkdp/hyperfine.git

# Repository 4: sindresorhus/execa (JavaScript/TypeScript)
git clone https://github.com/sindresorhus/execa.git
```

After cloning, your `${TEST_REPOS_DIR}` should contain: `chalk/`, `typer/`, `hyperfine/`, `execa/`

### Step 3: Verify Clones

```bash
ls -la
```

Expected output: 4 directories (chalk, typer, hyperfine, execa)

### Step 4: Get File Counts

Using tokei (recommended):
```bash
tokei chalk typer hyperfine execa
```

Alternative using find:
```bash
cd chalk
find . -type f -name "*.js" -o -name "*.ts" | wc -l
cd ../typer
find . -type f -name "*.py" | wc -l
cd ../hyperfine
find . -type f -name "*.rs" | wc -l
cd ../execa
find . -type f -name "*.js" -o -name "*.ts" | wc -l
```

Record these counts in SMALL_REPO_RESULTS.md.

---

## Testing Methodology

You have three options for executing tests:

### Option A: Manual Testing via MCP Client (Recommended for Initial Testing)

**Setup**:
1. Configure Claude Desktop or another MCP client with this server
2. Start the MCP server: `bun run dev`
3. Open MCP client and verify connection

**Execution**:
- For each test scenario, send tool invocation requests through the MCP client
- Copy results to SMALL_REPO_RESULTS.md
- Measure execution time manually by noting start/end times

**Pros**: Real-world usage simulation, full integration test  
**Cons**: Manual metric collection, time-consuming

---

### Option B: Programmatic Testing via Node.js Script (Recommended for Automation)

**Create test script** (`test-small-repos-runner.js`):

Note: You can use either TypeScript files directly with `tsx`/Bun, or use the compiled JavaScript files from the `build/` directory after running `npm run build`.

**Option A - Using TypeScript files with tsx/Bun**:
```javascript
import { SearchTool } from '../src/tools/search.ts';
import { ReplaceTool } from '../src/tools/replace.ts';
import { ScanTool } from '../src/tools/scan.ts';
import { AstGrepBinaryManager } from '../src/core/binary-manager.ts';
import { WorkspaceManager } from '../src/core/workspace-manager.ts';
```

**Option B - Using compiled JavaScript (after `npm run build`)**:
```javascript
import { SearchTool } from '../build/tools/search.js';
import { ReplaceTool } from '../build/tools/replace.js';
import { ScanTool } from '../build/tools/scan.js';
import { AstGrepBinaryManager } from '../build/core/binary-manager.js';
import { WorkspaceManager } from '../build/core/workspace-manager.js';
```

**Rest of the script** (works with either import option):

// Initialize tools
const binaryManager = new AstGrepBinaryManager({ useSystem: true });
await binaryManager.initialize();

const workspaceManager = new WorkspaceManager();
// Use environment variable or replace with your actual path
const testReposDir = process.env.TEST_REPOS_DIR || `${process.env.HOME}/test-repos`;
await workspaceManager.addWorkspace(`${testReposDir}/chalk`);

const searchTool = new SearchTool(binaryManager, workspaceManager);
const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
const scanTool = new ScanTool(binaryManager, workspaceManager);

// Example test
console.log('Testing chalk: Function Definitions');
const startTime = Date.now();
const startMem = process.memoryUsage();

try {
    const result = await searchTool.execute({
        pattern: 'function $NAME($$$PARAMS) { $$$BODY }',
        paths: ['.'],
        language: 'javascript',
        context: 3,
        maxMatches: 100
    });
    
    const executionTime = Date.now() - startTime;
    const endMem = process.memoryUsage();
    
    console.log(`Execution Time: ${executionTime}ms`);
    console.log(`Matches: ${result.summary.totalMatches}`);
    console.log(`Skipped Lines: ${result.summary.skippedLines}`);
    console.log(`Memory Delta: ${(endMem.heapUsed - startMem.heapUsed) / 1024 / 1024}MB`);
    console.log('\nSample Matches:', JSON.stringify(result.matches.slice(0, 3), null, 2));
} catch (error) {
    console.error('Test failed:', error);
}

// Repeat for all test scenarios...
```

**Run**:

With TypeScript files:
```bash
tsx test-small-repos-runner.js
# or
bun run test-small-repos-runner.js
```

With compiled JavaScript (requires `npm run build` first):
```bash
node test-small-repos-runner.js
```

**Pros**: Automated metrics, consistent results, reusable  
**Cons**: More setup required

---

### Option C: Integration Test Extension (Recommended for CI/CD)

**Extend** `tests/integration.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { SearchTool } from '../src/tools/search';

describe('Small Repository Tests', () => {
    test('chalk: Function Definitions', async () => {
        // Test implementation
    });
    
    // Add more tests...
});
```

**Run**:
```bash
bun test tests/integration.test.ts
```

**Pros**: Integrated with test framework, automated assertions  
**Cons**: Limited to test framework capabilities

---

## Test Execution Template

Use this template for each test scenario:

### Step 1: Navigate to Repository

```bash
cd ${TEST_REPOS_DIR}/chalk
# Or on Windows: cd %TEST_REPOS_DIR%\chalk
```

### Step 2: Execute Search Test

**Programmatic approach**:
```javascript
const startTime = Date.now();
const startMem = process.memoryUsage();

const result = await searchTool.execute({
    pattern: 'function $NAME($$$PARAMS) { $$$BODY }',
    paths: ['.'],
    language: 'javascript',
    context: 3,
    maxMatches: 100
});

const executionTime = Date.now() - startTime;
const memoryUsed = (process.memoryUsage().heapUsed - startMem.heapUsed) / 1024 / 1024;
```

**MCP client approach**:
Send JSON request:
```json
{
  "tool": "ast_search",
  "arguments": {
    "pattern": "function $NAME($$$PARAMS) { $$$BODY }",
    "paths": ["."],
    "language": "javascript",
    "context": 3,
    "maxMatches": 100
  }
}
```

### Step 3: Record Results

Document in SMALL_REPO_RESULTS.md:
- Execution time: `${executionTime}` ms
- Match count: `result.summary.totalMatches`
- Skipped lines: `result.summary.skippedLines`
- Memory usage: `${memoryUsed}` MB
- Sample matches: `result.matches.slice(0, 3)`

### Step 4: Execute Replacement Test (Dry-Run)

```javascript
const replaceResult = await replaceTool.execute({
    pattern: 'console.log($$$ARGS)',
    replacement: 'logger.info($$$ARGS)',
    paths: ['.'],
    language: 'javascript',
    dryRun: true
});

console.log('Potential Changes:', replaceResult.summary.totalReplacements);
console.log('Diff Preview:', replaceResult.diff);
```

### Step 5: Execute Rule Test

```javascript
const ruleResult = await scanTool.execute({
    id: 'no-console-log',
    language: 'javascript',
    pattern: 'console.log($$$ARGS)',
    message: 'Avoid console.log in production code',
    severity: 'warning',
    paths: ['.']
});

console.log('Findings:', ruleResult.summary.totalFindings);
console.log('Generated YAML:', ruleResult.yaml);
```

### Step 6: Document Findings

Copy results to SMALL_REPO_RESULTS.md under the appropriate test scenario section.

---

## Specific Test Scenarios

### Repository 1: chalk/chalk (JavaScript/TypeScript)

#### Test 1: Function Definitions

**Pattern**: `function $NAME($$$PARAMS) { $$$BODY }`  
**Language**: `javascript`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "function $NAME($$$PARAMS) { $$$BODY }",
  "paths": ["."],
  "language": "javascript",
  "context": 3,
  "maxMatches": 100
}
```

**Expected Results**:
- Find all function declarations
- Exclude arrow functions and function expressions
- Capture function name, parameters, and body

**Validation Checklist**:
- [ ] All function declarations found
- [ ] No arrow functions in results
- [ ] Metavariables captured correctly
- [ ] Sample matches reviewed for accuracy

---

#### Test 2: Console.log Detection

**Pattern**: `console.log($$$ARGS)`  
**Language**: `javascript`  
**Tool**: `ast_search` + `ast_replace`

**Search Parameters**:
```json
{
  "pattern": "console.log($$$ARGS)",
  "paths": ["."],
  "language": "javascript",
  "context": 2
}
```

**Expected Search Results**:
- Find all console.log statements
- Capture arguments

**Replacement Test**:

**Parameters**:
```json
{
  "pattern": "console.log($$$ARGS)",
  "replacement": "logger.info($$$ARGS)",
  "paths": ["."],
  "language": "javascript",
  "dryRun": true
}
```

**Expected Replacement Results**:
- Show diff preview for each match
- Preserve argument structure
- No actual file changes (dry-run)

**Validation Checklist**:
- [ ] All console.log found
- [ ] Arguments captured correctly
- [ ] Diff preview is clean and correct
- [ ] Replacement preserves formatting

---

#### Test 3: Arrow Functions

**Pattern**: `const $NAME = ($$$ARGS) => $$$BODY`  
**Language**: `javascript`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "const $NAME = ($$$ARGS) => $$$BODY",
  "paths": ["."],
  "language": "javascript",
  "context": 2
}
```

**Expected Results**:
- Find arrow function assignments
- Capture variable name, arguments, and body

**Edge Cases to Test**:
- Single argument without parentheses: `const x = y => y + 1`
- Multi-line arrow function bodies
- Async arrow functions: `const x = async () => {}`
- Object return shorthand: `const x = () => ({ key: value })`

**Validation Checklist**:
- [ ] Multi-arg arrow functions found
- [ ] Single-arg without parens: Expected to miss (document)
- [ ] Multi-line bodies handled correctly
- [ ] Async arrow functions detected

---

#### Test 4: TypeScript Interfaces

**Pattern**: `interface $NAME { $$$PROPS }`  
**Language**: `typescript`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "interface $NAME { $$$PROPS }",
  "paths": ["."],
  "language": "typescript",
  "context": 3
}
```

**Expected Results**:
- Find interface definitions
- Exclude type aliases
- Capture interface name and properties

**Validation Checklist**:
- [ ] All interfaces found
- [ ] Type aliases excluded
- [ ] Generic interfaces handled
- [ ] Exported interfaces detected

---

#### Test 5: Module Exports

**Pattern**: `module.exports = $EXPR`  
**Language**: `javascript`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "module.exports = $EXPR",
  "paths": ["."],
  "language": "javascript",
  "context": 2
}
```

**Expected Results**:
- Find CommonJS exports
- Exclude ES6 export statements

**Validation Checklist**:
- [ ] CommonJS exports found
- [ ] ES6 exports not matched (correct)
- [ ] Export expressions captured

---

#### Test 6: Console.log Rule with Severity

**Tool**: `ast_run_rule`

**Parameters**:
```json
{
  "id": "no-console-log",
  "language": "javascript",
  "pattern": "console.log($$$ARGS)",
  "message": "Avoid console.log in production code",
  "severity": "warning",
  "note": "Use a proper logging library instead",
  "paths": ["."]
}
```

**Expected Results**:
- Generate valid YAML rule
- Find all console.log violations
- Apply warning severity
- Include message and note

**Validation Checklist**:
- [ ] YAML generated correctly
- [ ] All violations found
- [ ] Severity applied
- [ ] Message and note included
- [ ] YAML is valid (paste into ast-grep CLI to verify)

---

### Repository 2: fastapi/typer (Python)

#### Test 1: Function Decorators

**Pattern**: `@$DECORATOR\ndef $FUNC($$$ARGS): $$$BODY`  
**Language**: `python`  
**Tool**: `ast_search`

**Note**: Backslash escapes the newline in the pattern.

**Parameters**:
```json
{
  "pattern": "@$DECORATOR\\ndef $FUNC($$$ARGS): $$$BODY",
  "paths": ["."],
  "language": "python",
  "context": 4
}
```

**Expected Results**:
- Find decorated function definitions
- Capture decorator name, function name, arguments, and body

**Edge Cases to Test**:
- Decorator with arguments: `@app.command(name='test')`
- Stacked decorators: Multiple `@` lines
- Class method decorators: `@staticmethod`, `@classmethod`

**Validation Checklist**:
- [ ] Decorated functions found
- [ ] Decorator metavariable captured
- [ ] Multi-line decorators handled
- [ ] Stacked decorators handled

---

#### Test 2: Type-Annotated Functions

**Pattern**: `def $NAME($$$PARAMS): $$$BODY`  
**Language**: `python`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "def $NAME($$$PARAMS): $$$BODY",
  "paths": ["."],
  "language": "python",
  "context": 3
}
```

**Expected Results**:
- Find all function definitions
- Include those with type hints

**Validation Checklist**:
- [ ] All functions found
- [ ] Type hints preserved in output
- [ ] Async functions included

---

#### Test 3: Class Inheritance

**Pattern**: `class $NAME($BASE): $BODY`  
**Language**: `python`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "class $NAME($BASE): $BODY",
  "paths": ["."],
  "language": "python",
  "context": 3
}
```

**Expected Results**:
- Find classes with inheritance
- Capture base class

**Validation Checklist**:
- [ ] All inherited classes found
- [ ] Multiple inheritance handled
- [ ] Base class captured

---

#### Test 4: Import Statements

**Pattern**: `from $MODULE import $ITEMS`  
**Language**: `python`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "from $MODULE import $ITEMS",
  "paths": ["."],
  "language": "python",
  "context": 1
}
```

**Expected Results**:
- Find from-import statements
- Capture module and imported items

**Validation Checklist**:
- [ ] All from-imports found
- [ ] Relative imports captured
- [ ] Multiple items captured

---

#### Test 5: Main Guard Pattern

**Pattern**: `if __name__ == "__main__": $BODY`  
**Language**: `python`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "if __name__ == \"__main__\": $BODY",
  "paths": ["."],
  "language": "python",
  "context": 2
}
```

**Expected Results**:
- Find main entry point idiom
- Capture body

**Validation Checklist**:
- [ ] Main guards found
- [ ] Body captured correctly

---

#### Test 6: Decorator Constraint Rule

**Tool**: `ast_run_rule`

**Parameters**:
```json
{
  "id": "find-app-commands",
  "language": "python",
  "pattern": "@$DECORATOR\\ndef $FUNC($$$ARGS): $$$BODY",
  "where": {
    "DECORATOR": {
      "regex": "app\\\\..*"
    }
  },
  "message": "Found app command decorator",
  "severity": "info",
  "paths": ["."]
}
```

**Expected Results**:
- Find only decorators matching `app.*`
- Filter out other decorators

**Validation Checklist**:
- [ ] Only @app.* decorators found
- [ ] Other decorators excluded
- [ ] Regex constraint applied correctly
- [ ] YAML generated with constraint

---

### Repository 3: sharkdp/hyperfine (Rust)

#### Test 1: Function Definitions

**Pattern**: `fn $NAME($$$PARAMS) -> $RET { $$$BODY }`  
**Language**: `rust`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "fn $NAME($$$PARAMS) -> $RET { $$$BODY }",
  "paths": ["."],
  "language": "rust",
  "context": 3
}
```

**Expected Results**:
- Find function definitions with return types
- Capture name, parameters, return type, and body

**Edge Cases to Test**:
- Generic functions: `fn process<T>(data: T) -> T`
- Lifetime parameters: `fn borrow<'a>(data: &'a str) -> &'a str`
- Async functions: `async fn fetch() -> Result<Data>`
- Functions without return type: `fn log(msg: &str) { ... }` (expected to miss)

**Validation Checklist**:
- [ ] Functions with return types found
- [ ] Generic functions handled
- [ ] Lifetime parameters handled
- [ ] Functions without return type missed (expected)

---

#### Test 2: Match Expressions

**Pattern**: `match $EXPR { $ARMS }`  
**Language**: `rust`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "match $EXPR { $ARMS }",
  "paths": ["."],
  "language": "rust",
  "context": 4
}
```

**Expected Results**:
- Find match statements
- Capture matched expression and arms

**Validation Checklist**:
- [ ] All match expressions found
- [ ] Nested matches handled
- [ ] Match arms captured

---

#### Test 3: Unwrap and Expect Patterns

**Pattern 1**: `$EXPR.unwrap()`  
**Pattern 2**: `$EXPR.expect($MSG)`  
**Language**: `rust`  
**Tool**: `ast_search` (two separate tests)

**Unwrap Parameters**:
```json
{
  "pattern": "$EXPR.unwrap()",
  "paths": ["."],
  "language": "rust",
  "context": 2
}
```

**Expect Parameters**:
```json
{
  "pattern": "$EXPR.expect($MSG)",
  "paths": ["."],
  "language": "rust",
  "context": 2
}
```

**Expected Results**:
- Find all unwrap() calls
- Find all expect() calls with messages

**Replacement Test (Unwrap)**:

**Parameters**:
```json
{
  "pattern": "$EXPR.unwrap()",
  "replacement": "$EXPR?",
  "paths": ["."],
  "language": "rust",
  "dryRun": true
}
```

**Note**: This replacement may not be semantically correct in all cases (requires function to return Result).

**Validation Checklist**:
- [ ] All unwrap() found
- [ ] All expect() found
- [ ] Replacement shows diff (even if not always correct)

---

#### Test 4: Struct Definitions

**Pattern**: `struct $NAME { $$$FIELDS }`  
**Language**: `rust`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "struct $NAME { $$$FIELDS }",
  "paths": ["."],
  "language": "rust",
  "context": 3
}
```

**Expected Results**:
- Find named struct definitions
- Capture name and fields

**Edge Cases**:
- Tuple structs: `struct Point(f64, f64);` (expected to miss)

**Validation Checklist**:
- [ ] Named structs found
- [ ] Fields captured
- [ ] Tuple structs not matched (expected)

---

#### Test 5: Trait Implementations

**Pattern**: `impl $TRAIT for $TYPE { $$$METHODS }`  
**Language**: `rust`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "impl $TRAIT for $TYPE { $$$METHODS }",
  "paths": ["."],
  "language": "rust",
  "context": 4
}
```

**Expected Results**:
- Find trait implementations
- Capture trait name, type, and methods

**Validation Checklist**:
- [ ] All trait impls found
- [ ] Generic impls handled
- [ ] Trait and type captured

---

#### Test 6: Error Handling Rule

**Tool**: `ast_run_rule`

**Parameters**:
```json
{
  "id": "avoid-unwrap",
  "language": "rust",
  "pattern": "$EXPR.unwrap()",
  "message": "Avoid unwrap(), use ? or expect() with descriptive message",
  "severity": "warning",
  "note": "unwrap() causes panics on errors",
  "paths": ["."]
}
```

**Expected Results**:
- Find all unwrap() calls
- Apply warning severity
- Generate YAML rule

**Validation Checklist**:
- [ ] All unwrap() violations found
- [ ] YAML generated correctly
- [ ] Message and note included

---

#### Test 7: Deprecated APIs Detection

**Pattern**: Function calls with @deprecated JSDoc or deprecated in comments  
**Language**: `javascript`  
**Tool**: `ast_run_rule`

This test scenario detects potentially deprecated API usage by finding functions or methods that may have been marked as deprecated in documentation or comments.

**Approach 1 - JSDoc @deprecated tag detection**:

Search for functions with @deprecated JSDoc comments:
```yaml
id: detect-deprecated-jsdoc
language: javascript
rule:
  all:
    - pattern: |
        /**
         * @deprecated $MSG
         */
        function $NAME($$$PARAMS) { $$$BODY }
message: "Function marked as @deprecated in JSDoc"
severity: warning
note: "This function is deprecated. Check documentation for replacement."
```

**Approach 2 - Specific deprecated method patterns**:

For chalk specifically, detect usage of old API patterns (e.g., if chalk had deprecated certain methods):
```json
{
  "id": "chalk-deprecated-methods",
  "language": "javascript",
  "pattern": "$CHALK.$METHOD($$$ARGS)",
  "where": {
    "METHOD": {
      "regex": "^(supportsColor|hasBasic|has256|has16m)$"
    }
  },
  "message": "Potentially deprecated chalk method",
  "severity": "info",
  "note": "Verify if this method is still supported in current chalk version",
  "paths": ["."]
}
```

**Approach 3 - Comment-based deprecation markers**:

Search for inline deprecation comments:
```bash
# Use ast-grep to find functions with DEPRECATED comments
ast-grep -p 'function $NAME($$$ARGS) { $$$BODY }' -l javascript \
  --json | grep -i deprecated
```

**Expected Results**:
- Find functions marked with @deprecated
- Detect usage of deprecated methods
- Generate warnings for deprecated API calls
- Provide actionable notes for developers

**Validation Checklist**:
- [ ] Deprecated markers correctly identified
- [ ] No false positives from non-deprecated code
- [ ] YAML rule generates valid output
- [ ] Messages provide helpful guidance

**Note**: Since deprecation patterns vary by library and project, this test may need adjustment based on actual chalk codebase conventions.

---

### Repository 4: sindresorhus/execa (JavaScript/TypeScript)

#### Test 1: Async Functions

**Pattern**: `async function $NAME($$$PARAMS) { $$$BODY }`  
**Language**: `javascript`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "async function $NAME($$$PARAMS) { $$$BODY }",
  "paths": ["."],
  "language": "javascript",
  "context": 3
}
```

**Expected Results**:
- Find async function declarations
- Capture name, parameters, and body

**Validation Checklist**:
- [ ] All async functions found
- [ ] Async arrow functions not matched (expected)

---

#### Test 2: Await Expressions

**Pattern**: `await $EXPR`  
**Language**: `javascript`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "await $EXPR",
  "paths": ["."],
  "language": "javascript",
  "context": 1
}
```

**Expected Results**:
- Find all await expressions
- Capture awaited expression

**Validation Checklist**:
- [ ] All await expressions found
- [ ] Awaited expressions captured

---

#### Test 3: Try-Catch Blocks

**Pattern**: `try { $$$TRY } catch ($ERR) { $$$CATCH }`  
**Language**: `javascript`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "try { $$$TRY } catch ($ERR) { $$$CATCH }",
  "paths": ["."],
  "language": "javascript",
  "context": 3
}
```

**Expected Results**:
- Find try-catch blocks
- Capture try body, error parameter, and catch body

**Edge Cases**:
- Try-catch-finally blocks (finally clause may not be captured)

**Validation Checklist**:
- [ ] All try-catch found
- [ ] Error parameter captured
- [ ] Finally blocks noted (if any)

---

#### Test 4: Promise Patterns

**Pattern**: `new Promise(($RESOLVE, $REJECT) => { $$$BODY })`  
**Language**: `javascript`  
**Tool**: `ast_search`

**Parameters**:
```json
{
  "pattern": "new Promise(($RESOLVE, $REJECT) => { $$$BODY })",
  "paths": ["."],
  "language": "javascript",
  "context": 3
}
```

**Expected Results**:
- Find Promise constructor calls
- Capture resolve, reject parameters, and body

**Validation Checklist**:
- [ ] All Promise constructors found
- [ ] Parameters captured correctly

---

#### Test 5: Var to Const Modernization

**Pattern**: `var $NAME = $VALUE`  
**Replacement**: `const $NAME = $VALUE`  
**Language**: `javascript`  
**Tool**: `ast_replace`  
**Dry Run**: `true`

**Parameters**:
```json
{
  "pattern": "var $NAME = $VALUE",
  "replacement": "const $NAME = $VALUE",
  "paths": ["."],
  "language": "javascript",
  "dryRun": true
}
```

**Expected Results**:
- Find all var declarations
- Show replacement diff
- No actual changes (dry-run)

**Edge Cases**:
- Var in loops may need `let` instead of `const` (document)

**Validation Checklist**:
- [ ] All var declarations found
- [ ] Diff shows clean replacement
- [ ] Variable name and value preserved
- [ ] Edge case of loop vars noted

---

#### Test 6: Export Detection Rule

**Tool**: `ast_run_rule`

**Parameters**:
```json
{
  "id": "find-exports",
  "language": "javascript",
  "pattern": "export { $$$EXPORTS }",
  "message": "Found named export",
  "severity": "info",
  "paths": ["."]
}
```

**Expected Results**:
- Find named export statements
- Generate YAML rule

**Validation Checklist**:
- [ ] All named exports found
- [ ] YAML generated correctly

---

## Metrics Collection

### Performance Metrics to Collect

For each test, record the following:

1. **Execution Time** (ms):
   ```javascript
   const startTime = Date.now();
   // ... execute test
   const executionTime = Date.now() - startTime;
   ```

2. **Memory Usage** (MB):
   ```javascript
   const startMem = process.memoryUsage();
   // ... execute test
   const endMem = process.memoryUsage();
   const memoryUsed = (endMem.heapUsed - startMem.heapUsed) / 1024 / 1024;
   ```

3. **Match Count**:
   ```javascript
   const matchCount = result.summary.totalMatches;
   ```

4. **Skipped Lines**:
   ```javascript
   const skippedLines = result.summary.skippedLines;
   ```

5. **File Count** (from repository analysis):
   ```bash
   tokei --output json . | jq '.Total.code'
   ```

### Accuracy Metrics to Assess

1. **False Positives**: Manually review 5-10 sample matches to check for incorrect matches
2. **False Negatives**: Check if expected patterns were missed (requires domain knowledge)
3. **Pattern Correctness**: Verify matches are semantically correct

### Quality Metrics

1. **Diff Preview Quality** (for replacements):
   - Is the diff clear and readable?
   - Are metavariables correctly substituted?
   - Is formatting preserved?

2. **YAML Generation Correctness** (for rules):
   - Is the generated YAML valid?
   - Are all fields included correctly?
   - Can the YAML be used with ast-grep CLI?

3. **Error Message Clarity** (if errors occur):
   - Is the error message helpful?
   - Does it suggest a fix?

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: ast-grep not found

**Error**: `command not found: ast-grep` or `ast-grep is not recognized`

**Solution**:
1. Install ast-grep globally:
   ```bash
   npm install -g @ast-grep/cli
   # OR
   cargo install ast-grep
   ```
2. Verify installation:
   ```bash
   which ast-grep  # Unix/Mac
   where ast-grep  # Windows
   ```
3. Check PATH:
   ```bash
   echo $PATH  # Unix/Mac
   echo %PATH%  # Windows
   ```

---

#### Issue 2: Language not supported

**Error**: `Unsupported language: [language]`

**Solution**:
1. Check supported languages:
   ```bash
   ast-grep --help
   ```
2. Verify language name spelling (e.g., `javascript`, not `js`)
3. See ast-grep documentation: https://ast-grep.github.io/guide/introduction.html#supported-languages

**Supported Languages**:
- JavaScript: `javascript`, `js`, `jsx`
- TypeScript: `typescript`, `ts`, `tsx`
- Python: `python`, `py`
- Rust: `rust`, `rs`
- Java: `java`
- Go: `go`
- C/C++: `c`, `cpp`, `cxx`
- And more...

---

#### Issue 3: Pattern syntax errors

**Error**: `Invalid pattern` or `Parse error`

**Solution**:
1. Test pattern with inline code first:
   ```bash
   ast-grep -p 'function $NAME() {}' -l javascript -c 'function test() {}'
   ```
2. Use ast-grep playground: https://ast-grep.github.io/playground.html
3. Check AST_GREP_TEXT.md for pattern examples
4. Verify metavariable syntax:
   - Single-node: `$VAR`
   - Multi-node: `$$VAR`
   - Named: `$VAR_NAME`

**Common Pattern Mistakes**:
- Forgetting to escape special characters
- Incorrect metavariable naming
- Missing braces or parentheses
- Whitespace sensitivity

---

#### Issue 4: Timeout errors

**Error**: `Command timed out after Xms`

**Solution**:
1. Increase timeout:
   ```javascript
   const result = await searchTool.execute({
       // ... parameters
       timeoutMs: 60000  // 60 seconds
   });
   ```
2. Reduce search scope:
   - Limit paths: `["src/"]` instead of `["."]`
   - Reduce maxMatches: `maxMatches: 50`
3. Check for infinite loops or hanging processes

---

#### Issue 5: Memory issues

**Error**: `JavaScript heap out of memory`

**Solution**:
1. Reduce maxMatches:
   ```json
   {
     "maxMatches": 50
   }
   ```
2. Test smaller directories first
3. Increase Node.js memory:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" bun run test-script.js
   ```
4. Monitor memory usage:
   ```javascript
   console.log(process.memoryUsage());
   ```

---

#### Issue 6: Workspace path errors

**Error**: `Path outside workspace` or `Invalid workspace`

**Solution**:
1. Ensure paths are within configured workspace:
   ```javascript
   const testReposDir = process.env.TEST_REPOS_DIR || `${process.env.HOME}/test-repos`;
   await workspaceManager.addWorkspace(`${testReposDir}/chalk`);
   ```
2. Use absolute paths:
   ```javascript
   paths: [`${testReposDir}/chalk/src`]
   ```
3. Check WorkspaceManager configuration
4. Verify directory exists:
   ```bash
   ls -la ${TEST_REPOS_DIR}/chalk  # Unix
   dir %TEST_REPOS_DIR%\chalk      # Windows
   ```

---

#### Issue 7: No matches found (unexpected)

**Error**: No error, but `totalMatches: 0` when matches expected

**Solution**:
1. Verify pattern syntax with simpler pattern first
2. Check language parameter matches file types
3. Test pattern with ast-grep CLI directly:
   ```bash
   cd ${TEST_REPOS_DIR}/chalk
   ast-grep -p 'function $NAME() {}' -l javascript
   ```
4. Verify files exist in search paths
5. Check if pattern is too specific

---

#### Issue 8: Parsing errors / skipped lines

**Error**: `skippedLines: X` in results

**Explanation**: Some files failed to parse (syntax errors, unsupported syntax)

**Solution**:
1. This is usually normal - not all files parse cleanly
2. Check which files were skipped (if critical)
3. Document in results
4. If skipped lines are high (>10%), investigate:
   - Are files in the correct language?
   - Are there generated files with unusual syntax?

---

## Results Documentation Template

Use this template for each test in SMALL_REPO_RESULTS.md:

```markdown
### Test X: [Test Name]

**Pattern**: `[pattern]`  
**Tool**: ast_search | ast_replace | ast_run_rule  
**Language**: [language]  

**Parameters**:
- paths: [paths]
- context: [context]
- maxMatches: [maxMatches]
- dryRun: [true/false]

**Results**:
- **Execution Time**: Xms
- **Matches Found**: X
- **Skipped Lines**: X
- **Memory Usage**: XMB

**Sample Matches**:
```
[file:line] [code snippet]
[file:line] [code snippet]
[file:line] [code snippet]
```

**Accuracy Assessment**:
- **False Positives**: [count/description]
- **False Negatives**: [count/description]
- **Overall Accuracy**: [High/Medium/Low]

**Edge Cases Encountered**:
- [Description of edge case 1]
- [Description of edge case 2]

**Issues/Notes**:
- [Any problems or unexpected behavior]
```

---

## Final Checklist

Before completing testing, ensure:

### Repository Setup
- [ ] All 4 repositories cloned successfully
- [ ] File counts verified with tokei or similar
- [ ] Repository sizes recorded
- [ ] Language distributions documented

### Test Execution
- [ ] All test scenarios executed (6 per repo = 24 total)
- [ ] Performance metrics collected for each test
- [ ] Sample matches saved for each test
- [ ] Edge cases documented
- [ ] Issues and failures recorded

### Results Documentation
- [ ] SMALL_REPO_RESULTS.md created and populated
- [ ] All sections filled in with actual data
- [ ] Cross-repository analysis completed
- [ ] Performance comparison tables filled
- [ ] Accuracy assessment completed
- [ ] Tool-specific findings documented
- [ ] Language-specific observations recorded

### Quality Assurance
- [ ] Results reviewed for completeness
- [ ] Metrics double-checked for accuracy
- [ ] Sample matches verified
- [ ] Edge cases and issues clearly documented
- [ ] Recommendations drafted

### Final Steps
- [ ] Document committed to repository
- [ ] Results shared with team
- [ ] Next steps identified
- [ ] Prepare for medium repository testing phase

---

## Additional Resources

**Project Documentation**:
- [TEST_REPOSITORIES.md](./TEST_REPOSITORIES.md) - Repository details and test scenarios
- [AST_GREP_TEXT.md](../AST_GREP_TEXT.md) - Pattern examples and syntax guide
- [EDGE_CASES_AND_IMPROVEMENTS.md](../EDGE_CASES_AND_IMPROVEMENTS.md) - Known edge cases

**ast-grep Documentation**:
- [Introduction](https://ast-grep.github.io/guide/introduction.html)
- [Pattern Syntax](https://ast-grep.github.io/guide/pattern-syntax.html)
- [Rule Configuration](https://ast-grep.github.io/guide/rule-config.html)
- [API Reference](https://ast-grep.github.io/reference/api.html)
- [Playground](https://ast-grep.github.io/playground.html)

**Tool Source Code**:
- [src/tools/search.ts](../src/tools/search.ts)
- [src/tools/replace.ts](../src/tools/replace.ts)
- [src/tools/scan.ts](../src/tools/scan.ts)

---

**End of Testing Procedure Guide**
