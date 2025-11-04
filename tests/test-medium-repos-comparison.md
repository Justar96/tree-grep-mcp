# Medium Repository Testing Procedure - MCP vs CLI Comparison Guide

**Document Version**: 1.0  
**Testing Phase**: Medium Repositories (400-1500 files)  
**Methodology**: Dual execution approach (MCP + CLI)  
**Expected Duration**: 2-4 days

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Workspace Setup](#workspace-setup)
3. [Comparison Testing Methodology](#comparison-testing-methodology)
4. [Test Scenarios by Repository](#test-scenarios-by-repository)
5. [Comparison Analysis Template](#comparison-analysis-template)
6. [Complex Pattern Testing](#complex-pattern-testing)
7. [Troubleshooting](#troubleshooting)
8. [Automation Script](#automation-script)
9. [Final Checklist](#final-checklist)
10. [Expected Outcomes](#expected-outcomes)

---

## Prerequisites

Before starting medium repository testing, ensure all requirements are met:

### Software Requirements

**ast-grep Installation**:
```bash
# Verify ast-grep is installed and accessible
ast-grep --version

# Expected output: ast-grep 0.15.0 or higher
```

**MCP Server Setup**:
```bash
# Navigate to project directory
cd D:\_Project\_mcp\tree-grep-mcp

# Install dependencies
bun install

# Verify server can start
bun run dev

# Expected: Server starts without errors
```

**Node.js/Bun**:
```bash
# Verify Node.js
node --version
# Expected: v18.0.0 or higher

# Verify Bun
bun --version
# Expected: 1.0.0 or higher
```

**Python** (for test automation):
```bash
python --version
# Expected: Python 3.8 or higher
```

### System Requirements

- **Disk Space**: 5-10 GB for cloned repositories
- **RAM**: 8 GB+ recommended (16 GB ideal for large Go repository)
- **CPU**: Multi-core processor recommended for faster testing
- **Network**: Stable internet connection for cloning repositories

### Tools for Metrics Collection

**tokei** (for file counting):
```bash
# Install tokei for code statistics
# Windows: choco install tokei
# macOS: brew install tokei
# Linux: cargo install tokei

# Verify installation
tokei --version
```

**time command** (for CLI timing):
```bash
# Windows: Use PowerShell Measure-Command
# Linux/macOS: Built-in time command

# Example usage:
time ast-grep --version
```

**jq** (for JSON parsing):
```bash
# Install jq for JSON processing
# Windows: choco install jq
# macOS: brew install jq
# Linux: sudo apt-get install jq

# Verify installation
jq --version
```

### Comparison Setup

This testing phase differs from small repository testing by introducing **dual execution** for every test:

1. **Execute via MCP Tool**: Run pattern through MCP server
2. **Execute via CLI**: Run identical pattern through ast-grep CLI
3. **Compare Results**: Accuracy, performance, error handling
4. **Document Findings**: Record in MEDIUM_REPO_RESULTS.md

The goal is to validate that MCP tools accurately wrap ast-grep functionality.

---

## Workspace Setup

### Create Test Workspace

```bash
# Create dedicated directory for medium repository testing
mkdir D:\_Project\_test-repos\medium
cd D:\_Project\_test-repos\medium
```

### Clone Repositories

Clone all 4 medium repositories from [TEST_REPOSITORIES.md](./TEST_REPOSITORIES.md):

**Repository 1: expressjs/express (JavaScript)**
```bash
git clone https://github.com/expressjs/express.git
cd express
git log --oneline -1  # Record commit hash
tokei  # Count files and lines
cd ..
```

**Repository 2: pallets/flask (Python)**
```bash
git clone https://github.com/pallets/flask.git
cd flask
git log --oneline -1
tokei
cd ..
```

**Repository 3: gohugoio/hugo (Go)**
```bash
git clone https://github.com/gohugoio/hugo.git
cd hugo
git log --oneline -1
tokei
cd ..
```

**Repository 4: fastify/fastify (JavaScript/TypeScript)**
```bash
git clone https://github.com/fastify/fastify.git
cd fastify
git log --oneline -1
tokei
cd ..
```

### Verify Clones

**File Count Verification**:
```bash
# For each repository, count files
tokei express
tokei flask
tokei hugo
tokei fastify

# Record file counts in MEDIUM_REPO_RESULTS.md
```

**Expected File Counts** (approximate):
- **express**: 400-600 files
- **flask**: 500-700 files
- **hugo**: 1200-1500 files
- **fastify**: 800-1000 files

### Document Versions

Record git commit hash for each repository in MEDIUM_REPO_RESULTS.md:

```bash
# Create version snapshot file
echo "Repository Version Snapshot" > versions.txt
echo "Testing Date: $(date)" >> versions.txt
echo "" >> versions.txt

cd express && echo "express: $(git log --oneline -1)" >> ../versions.txt && cd ..
cd flask && echo "flask: $(git log --oneline -1)" >> ../versions.txt && cd ..
cd hugo && echo "hugo: $(git log --oneline -1)" >> ../versions.txt && cd ..
cd fastify && echo "fastify: $(git log --oneline -1)" >> ../versions.txt && cd ..

cat versions.txt
```

---

## Comparison Testing Methodology

### Dual Execution Process

For each test scenario, follow these steps precisely:

**Step 1: Execute via MCP Tool**
- Use Node.js script to invoke MCP tool
- Measure execution time with `Date.now()`
- Record memory usage with `process.memoryUsage()`
- Save output to file for comparison
- Record metrics: time, memory, match count, skipped lines

**Step 2: Execute via CLI**
- Run equivalent ast-grep command
- Measure execution time with `time` command
- Count matches with `wc -l`
- Save output to file for comparison
- Record metrics: time, match count

**Step 3: Compare Results**
- Compare match counts for accuracy
- Calculate performance delta (overhead percentage)
- Analyze output format differences
- Evaluate error handling differences
- Document any discrepancies

**Step 4: Document Findings**
- Record all metrics in MEDIUM_REPO_RESULTS.md
- Provide side-by-side output samples
- Analyze root causes of differences
- Assign verdict: ✓ Identical / ⚠ Minor differences / ✗ Significant discrepancies

### MCP Tool Execution Methods

**Option A: Node.js Script (Recommended for Automation)**

Create a test script `test-mcp-tool.js`:

```javascript
import { SearchTool, ReplaceTool, ScanTool } from '../src/tools/index.js';
import { AstGrepBinaryManager } from '../src/core/binary-manager.js';
import { WorkspaceManager } from '../src/core/workspace-manager.js';

// Initialize MCP components
const binaryManager = new AstGrepBinaryManager({ useSystem: true });
await binaryManager.initialize();
const workspaceManager = new WorkspaceManager();

// Example: SearchTool execution
const searchTool = new SearchTool(binaryManager, workspaceManager);

console.log('Starting MCP SearchTool execution...');

// Measure execution time
const startTime = Date.now();
const memBefore = process.memoryUsage();

const result = await searchTool.execute({
  pattern: 'function($REQ, $RES, $NEXT) { $$$BODY }',
  paths: ['D:/_Project/_test-repos/medium/express'],
  language: 'javascript',
  maxMatches: 200
});

const executionTime = Date.now() - startTime;
const memAfter = process.memoryUsage();
const memUsed = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

// Output results
console.log('MCP Execution Time:', executionTime, 'ms');
console.log('Memory Used:', memUsed.toFixed(2), 'MB');
console.log('Total Matches:', result.summary.totalMatches);
console.log('Files Searched:', result.summary.filesSearched);
console.log('Skipped Lines:', result.summary.skippedLines);

// Save results to file for comparison
import fs from 'fs';
fs.writeFileSync('mcp-results.json', JSON.stringify(result, null, 2));

console.log('Results saved to mcp-results.json');
```

**Usage**:
```bash
node test-mcp-tool.js
```

**Option B: MCP Client (Claude Desktop)**

If using Claude Desktop with MCP server configured:

1. Start MCP server: `bun run dev`
2. Open Claude Desktop
3. Send tool invocation request
4. Manually record execution times (visible in Claude Desktop)
5. Copy results to documentation

**Note**: Option A (Node.js script) is recommended for consistent timing measurements.

### CLI Execution Methods

**For Search Operations (ast_search equivalent)**

```bash
# Navigate to repository
cd D:/_Project/_test-repos/medium/express

# Execute with timing (PowerShell)
Measure-Command {
  ast-grep run --pattern 'function($REQ, $RES, $NEXT) { $$BODY }' --lang js --json=stream . > results.jsonl
}

# Or with Unix time command (Git Bash on Windows, or Linux/macOS)
time ast-grep run --pattern 'function($REQ, $RES, $NEXT) { $$$BODY }' --lang js --json=stream . > results.jsonl

# Count matches
wc -l results.jsonl
# Or on Windows PowerShell:
(Get-Content results.jsonl).Length

# View sample matches (first 3)
head -n 3 results.jsonl | jq .
# Or on Windows PowerShell:
Get-Content results.jsonl -Head 3 | ConvertFrom-Json | ConvertTo-Json
```

**For Replace Operations (ast_replace equivalent)**

```bash
# Navigate to repository
cd D:/_Project/_test-repos/medium/express

# Execute replacement (dry-run by default - doesn't modify files)
time ast-grep run --pattern 'var $NAME = $VALUE' --rewrite 'const $NAME = $VALUE' --lang js . > diff.txt

# Count affected files (Unix)
grep -c "^diff" diff.txt
# Or on Windows PowerShell:
(Select-String -Path diff.txt -Pattern "^diff").Count

# View sample diff
head -n 50 diff.txt
# Or on Windows PowerShell:
Get-Content diff.txt -Head 50
```

**For Rule-Based Scanning (ast_run_rule equivalent)**

```bash
# Create YAML rule file
cat > rule.yml << 'EOF'
id: middleware-detection
message: Middleware function detected
severity: info
language: js
rule:
  pattern: function($REQ, $RES, $NEXT) { $$$BODY }
EOF

# Execute scan
cd D:/_Project/_test-repos/medium/express
time ast-grep scan --rule rule.yml --json=stream . > findings.jsonl

# Count findings
wc -l findings.jsonl

# View sample findings
head -n 3 findings.jsonl | jq .
```

### Metrics Collection

**Execution Time Measurement**

**MCP (Node.js)**:
```javascript
const startTime = Date.now();
const result = await tool.execute(params);
const executionTime = Date.now() - startTime;
console.log('Execution time:', executionTime, 'ms');
```

**CLI (PowerShell)**:
```powershell
$result = Measure-Command {
  ast-grep run --pattern '...' --lang js . > output.jsonl
}
Write-Host "Execution time: $($result.TotalMilliseconds) ms"
```

**CLI (Unix time command)**:
```bash
time ast-grep run --pattern '...' --lang js . > output.jsonl
# Look at "real" time in output
```

**Memory Usage Measurement**

**MCP (Node.js)**:
```javascript
const memBefore = process.memoryUsage();
const result = await tool.execute(params);
const memAfter = process.memoryUsage();
const memUsed = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
console.log('Memory used:', memUsed.toFixed(2), 'MB');
```

**CLI** (more difficult, platform-dependent):
```bash
# Linux: Use /usr/bin/time -v
/usr/bin/time -v ast-grep run --pattern '...' --lang js . > output.jsonl
# Look for "Maximum resident set size"

# macOS: Use time with different flags
# Windows: Use Activity Monitor or Task Manager (manual observation)
```

**Note**: CLI memory measurement is less precise. Focus on execution time for primary comparison.

**Match Count Comparison**

**MCP**:
```javascript
const matchCount = result.summary.totalMatches;
```

**CLI**:
```bash
wc -l results.jsonl  # Each line is one match
```

**Output Format Documentation**

**MCP**: Structured JSON object
```json
{
  "summary": { "totalMatches": 42, ... },
  "matches": [ {...}, {...}, ... ]
}
```

**CLI**: JSONL (one JSON per line)
```json
{"file":"...", "line":10, ...}
{"file":"...", "line":20, ...}
```

Document parsing differences and usability in MEDIUM_REPO_RESULTS.md.

---

## Test Scenarios by Repository

### Repository 1: express (JavaScript)

Navigate to express repository:
```bash
cd D:/_Project/_test-repos/medium/express
```

#### Test 1: Middleware Function Detection

**Pattern**: `function($REQ, $RES, $NEXT) { $$$BODY }`  
**Complexity**: Moderate  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)  
**Expected Matches**: 50-100

**MCP Execution**:
```javascript
// test-express-middleware.js
const result = await searchTool.execute({
  pattern: 'function($REQ, $RES, $NEXT) { $$$BODY }',
  paths: ['D:/_Project/_test-repos/medium/express'],
  language: 'javascript',
  maxMatches: 200
});
// Record: time, matches, memory, skipped lines
```

**CLI Execution**:
```bash
time ast-grep run --pattern 'function($REQ, $RES, $NEXT) { $$$BODY }' --lang js --json=stream . > results.jsonl
wc -l results.jsonl
head -n 3 results.jsonl | jq .
# Record: time, match count
```

**Comparison Points**:
- Match count identical?
- Execution time delta
- Sample matches (verify file:line pairs match)
- Skipped lines comparison (if CLI reports)

#### Test 2: Route Definition with Constraints

**Pattern**: `app.$METHOD($PATH, $HANDLERS)`  
**Constraint**: METHOD matches `^(get|post|put|delete|patch)$`  
**Complexity**: High  
**Tool**: ast_run_rule (MCP) vs ast-grep scan (CLI)  
**Expected Findings**: 30-60

**MCP Execution**:
```javascript
// test-express-routes.js
const result = await scanTool.execute({
  id: 'route-detection',
  message: 'Route definition detected: {{METHOD}} {{PATH}}',
  severity: 'info',
  pattern: 'app.$METHOD($PATH, $HANDLERS)',
  where: [
    {
      metavariable: 'METHOD',
      regex: '^(get|post|put|delete|patch)$'
    }
  ],
  language: 'javascript',
  paths: ['D:/_Project/_test-repos/medium/express']
});
// Record: time, findings, generated YAML
```

**CLI Execution**:
```bash
# Create YAML manually
cat > route-detection.yml << 'EOF'
id: route-detection
message: "Route definition detected: {{METHOD}} {{PATH}}"
severity: info
language: js
rule:
  pattern: app.$METHOD($PATH, $HANDLERS)
  where:
    metavariable: METHOD
    regex: "^(get|post|put|delete|patch)$"
EOF

time ast-grep scan --rule route-detection.yml --json=stream . > findings.jsonl
wc -l findings.jsonl
# Record: time, finding count
```

**Comparison Points**:
- YAML generation: does MCP-generated match manual?
- Constraint effectiveness: both apply regex correctly?
- Finding count identical?
- Message interpolation: {{METHOD}} replaced correctly?

#### Test 3: Callback to Async/Await Replacement

**Pattern**: `function($ERR, $ARGS) { $$$BODY }`  
**Replacement**: `async function($ARGS) { try { $$$BODY } catch($ERR) { } }`  
**Complexity**: Very High  
**Tool**: ast_replace (MCP) vs ast-grep run --rewrite (CLI)  
**Expected Changes**: 20-40 files

**MCP Execution**:
```javascript
// test-express-async-refactor.js
const result = await replaceTool.execute({
  pattern: 'function($ERR, $ARGS) { $$$BODY }',
  replacement: 'async function($ARGS) { try { $$$BODY } catch($ERR) { } }',
  paths: ['D:/_Project/_test-repos/medium/express'],
  language: 'javascript',
  dryRun: true
});
// Record: time, files affected, total changes, diff preview
```

**CLI Execution**:
```bash
time ast-grep run --pattern 'function($ERR, $ARGS) { $$$BODY }' \
  --rewrite 'async function($ARGS) { try { $$$BODY } catch($ERR) { } }' \
  --lang js . > diff.txt

grep -c "^diff" diff.txt  # Count affected files
head -n 100 diff.txt  # View sample
# Record: time, files affected
```

**Comparison Points**:
- Files affected: identical count?
- Replacement accuracy: same transformations?
- Diff format: compare readability
- Performance on multi-file operation

#### Test 4: Nested Function Detection

**Pattern**: `function $OUTER($PARAMS1) { $$$ function $INNER($PARAMS2) { $$$BODY } $$$ }`  
**Complexity**: Very High  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)  
**Expected Matches**: 10-30

**MCP & CLI Execution**: Similar to Test 1, but with nested pattern

**Comparison Points**:
- Nested pattern accuracy
- Performance with complex pattern
- Wildcard ($$$ ) behavior

#### Test 5: Deprecated API Detection

**Pattern**: Multiple patterns for Express 3.x methods  
**Complexity**: High  
**Tool**: ast_run_rule (MCP) vs ast-grep scan (CLI)  
**Expected Findings**: Variable (depends on codebase age)

**MCP Execution**:
```javascript
const result = await scanTool.execute({
  id: 'deprecated-express-api',
  message: 'Deprecated Express 3.x API detected',
  severity: 'warning',
  patterns: [
    'app.configure($ARGS)',
    'res.send($STATUS, $CONTENT)',
    'req.param($NAME)'
  ],
  language: 'javascript',
  paths: ['D:/_Project/_test-repos/medium/express']
});
```

**CLI Execution**:
```yaml
# deprecated-api.yml
id: deprecated-express-api
message: "Deprecated Express 3.x API detected"
severity: warning
language: js
rule:
  any:
    - pattern: app.configure($ARGS)
    - pattern: res.send($STATUS, $CONTENT)
    - pattern: req.param($NAME)
```

**Comparison Points**:
- Multi-pattern handling
- Finding count per pattern
- Performance impact of multiple patterns

---

### Repository 2: flask (Python)

Navigate to flask repository:
```bash
cd D:/_Project/_test-repos/medium/flask
```

#### Test 1: Route Decorator Detection

**Pattern**: `@app.route($PATH)\ndef $FUNC($ARGS): $$$BODY`  
**Complexity**: High (multi-line pattern)  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)  
**Expected Matches**: 40-80

**MCP Execution**:
```javascript
const result = await searchTool.execute({
  pattern: '@app.route($PATH)\\ndef $FUNC($ARGS): $$$BODY',
  paths: ['D:/_Project/_test-repos/medium/flask'],
  language: 'python',
  maxMatches: 200
});
```

**CLI Execution**:
```bash
time ast-grep run --pattern '@app.route($PATH)
def $FUNC($ARGS): $$$BODY' --lang py --json=stream . > routes.jsonl

wc -l routes.jsonl
```

**Comparison Points**:
- Multi-line pattern handling (with `\n`)
- Decorator parsing accuracy
- Indentation sensitivity (Python-specific)

#### Test 2: Class-Based Views

**Pattern**: `class $NAME(MethodView): $METHODS`  
**Complexity**: Moderate  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)  
**Expected Matches**: 10-20

**Comparison Points**:
- Class inheritance detection
- Method extraction from class body
- Python class syntax accuracy

#### Test 3: Context Manager Detection

**Pattern**: `with $EXPR as $VAR: $$$BODY`  
**Complexity**: Moderate  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)  
**Expected Matches**: 50-100

**Comparison Points**:
- Python `with` statement parsing
- Indented body handling
- Multi-line body capture

#### Test 4: Blueprint Constraint Rule

**Pattern**: `Blueprint($NAME, $ARGS)`  
**Constraint**: NAME matches `^[a-z_]+$`  
**Complexity**: High  
**Tool**: ast_run_rule (MCP) vs ast-grep scan (CLI)

**Comparison Points**:
- Constraint on Python string literals
- YAML generation for Python rules
- Finding accuracy

#### Test 5: Multi-File Import Refactoring

**Pattern**: `from flask import $ITEMS`  
**Replacement**: `from flask.new_api import $ITEMS`  
**Complexity**: High  
**Tool**: ast_replace (MCP) vs ast-grep run --rewrite (CLI)

**Comparison Points**:
- Multi-file Python refactoring
- Import statement handling
- Metavariable preservation ($ITEMS)

---

### Repository 3: hugo (Go)

Navigate to hugo repository:
```bash
cd D:/_Project/_test-repos/medium/hugo
```

**Note**: This is the largest repository (~1200-1500 files). Performance testing is critical here.

#### Test 1: Goroutine Detection

**Pattern**: `go $FUNC($ARGS)`  
**Complexity**: Moderate  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)  
**Expected Matches**: 100-200

**Comparison Points**:
- Go concurrency pattern accuracy
- Performance on large codebase (1200+ files)
- Anonymous function detection: `go func() { ... }()`

#### Test 2: Error Handling Pattern

**Pattern**: `if err != nil { $$$BODY }`  
**Complexity**: High (very common, large result set)  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)  
**Expected Matches**: 500-1000+

**MCP Execution**:
```javascript
const result = await searchTool.execute({
  pattern: 'if err != nil { $$$BODY }',
  paths: ['D:/_Project/_test-repos/medium/hugo'],
  language: 'go',
  maxMatches: 200  // Will truncate!
});
```

**CLI Execution**:
```bash
time ast-grep run --pattern 'if err != nil { $$$BODY }' --lang go --json=stream . > errors.jsonl
wc -l errors.jsonl  # Full count
```

**Comparison Points**:
- **maxMatches truncation**: MCP stops at 200, CLI returns all
- Performance with 100+ matches
- Memory usage with large result set

#### Test 3: Interface Definition Detection

**Pattern**: `type $NAME interface { $METHODS }`  
**Complexity**: Moderate  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)

**Comparison Points**:
- Go interface syntax parsing
- Method list extraction
- Empty interface handling: `interface{}`

#### Test 4: Struct Initialization Refactoring

**Pattern**: `Config{$FIELDS}`  
**Replacement**: `Config{Debug: true, $FIELDS}`  
**Complexity**: Very High (multi-file, large codebase)  
**Tool**: ast_replace (MCP) vs ast-grep run --rewrite (CLI)

**Comparison Points**:
- **Performance on 1200+ files**: Critical test!
- Multi-file struct refactoring accuracy
- Field preservation
- Scalability assessment

#### Test 5: Missing Error Check Detection

**Pattern**: `$VAR, err := $CALL($ARGS)` (without following error check)  
**Complexity**: Very High (requires context analysis)  
**Tool**: ast_run_rule (MCP) vs ast-grep scan (CLI)

**Note**: This is a simplified pattern. True missing error check detection requires more complex rules.

**Comparison Points**:
- Complex constraint-based rule
- Context analysis capability
- False positive/negative rate

---

### Repository 4: fastify (JavaScript/TypeScript)

Navigate to fastify repository:
```bash
cd D:/_Project/_test-repos/medium/fastify
```

**Note**: This repository has mixed JavaScript and TypeScript files, testing language detection.

#### Test 1: Plugin Registration

**Pattern**: `fastify.register($PLUGIN, $OPTS)`  
**Complexity**: Moderate  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)

**Comparison Points**:
- Plugin pattern accuracy
- Mixed JS/TS codebase handling
- Language detection for .js vs .ts files

#### Test 2: TypeScript Generic Functions

**Pattern**: `function $NAME<$TYPE>($PARAMS): $RET { $$$BODY }`  
**Complexity**: Very High  
**Tool**: ast_search (MCP) vs ast-grep run (CLI)  
**Language**: typescript

**MCP Execution**:
```javascript
const result = await searchTool.execute({
  pattern: 'function $NAME<$TYPE>($PARAMS): $RET { $$$BODY }',
  paths: ['D:/_Project/_test-repos/medium/fastify'],
  language: 'typescript',  // Explicitly specify TS
  maxMatches: 150
});
```

**CLI Execution**:
```bash
time ast-grep run --pattern 'function $NAME<$TYPE>($PARAMS): $RET { $$$BODY }' --lang ts --json=stream . > generics.jsonl
```

**Comparison Points**:
- TypeScript generic syntax: `<T>`, `<T extends Something>`
- Return type annotation: `: $RET`
- Complex type parameter handling
- Arrow functions with generics: `const fn = <T>() => { }`

#### Test 3: Hook Definition with Constraint

**Pattern**: `fastify.addHook($HOOK, $HANDLER)`  
**Constraint**: HOOK matches valid hook names  
**Complexity**: High  
**Tool**: ast_run_rule (MCP) vs ast-grep scan (CLI)

**Comparison Points**:
- Constraint on string literals
- Regex validation of hook names
- Message interpolation

#### Test 4: Async Route Handler Refactoring

**Pattern**: `fastify.get($PATH, function($REQ, $REP, $DONE) { $$$BODY })`  
**Replacement**: `fastify.get($PATH, async function($REQ, $REP) { $$$BODY })`  
**Complexity**: Very High (multi-file, mixed JS/TS)  
**Tool**: ast_replace (MCP) vs ast-grep run --rewrite (CLI)

**Comparison Points**:
- Large-scale async refactoring (800+ files)
- Mixed JS/TS file handling
- Callback parameter removal ($DONE)
- Type annotation preservation in TS files

#### Test 5: Missing Error Handler Detection

**Pattern**: `fastify.get($PATH, $HANDLER)` (without error handler)  
**Fix**: `fastify.get($PATH, $HANDLER).catch((err) => console.error(err))`  
**Complexity**: Very High (fix template)  
**Tool**: ast_run_rule (MCP) vs ast-grep scan (CLI)

**Comparison Points**:
- Fix template generation
- Metavariable substitution in fix
- Fix applicability

---

## Comparison Analysis Template

For each test scenario, document results using this template:

### Test X: [Test Name]

**Pattern**: `[pattern]`  
**Complexity**: [Low/Moderate/High/Very High]  
**Repository**: [express/flask/hugo/fastify]  
**Tool**: [ast_search/ast_replace/ast_run_rule]

#### MCP Tool Execution

**Tool**: [ast_search | ast_replace | ast_run_rule]

**Parameters**:
```json
{
  "pattern": "[pattern]",
  "paths": ["[path]"],
  "language": "[language]",
  "[other params]": "[values]"
}
```

**Results**:
- **Execution Time**: [X] ms
- **Matches/Changes/Findings**: [X]
- **Memory Usage**: [X] MB
- **Skipped Lines**: [X]
- **Files Searched/Affected**: [X]

**Sample Output** (first 2-3):
```
[Show sample matches/changes/findings]
File: [file]:line[X]
Code: [code snippet]
```

#### CLI Execution

**Command**:
```bash
[exact command used]
```

**Results**:
- **Execution Time**: [X] ms (from `time` command - real time)
- **Matches/Changes/Findings**: [X] (from `wc -l` or grep)
- **Output File Size**: [X] KB

**Sample Output** (first 2-3):
```
[Show sample matches/changes/findings from CLI]
```

#### Comparison Analysis

**Accuracy**:
- **Match Count Identical?**: [Yes/No]
- **If Different**: [Explanation - why do counts differ?]
- **Sample Comparison**: [Compare file:line pairs side-by-side]
  - MCP Match 1: [file:line]
  - CLI Match 1: [file:line]
  - Identical? [Yes/No]
- **False Positives**: [Any matches in MCP not in CLI?]
- **False Negatives**: [Any matches in CLI not in MCP?]
- **Verdict**: [✓ Identical / ⚠ Minor differences (<5% variation) / ✗ Significant discrepancies (>5%)]

**Performance**:
- **MCP Time**: [X] ms
- **CLI Time**: [X] ms
- **Performance Delta**: [X]% = (MCP_time - CLI_time) / CLI_time × 100
- **Overhead Acceptable?**: [Yes/No - threshold: <20% for medium repos]
- **Bottleneck Analysis**: [Where is time spent? Tool init / JSON parsing / execution / result processing]

**Error Handling**:
- **MCP Errors**: [Any errors encountered? Show error message]
- **CLI Errors**: [Any errors encountered? Show error message]
- **Error Message Quality**: [Which provides better error messages?]
- **Recovery**: [How were errors handled? Did execution continue or stop?]

**Output Format**:
- **MCP Format**: [Description - structured JSON, etc.]
- **CLI Format**: [Description - JSONL, diff, etc.]
- **Parsing Differences**: [Any issues parsing CLI output to compare with MCP?]
- **Usability**: [Which format is more user-friendly? More parseable?]

**Edge Cases**:
- [Any edge cases encountered? Unexpected behavior?]
- [Example: Pattern matched something unexpected]

**Verdict**: 
- [✓ MCP accurately wraps CLI - results identical, performance acceptable]
- [⚠ MCP has minor issues - small discrepancies or moderate overhead]
- [✗ MCP has significant problems - major discrepancies or unacceptable performance]

**Explanation**: 
[Detailed explanation of verdict, including specific observations and recommendations if applicable]

---

## Complex Pattern Testing

Beyond the standard test scenarios, test these complex patterns to stress-test MCP tools:

### Test: Nested Functions (3+ Levels)

**Pattern**: `function $L1() { $$$ function $L2() { $$$ function $L3() { $$$BODY } $$$ } $$$ }`

**Purpose**: Verify deep nesting support

**Repositories to Test**: express, fastify (JavaScript has more nested patterns)

**Execution**:
```javascript
// MCP
const result = await searchTool.execute({
  pattern: 'function $L1() { $$$ function $L2() { $$$ function $L3() { $$$BODY } $$$ } $$$ }',
  paths: ['./express'],
  language: 'javascript',
  maxMatches: 100
});
```

```bash
# CLI
ast-grep run --pattern 'function $L1() { $$$ function $L2() { $$$ function $L3() { $$$BODY } $$$ } $$$ }' --lang js . > nested.jsonl
```

**Comparison**:
- Do both find identical deeply nested functions?
- What's the maximum nesting depth found?
- Performance impact of complex pattern?
- Are metavariables correctly captured at each level?

**Expected Outcome**: Both should find same matches, but MCP may have higher overhead due to pattern complexity.

---

### Test: Multi-File Refactoring (5+ Files)

**Pattern**: Common pattern across multiple files  
**Replacement**: Structural transformation

**Purpose**: Verify multi-file operation accuracy and performance

**Repositories to Test**: All (but especially hugo for large file count)

**Example for hugo**:
```javascript
// MCP - Refactor all error returns to wrapped errors
const result = await replaceTool.execute({
  pattern: 'return err',
  replacement: 'return fmt.Errorf("operation failed: %w", err)',
  paths: ['./hugo'],
  language: 'go',
  dryRun: true
});
```

```bash
# CLI
ast-grep run --pattern 'return err' --rewrite 'return fmt.Errorf("operation failed: %w", err)' --lang go . > multi-file-diff.txt
```

**Comparison**:
- How many files affected? Identical count?
- Are changes identical file-by-file?
- Performance with 10, 50, 100+ files affected?
- Diff readability with many files?

**Expected Outcome**: Both should affect same files, but MCP overhead may be noticeable on 100+ files.

---

### Test: Constraint Combinations (2+ Constraints)

**Pattern**: Rule with multiple `where` constraints

**Purpose**: Verify constraint logic and effectiveness

**Example for flask**:
```javascript
// MCP - Find routes with specific decorator and parameter patterns
const result = await scanTool.execute({
  id: 'complex-route-check',
  message: 'Complex route found',
  severity: 'info',
  pattern: '@app.route($PATH, methods=[$METHODS])\ndef $FUNC($ARGS): $$$BODY',
  where: [
    {
      metavariable: 'PATH',
      regex: '^/api/'  // Only API routes
    },
    {
      metavariable: 'METHODS',
      regex: 'POST|PUT'  // Only POST/PUT methods
    }
  ],
  language: 'python',
  paths: ['./flask']
});
```

```yaml
# CLI YAML
id: complex-route-check
message: "Complex route found"
severity: info
language: python
rule:
  pattern: |
    @app.route($PATH, methods=[$METHODS])
    def $FUNC($ARGS): $$$BODY
  all:
    - metavariable: PATH
      regex: "^/api/"
    - metavariable: METHODS
      regex: "POST|PUT"
```

**Comparison**:
- Do both apply all constraints correctly?
- Finding count identical?
- Are constraints combined with AND logic correctly?
- Performance impact of multiple constraints?

**Expected Outcome**: Both should find same matches, constraint logic should be identical.

---

### Test: Large Result Sets (100+ Matches)

**Pattern**: Very common pattern (e.g., `if err != nil` in Go)

**Purpose**: Test maxMatches truncation and large result handling

**Repository**: hugo (Go has many error checks)

**Execution**:
```javascript
// MCP - Will truncate at maxMatches
const result = await searchTool.execute({
  pattern: 'if err != nil { $$$BODY }',
  paths: ['./hugo'],
  language: 'go',
  maxMatches: 200  // Truncation point
});
console.log('MCP found:', result.summary.totalMatches, 'matches (truncated)');
```

```bash
# CLI - Returns all matches
time ast-grep run --pattern 'if err != nil { $$BODY }' --lang go --json=stream . > all-errors.jsonl
wc -l all-errors.jsonl  # Full count (likely 500-1000+)
```

**Comparison**:
- MCP truncates at 200, CLI returns all - document this behavior
- Does truncation happen at first 200 or distributed?
- Performance: Does CLI slow down with 500+ matches?
- Memory: Does MCP save memory by truncating?

**Expected Outcome**: MCP stops at maxMatches, CLI returns all. Document as known limitation with justification (performance/memory).

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: MCP and CLI Results Differ

**Symptom**: Match counts don't match, or different files are found.

**Possible Causes**:
1. **Path resolution**: MCP uses absolute paths, CLI uses relative paths
2. **Language detection**: Language parameter might differ
3. **Metavariable naming**: Metavariable names are case-sensitive
4. **Pattern escaping**: Special characters might need escaping differently

**Solutions**:
1. **Verify paths are identical**:
   ```javascript
   // MCP: Ensure absolute path
   paths: ['D:/_Project/_test-repos/medium/express']
   ```
   ```bash
   # CLI: Navigate to same directory
   cd D:/_Project/_test-repos/medium/express
   ```

2. **Verify language parameter**:
   ```javascript
   // MCP
   language: 'javascript'  // Not 'js'
   ```
   ```bash
   # CLI
   --lang js  # Abbreviated form accepted
   ```

3. **Check pattern syntax**:
   - Are metavariables capitalized correctly?
   - Are special characters escaped?
   - Multi-line patterns: `\n` in MCP, actual newline in CLI

4. **Compare sample outputs manually**:
   - Pick 3-5 matches from each
   - Verify file:line pairs
   - Check if code snippets are identical

#### Issue 2: Performance Overhead Too High (>50%)

**Symptom**: MCP takes 2x or more time compared to CLI.

**Possible Causes**:
1. **Tool initialization included in timing**: MCP initialization is one-time cost
2. **JSON parsing overhead**: MCP parses all results into structured object
3. **Validation overhead**: MCP validates all parameters
4. **Multiple file operations**: MCP might be doing extra file I/O

**Solutions**:
1. **Measure only execution time**, exclude initialization:
   ```javascript
   // Initialize once
   const searchTool = new SearchTool(binaryManager, workspaceManager);
   
   // Measure only execute()
   const startTime = Date.now();
   const result = await searchTool.execute(params);
   const executionTime = Date.now() - startTime;
   ```

2. **Test with larger patterns**: Overhead might be fixed cost, less noticeable on longer operations

3. **Profile the code**: Identify bottlenecks (validation, JSON parsing, file I/O)

4. **Document acceptable overhead**: <20% is good, 20-50% is acceptable, >50% needs investigation

#### Issue 3: CLI Command Not Working

**Symptom**: CLI command fails or produces unexpected output.

**Possible Causes**:
1. **ast-grep version incompatibility**: Flags might differ by version
2. **Shell escaping issues**: Pattern needs different escaping in different shells
3. **Path issues**: Relative vs absolute paths
4. **Output redirection issues**: Output file already exists or permissions

**Solutions**:
1. **Verify ast-grep version**:
   ```bash
   ast-grep --version
   # Ensure 0.15.0 or higher
   ```

2. **Check command syntax**:
   ```bash
   ast-grep --help
   ast-grep run --help
   ast-grep scan --help
   ```

3. **Test pattern in isolation**:
   ```bash
   # Test on single file
   echo 'function test(a, b, c) { return a + b + c; }' > test.js
   ast-grep run --pattern 'function $NAME($ARGS) { $$$BODY }' --lang js test.js
   ```

4. **Shell-specific escaping**:
   ```bash
   # PowerShell: Use single quotes for pattern
   ast-grep run --pattern 'function($A, $B) { $C }' --lang js .
   
   # Bash: Also use single quotes
   ast-grep run --pattern 'function($A, $B) { $C }' --lang js .
   
   # CMD: Use double quotes
   ast-grep run --pattern "function($A, $B) { $C }" --lang js .
   ```

#### Issue 4: Memory Usage Measurement Inconsistent

**Symptom**: Memory measurements vary wildly between runs.

**Possible Causes**:
1. **Garbage collection**: Node.js GC runs at unpredictable times
2. **Background processes**: Other processes using memory
3. **Measurement timing**: Measuring at different points in execution
4. **Heap vs RSS**: Different memory metrics being compared

**Solutions**:
1. **Take multiple measurements and average**:
   ```javascript
   const runs = 5;
   let totalMem = 0;
   for (let i = 0; i < runs; i++) {
     const memBefore = process.memoryUsage().heapUsed;
     await tool.execute(params);
     const memAfter = process.memoryUsage().heapUsed;
     totalMem += (memAfter - memBefore);
   }
   const avgMem = totalMem / runs / 1024 / 1024;
   console.log('Average memory:', avgMem.toFixed(2), 'MB');
   ```

2. **Force garbage collection before measurement** (requires --expose-gc flag):
   ```javascript
   if (global.gc) {
     global.gc();
   }
   const memBefore = process.memoryUsage().heapUsed;
   ```

3. **Focus on execution time instead**: Memory measurement is less critical for comparison

4. **Use consistent metric**: Always use heapUsed, not RSS or external

#### Issue 5: YAML Generation Differs from Manual YAML

**Symptom**: MCP-generated YAML doesn't match manually created YAML.

**Possible Causes**:
1. **Whitespace differences**: Indentation or spacing
2. **Field ordering**: Different order of fields
3. **Constraint format**: Regex vs equals vs other constraint types
4. **Multi-line string format**: `|` vs `>` vs quotes

**Solutions**:
1. **Compare semantically, not textually**:
   - Do both YAMLs parse correctly?
   - Do both produce same results when run?

2. **Test both YAMLs**:
   ```bash
   # Test MCP-generated YAML
   ast-grep scan --rule mcp-generated.yml . > mcp-results.jsonl
   
   # Test manual YAML
   ast-grep scan --rule manual.yml . > manual-results.jsonl
   
   # Compare results
   diff mcp-results.jsonl manual-results.jsonl
   ```

3. **If results identical, whitespace doesn't matter**: Document as cosmetic difference

4. **If results differ, investigate**: Check constraint syntax, pattern escaping, language field

---

## Automation Script

To streamline testing, create an automation script that runs both MCP and CLI for each test:

### Automation Script Structure

**File**: `tests/automation/run-comparison-test.js`

**Note**: This automation script has been created and supports all three tool types (search, replace, and scan).

```javascript
#!/usr/bin/env node

import { SearchTool, ReplaceTool, ScanTool } from '../src/tools/index.js';
import { AstGrepBinaryManager } from '../src/core/binary-manager.js';
import { WorkspaceManager } from '../src/core/workspace-manager.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

class ComparisonTester {
  constructor() {
    this.binaryManager = null;
    this.workspaceManager = null;
    this.searchTool = null;
    this.replaceTool = null;
    this.scanTool = null;
  }

  async initialize() {
    console.log('Initializing MCP tools...');
    this.binaryManager = new AstGrepBinaryManager({ useSystem: true });
    await this.binaryManager.initialize();
    this.workspaceManager = new WorkspaceManager();
    
    this.searchTool = new SearchTool(this.binaryManager, this.workspaceManager);
    this.replaceTool = new ReplaceTool(this.binaryManager, this.workspaceManager);
    this.scanTool = new ScanTool(this.binaryManager, this.workspaceManager);
    
    console.log('Initialization complete.\n');
  }

  async runSearchTest(testConfig) {
    console.log(`Running search test: ${testConfig.name}`);
    
    // Execute via MCP
    const mcpResult = await this.executeMCPSearch(testConfig);
    
    // Execute via CLI
    const cliResult = await this.executeCLISearch(testConfig);
    
    // Compare results
    const comparison = this.compareResults(mcpResult, cliResult);
    
    return { mcpResult, cliResult, comparison };
  }

  async executeMCPSearch(config) {
    console.log('  [MCP] Executing...');
    const startTime = Date.now();
    const memBefore = process.memoryUsage().heapUsed;
    
    try {
      const result = await this.searchTool.execute(config.mcpParams);
      const executionTime = Date.now() - startTime;
      const memAfter = process.memoryUsage().heapUsed;
      const memUsed = (memAfter - memBefore) / 1024 / 1024;
      
      console.log(`  [MCP] Completed in ${executionTime}ms`);
      console.log(`  [MCP] Matches: ${result.summary.totalMatches}`);
      console.log(`  [MCP] Memory: ${memUsed.toFixed(2)}MB`);
      
      return { result, executionTime, memUsed };
    } catch (error) {
      console.error('  [MCP] Error:', error.message);
      return { error, executionTime: Date.now() - startTime };
    }
  }

  async executeCLISearch(config) {
    console.log('  [CLI] Executing...');
    const outputFile = `cli-output-${Date.now()}.jsonl`;
    const startTime = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync(
        `cd ${config.cliWorkingDir} && ${config.cliCommand} > ${outputFile}`,
        { maxBuffer: 10 * 1024 * 1024 }  // 10MB buffer
      );
      const executionTime = Date.now() - startTime;
      
      // Read output file and count matches
      const outputPath = path.join(config.cliWorkingDir, outputFile);
      const output = fs.readFileSync(outputPath, 'utf8');
      const lines = output.trim().split('\n').filter(line => line);
      const matchCount = lines.length;
      
      // Parse first few matches for comparison
      const sampleMatches = lines.slice(0, 5).map(line => JSON.parse(line));
      
      console.log(`  [CLI] Completed in ${executionTime}ms`);
      console.log(`  [CLI] Matches: ${matchCount}`);
      
      // Clean up
      fs.unlinkSync(outputPath);
      
      return { matchCount, sampleMatches, executionTime };
    } catch (error) {
      console.error('  [CLI] Error:', error.message);
      return { error, executionTime: Date.now() - startTime };
    }
  }

  compareResults(mcpResult, cliResult) {
    console.log('\n  [COMPARE] Analyzing results...');
    
    const comparison = {
      accuracy: {},
      performance: {},
      verdict: ''
    };
    
    // Accuracy comparison
    if (mcpResult.error || cliResult.error) {
      comparison.accuracy.status = 'error';
      comparison.accuracy.mcpError = mcpResult.error?.message;
      comparison.accuracy.cliError = cliResult.error?.message;
      comparison.verdict = '✗ Error occurred';
    } else {
      const mcpCount = mcpResult.result.summary.totalMatches;
      const cliCount = cliResult.matchCount;
      const diff = Math.abs(mcpCount - cliCount);
      const accuracy = cliCount > 0 ? (1 - diff / cliCount) * 100 : 0;
      
      comparison.accuracy.mcpCount = mcpCount;
      comparison.accuracy.cliCount = cliCount;
      comparison.accuracy.difference = diff;
      comparison.accuracy.accuracyPercent = accuracy.toFixed(2);
      
      if (accuracy >= 99) {
        comparison.accuracy.status = 'identical';
        comparison.verdict = '✓ Identical results';
      } else if (accuracy >= 95) {
        comparison.accuracy.status = 'minor-diff';
        comparison.verdict = '⚠ Minor differences';
      } else {
        comparison.accuracy.status = 'significant-diff';
        comparison.verdict = '✗ Significant discrepancies';
      }
    }
    
    // Performance comparison
    if (!mcpResult.error && !cliResult.error) {
      const overhead = ((mcpResult.executionTime - cliResult.executionTime) / cliResult.executionTime) * 100;
      comparison.performance.mcpTime = mcpResult.executionTime;
      comparison.performance.cliTime = cliResult.executionTime;
      comparison.performance.overheadPercent = overhead.toFixed(2);
      
      if (overhead < 20) {
        comparison.performance.status = 'acceptable';
      } else if (overhead < 50) {
        comparison.performance.status = 'moderate';
      } else {
        comparison.performance.status = 'concerning';
      }
    }
    
    console.log(`  [COMPARE] Verdict: ${comparison.verdict}`);
    console.log(`  [COMPARE] Accuracy: ${comparison.accuracy.accuracyPercent}%`);
    console.log(`  [COMPARE] Overhead: ${comparison.performance.overheadPercent}%\n`);
    
    return comparison;
  }

  generateReport(testResults) {
    console.log('\n=== COMPARISON REPORT ===\n');
    
    testResults.forEach((result, index) => {
      console.log(`Test ${index + 1}: ${result.testName}`);
      console.log(`  Verdict: ${result.comparison.verdict}`);
      console.log(`  Accuracy: ${result.comparison.accuracy.accuracyPercent}%`);
      console.log(`  MCP Matches: ${result.comparison.accuracy.mcpCount}`);
      console.log(`  CLI Matches: ${result.comparison.accuracy.cliCount}`);
      console.log(`  MCP Time: ${result.comparison.performance.mcpTime}ms`);
      console.log(`  CLI Time: ${result.comparison.performance.cliTime}ms`);
      console.log(`  Overhead: ${result.comparison.performance.overheadPercent}%`);
      console.log('');
    });
    
    // Overall statistics
    const totalTests = testResults.length;
    const identicalTests = testResults.filter(r => r.comparison.accuracy.status === 'identical').length;
    const avgOverhead = testResults.reduce((sum, r) => sum + parseFloat(r.comparison.performance.overheadPercent || 0), 0) / totalTests;
    
    console.log('=== OVERALL STATISTICS ===');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Identical Results: ${identicalTests} (${(identicalTests / totalTests * 100).toFixed(1)}%)`);
    console.log(`Average Overhead: ${avgOverhead.toFixed(2)}%`);
  }
}

// Example usage
async function main() {
  const tester = new ComparisonTester();
  await tester.initialize();
  
  const testConfigs = [
    {
      name: 'Express Middleware Detection',
      mcpParams: {
        pattern: 'function($REQ, $RES, $NEXT) { $$$BODY }',
        paths: ['D:/_Project/_test-repos/medium/express'],
        language: 'javascript',
        maxMatches: 200
      },
      cliWorkingDir: 'D:/_Project/_test-repos/medium/express',
      cliCommand: 'ast-grep run --pattern "function($REQ, $RES, $NEXT) { $$$BODY }" --lang js --json=stream .'
    },
    // Add more test configs...
  ];
  
  const results = [];
  for (const config of testConfigs) {
    const result = await tester.runSearchTest(config);
    results.push({ testName: config.name, ...result });
  }
  
  tester.generateReport(results);
}

main().catch(console.error);
```

**Usage**:
```bash
cd D:/_Project/_mcp/tree-grep-mcp/tests/automation
node run-comparison-test.js
```

This script automates the dual execution process and generates a comparison report.

---

## Final Checklist

Before completing medium repository testing, verify all items:

### Setup Checklist
- [ ] All 4 repositories cloned to `D:/_Project/_test-repos/medium/`
- [ ] File counts documented with tokei
- [ ] Git commit hashes recorded for reproducibility
- [ ] ast-grep version verified (0.15.0+)
- [ ] MCP server version documented
- [ ] Test workspace organized and clean

### Execution Checklist
- [ ] **express repository**: 5-7 test scenarios executed
- [ ] **flask repository**: 5-7 test scenarios executed
- [ ] **hugo repository**: 5-7 test scenarios executed (including performance stress test)
- [ ] **fastify repository**: 5-7 test scenarios executed (including TypeScript tests)
- [ ] **Total tests**: 20-28 comparison scenarios completed

### Comparison Checklist
- [ ] Each test executed via both MCP and CLI
- [ ] Performance metrics collected for all tests (time, memory)
- [ ] Accuracy comparison documented (match counts, file:line pairs)
- [ ] Sample outputs saved for all tests (first 3-5 matches)
- [ ] Discrepancies analyzed and explained

### Complex Pattern Checklist
- [ ] Nested pattern test completed (3+ levels)
- [ ] Multi-file refactoring test completed (5+ files affected)
- [ ] Constraint combination test completed (2+ constraints)
- [ ] Large result set test completed (100+ matches)

### Documentation Checklist
- [ ] MEDIUM_REPO_RESULTS.md created and populated (3000+ lines)
- [ ] All test scenarios documented with MCP and CLI results
- [ ] Cross-repository analysis completed
- [ ] Tool-specific findings documented (SearchTool, ReplaceTool, ScanTool)
- [ ] Language-specific observations noted (JS, Python, Go, TS)
- [ ] Edge cases and issues recorded
- [ ] Performance metrics summarized
- [ ] Recommendations drafted
- [ ] Conclusion written with confidence assessment

### Review Checklist
- [ ] Results reviewed for completeness
- [ ] Accuracy percentages calculated for all tests
- [ ] Performance overhead percentages calculated
- [ ] Verdicts assigned (✓/⚠/✗) for all tests
- [ ] Critical findings identified and highlighted
- [ ] Document committed to repository

### Next Phase Preparation
- [ ] Critical issues identified for fixing before large repo phase
- [ ] Performance targets defined for large repos (2000-10000 files)
- [ ] Patterns refined based on medium repo learnings
- [ ] Timeline estimated for large repo testing

---

## Expected Outcomes

### Success Criteria

At the end of medium repository testing, the following should be achieved:

**Accuracy**:
- MCP tools match CLI results with **>95% accuracy** on average
- No critical discrepancies (>10% match count difference)
- False positive/negative rates documented and explained

**Performance**:
- Average overhead **<20%** across all tests
- No single test with >50% overhead without justification
- Performance scalability demonstrated (400 files vs 1500 files)

**Tool Validation**:
- All three MCP tools (SearchTool, ReplaceTool, ScanTool) validated
- Complex patterns handled correctly (nested, multi-file, constraints)
- No critical failures or crashes

**Documentation**:
- MEDIUM_REPO_RESULTS.md completed (3000+ lines)
- 20-28 test scenarios documented with side-by-side comparison
- Clear recommendations for improvements (if needed)
- Readiness assessment for large repository testing

### Deliverables

**Primary Deliverable**:
- [MEDIUM_REPO_RESULTS.md](./MEDIUM_REPO_RESULTS.md) - Comprehensive comparison results

**Supporting Deliverables**:
- Test automation script (optional, but recommended)
- Sample output files (MCP and CLI) for verification
- Performance data tables (CSV or Markdown)
- Version snapshot file (git commits for reproducibility)

### Timeline Estimate

**Setup Phase**: 2-4 hours
- Clone repositories
- Verify installations
- Prepare workspace

**Execution Phase**: 1-2 days
- 20-28 test scenarios
- Dual execution (MCP + CLI) for each
- Average 30-60 minutes per scenario (including documentation)

**Analysis Phase**: 4-6 hours
- Cross-repository comparison
- Performance analysis
- Recommendations

**Documentation Phase**: 4-6 hours
- Populate MEDIUM_REPO_RESULTS.md
- Review and polish
- Commit to repository

**Total**: 2-4 days (depending on number of tests and depth of analysis)

### Next Steps

After completing medium repository testing:

1. **Review Findings**: Analyze all results and identify critical issues
2. **Address Issues**: Fix any critical problems before large repo phase
3. **Refine Patterns**: Improve patterns that had issues
4. **Plan Large Repo Testing**: Select 2-3 large repositories (2000-10000 files)
5. **Set Performance Targets**: Define acceptable overhead for large repos (<30%?)
6. **Begin Large Repo Phase**: Execute LARGE_REPO_RESULTS.md testing plan

---

**Document End**

**Version**: 1.0  
**Last Updated**: [Date]  
**Author**: [Name]  
**Status**: Ready for testing
