I have created the following plan after thorough exploration and analysis of the codebase. Follow the below plan verbatim. Trust the files and references. Do not re-verify what's written in the plan. Explore only when absolutely necessary. First implement all the proposed file changes and then I'll review all the changes together at the end.

### Observations

**Critical Insights:**

1. **Tool Constraints from Source Code:**
   - SearchTool: timeout 1000-300000ms (default 30s), maxMatches 1-10000 (default 100), context 0-100 lines
   - ReplaceTool: timeout 1000-300000ms (default 60s), no maxMatches limit
   - ScanTool: timeout 1000-300000ms (default 30s), creates temporary YAML files

2. **Large Repository Characteristics:**
   - React: 3000-4000 files, JavaScript/TypeScript, JSX patterns, hooks, complex nesting
   - Django: 4000-5000 files, Python, ORM patterns, class hierarchies, metaclasses
   - Tokio: 2500-3500 files, Rust, async/await, macros, lifetimes, trait bounds
   - Kubernetes: 10000+ files (extreme stress test), Go, massive scale

3. **Stress Testing Focus Areas:**
   - **Timeout scenarios**: Patterns that approach or exceed 300s limit
   - **Memory consumption**: Large file counts, complex patterns, result accumulation
   - **Result truncation**: Testing maxMatches behavior with 1000+ matches
   - **Error recovery**: Malformed files, parsing failures, partial results
   - **Complex patterns**: Deeply nested (5+ levels), multiple metavariables (10+)
   - **Edge cases**: Very large files, binary files, encoding issues

4. **Documentation Requirements:**
   - LARGE_REPO_RESULTS.md: ~3500-4000 lines (more detailed than medium repo results)
   - Focus on bottleneck identification and optimization recommendations
   - Performance degradation patterns as scale increases
   - Production readiness assessment with specific thresholds
   - Comparison with small/medium repo performance to identify scaling issues

5. **Testing Methodology Differences:**
   - **Deliberate stress testing**: Push tools to breaking points
   - **Resource monitoring**: Continuous memory/CPU tracking during execution
   - **Timeout testing**: Test patterns at 30s, 60s, 120s, 180s, 240s, 300s thresholds
   - **Failure analysis**: Document graceful degradation vs catastrophic failures
   - **Optimization identification**: Specific recommendations for performance improvements

### Approach

This is a **testing and documentation task** focused on stress testing large repositories (2000+ files) to identify performance bottlenecks, timeout scenarios, memory consumption patterns, and optimization opportunities. The approach involves: (1) selecting 2-3 large repositories from TEST_REPOSITORIES.md (recommend React, Django, and Tokio for language diversity), (2) executing comprehensive stress tests focusing on edge cases like very complex patterns, deeply nested structures, large file counts, timeout handling, memory limits, and result truncation, (3) monitoring detailed performance metrics including execution time, memory consumption, CPU usage, and error recovery, and (4) documenting all findings in LARGE_REPO_RESULTS.md with specific focus on bottlenecks, optimization recommendations, and production readiness assessment.

The key differentiator from previous testing phases is the **stress testing focus** - deliberately pushing tools to their limits to identify breaking points, performance degradation patterns, and resource consumption issues that only manifest at scale.

### Reasoning

I explored the repository structure, read the three tool implementations (SearchTool, ReplaceTool, ScanTool) to understand timeout parameters (1000-300000ms), maxMatches limits (1-10000), and error handling mechanisms. I examined TEST_REPOSITORIES.md which documents 4 large repositories: React (~3000-4000 files), Django (~4000-5000 files), Tokio (~2500-3500 files), and Kubernetes (~10000+ files). I reviewed the existing test documentation patterns from SMALL_REPO_RESULTS.md and MEDIUM_REPO_RESULTS.md to understand the expected documentation structure. I confirmed that all validation and error handling is already implemented in the tools, so this is purely a testing and documentation task with no code modifications needed.

## Proposed File Changes

### tests\LARGE_REPO_RESULTS.md(NEW)

References: 

- tests\TEST_REPOSITORIES.md
- tests\SMALL_REPO_RESULTS.md
- tests\MEDIUM_REPO_RESULTS.md
- src\tools\search.ts
- src\tools\replace.ts
- src\tools\scan.ts

**Create comprehensive large repository stress testing results documentation (3500-4000 lines):**

**1. Document Header (lines 1-100):**
- Title: "Large Repository Stress Testing Results - Performance Bottlenecks and Optimization Analysis"
- **Status Badge**: Testing phase, completion date, stress testing methodology
- **Executive Summary**: Critical bottlenecks identified, timeout scenarios encountered, memory consumption patterns, production readiness assessment (Ready/Needs Work/Not Ready)
- **Testing Date and Environment**: OS, CPU cores/speed, RAM capacity, disk type (NVMe/SSD/HDD), Node.js version, ast-grep version, MCP server version
- **Stress Testing Methodology**: Explain focus on pushing tools to limits - timeout testing at multiple thresholds (30s, 60s, 120s, 180s, 240s, 300s), memory profiling during execution, result truncation testing with 100-10000 matches, error recovery testing with malformed files, complex pattern testing (5+ nesting levels, 10+ metavariables)
- **Repositories Tested**: List of 2-3 large repositories actually tested (recommend React, Django, Tokio)
- **Critical Findings Preview**: 5-7 most important discoveries about performance limits, bottlenecks, and optimization opportunities
- **Production Readiness Verdict**: Overall assessment with specific recommendations
- **Link References**: TEST_REPOSITORIES.md, SMALL_REPO_RESULTS.md, MEDIUM_REPO_RESULTS.md

**2. Test Environment Setup (lines 102-180):**
- **System Specifications**: Detailed hardware specs - CPU model/cores/speed, RAM capacity/speed, disk type/capacity, OS version
- **Software Versions**: ast-grep version, Node.js/Bun version, MCP server version, system libraries
- **Test Workspace**: Location where repositories were cloned (e.g., `d:/_Project/_test-repos/large/`), disk space available
- **Monitoring Tools**: Tools used for performance monitoring - `process.memoryUsage()` for memory, `Date.now()` for timing, system monitors (Task Manager/Activity Monitor/htop), profiling tools if used
- **Testing Date Range**: Start and end dates of stress testing phase
- **Repositories Cloned**: Actual clone commands, git commit hashes, file counts verified with `tokei`, repository sizes on disk
- **Baseline Performance**: System baseline measurements without MCP tools running (idle memory, CPU usage)

**3. Stress Testing Methodology Details (lines 182-280):**
- **Timeout Testing Strategy**: Test patterns at multiple timeout thresholds - 30s (default), 60s, 120s, 180s, 240s, 300s (maximum). Document which patterns complete at each threshold, which patterns timeout, and performance degradation patterns.
- **Memory Profiling Strategy**: Monitor memory usage before execution, during execution (peak), and after execution. Track heap usage, external memory, RSS (Resident Set Size). Identify memory leaks or accumulation patterns.
- **Result Truncation Testing**: Test with maxMatches values: 100 (default), 500, 1000, 5000, 10000 (maximum). Measure performance impact of large result sets, verify truncation behavior, test summary accuracy.
- **Complex Pattern Testing**: Test patterns with 5+ nesting levels, 10+ metavariables, multiple constraints (3+), very long patterns (500+ characters). Measure parsing overhead and execution time impact.
- **Error Recovery Testing**: Test with malformed files, binary files, very large files (>10MB), encoding issues (UTF-8, UTF-16, Latin-1). Verify graceful degradation and error messages.
- **Edge Case Scenarios**: Very deep directory structures (10+ levels), symbolic links, permission issues, concurrent executions, interrupted operations.
- **Performance Degradation Analysis**: Compare execution times across repository sizes (small vs medium vs large). Identify non-linear scaling patterns. Calculate performance degradation rate.

**4. Repository 1: facebook/react (JavaScript/TypeScript) - Lines 282-900:**

**4.1 Repository Information (lines 282-320):**
- Clone command: `git clone https://github.com/facebook/react.git --depth 1` (shallow clone to save time)
- Actual file count: Use `tokei` to count (expected ~3000-4000 files)
- Repository size on disk: GB measurement
- Primary languages: JavaScript percentage, TypeScript percentage, JSX files
- Repository characteristics: Complex JSX patterns, React hooks, internal APIs, extensive test files
- Testing focus: JSX parsing stress, hook pattern complexity, large result sets, timeout scenarios

**4.2 Stress Test 1: Component Definition Search with Large Result Sets (lines 322-420):**
- **Pattern**: `function $NAME($$PROPS) { $$BODY }` (matches many functional components)
- **Expected Matches**: 500-2000+ (stress test for result handling)
- **Tool**: ast_search

**Test Execution Series:**
1. **maxMatches=100 (default)**: Execution time, memory usage, truncation behavior
2. **maxMatches=500**: Performance impact vs 100, memory increase
3. **maxMatches=1000**: Further performance degradation, memory consumption
4. **maxMatches=5000**: Significant performance impact expected
5. **maxMatches=10000 (maximum)**: Maximum stress test

**Results for Each maxMatches Value:**
- Execution time: Xms
- Peak memory usage: XMB
- Matches found: X (total before truncation)
- Matches returned: X (after truncation)
- Truncation occurred: Yes/No
- Skipped lines: X
- Performance degradation: X% compared to previous threshold

**Bottleneck Analysis:**
- Is performance linear with maxMatches increase?
- Memory consumption pattern: linear/exponential?
- At what point does performance become unacceptable (>60s)?
- JSON parsing overhead for large result sets
- Recommendations for optimization

**4.3 Stress Test 2: Timeout Testing with Complex JSX Patterns (lines 422-520):**
- **Pattern**: `<$COMPONENT $$PROPS>$$CHILDREN</$COMPONENT>` (complex JSX matching)
- **Complexity**: High - JSX parsing, nested components, prop spreading
- **Tool**: ast_search

**Timeout Threshold Testing:**
1. **timeout=30000ms (30s, default)**: Does it complete? If not, how many files processed?
2. **timeout=60000ms (60s)**: Does it complete? Performance metrics
3. **timeout=120000ms (120s)**: Does it complete? Performance metrics
4. **timeout=180000ms (180s)**: Does it complete? Performance metrics
5. **timeout=240000ms (240s)**: Does it complete? Performance metrics
6. **timeout=300000ms (300s, maximum)**: Does it complete? Performance metrics

**Results for Each Timeout:**
- Completed: Yes/No
- Execution time: Xms (if completed)
- Files processed: X out of Y total
- Matches found: X
- Memory usage: XMB peak
- Error message: (if timeout occurred)

**Timeout Analysis:**
- At what timeout threshold does pattern complete?
- Is timeout handling graceful (partial results returned)?
- Performance scaling: does doubling timeout double files processed?
- Recommendations: suggested timeout for production use

**4.4 Stress Test 3: Hook Pattern with Deep Nesting (lines 522-620):**
- **Pattern**: `useEffect(() => { $$ }, [$$DEPS])` (React hook with dependency array)
- **Complexity**: Moderate - callback function, dependency array parsing
- **Tool**: ast_search

**Test Execution:**
- Standard execution with default parameters
- Execution time, memory usage, match count
- Test with context=0, context=10, context=50, context=100 to measure context impact

**Context Impact Analysis:**
- How does context parameter affect performance?
- Memory consumption increase per context line
- Recommendations for optimal context value

**4.5 Stress Test 4: Deprecated Lifecycle Method Detection (lines 622-700):**
- **Pattern**: `componentWillMount($$ARGS) { $$BODY }` (deprecated React lifecycle)
- **Tool**: ast_run_rule with severity='error'
- **Expected**: Few matches (deprecated methods should be rare)

**Test Execution:**
- Rule generation and execution
- YAML generation time
- Scan execution time
- Temporary file handling

**Rule Performance Analysis:**
- Overhead of YAML generation and temp file creation
- Scan performance vs direct search performance
- Recommendations for rule-based scanning at scale

**4.6 Stress Test 5: Multi-File Refactoring Simulation (lines 702-800):**
- **Pattern**: `var $NAME = $VALUE`
- **Replacement**: `const $NAME = $VALUE`
- **Tool**: ast_replace with dryRun=true
- **Expected**: Large number of changes across many files

**Test Execution:**
- Execution time for diff generation
- Memory usage during diff parsing
- Number of files affected
- Total changes count
- Diff output size (MB)

**Refactoring Performance Analysis:**
- Performance impact of large-scale refactoring
- Memory consumption for diff storage
- Diff parsing overhead
- Recommendations for batch refactoring strategies

**4.7 Stress Test 6: Very Complex Pattern with Multiple Metavariables (lines 802-880):**
- **Pattern**: Complex pattern with 10+ metavariables and 5+ nesting levels
- **Example**: `function $NAME($ARG1, $ARG2, $ARG3) { $$ if ($COND1) { $$ if ($COND2) { $$ if ($COND3) { $$BODY } $$ } $$ } $$ }`
- **Complexity**: Very High - pattern parsing overhead, matching complexity

**Test Execution:**
- Pattern validation time
- Execution time
- Memory usage
- Match accuracy

**Complex Pattern Analysis:**
- Pattern parsing overhead
- Execution time impact of pattern complexity
- At what complexity level does performance degrade significantly?
- Recommendations for pattern simplification

**4.8 Summary for React (lines 882-920):**
- Total stress tests executed: 6
- Timeout scenarios encountered: X
- Memory consumption patterns: Description
- Bottlenecks identified: List 3-5 specific bottlenecks
- Performance limits: Maximum file count, maximum matches, maximum timeout needed
- Production readiness: Assessment for React-scale codebases
- Optimization recommendations: Specific improvements needed

**5. Repository 2: django/django (Python) - Lines 922-1540:**

**5.1 Repository Information (lines 922-960):**
- Clone command and file count (~4000-5000 files)
- Repository size on disk
- Python version used for testing
- Repository characteristics: ORM patterns, class hierarchies, metaclasses, extensive middleware

**5.2 Stress Test 1: Model Definition Search with Memory Profiling (lines 962-1060):**
- **Pattern**: `class $NAME(models.Model): $I have created the following plan after thorough exploration and analysis of the codebase. Follow the below plan verbatim. Trust the files and references. Do not re-verify what's written in the plan. Explore only when absolutely necessary. First implement all the proposed file changes and then I'll review all the changes together at the end.


- **Focus**: Memory consumption with large Python file parsing
- **Tool**: ast_search

**Memory Profiling:**
- Memory before execution: XMB
- Memory during execution (peak): XMB
- Memory after execution: XMB
- Memory released after GC: XMB
- Memory leak detection: Any unreleased memory?

**Memory Analysis:**
- Memory consumption per file parsed
- Memory accumulation patterns
- Garbage collection effectiveness
- Recommendations for memory optimization

**5.3 Stress Test 2: ORM Query Pattern with Timeout Testing (lines 1062-1160):**
- **Pattern**: `$MODEL.objects.filter($$ARGS)`
- **Expected**: Very high match count (ORM queries are common)
- **Tool**: ast_search

**Timeout Testing:**
- Test at 30s, 60s, 120s, 180s, 240s, 300s thresholds
- Document completion times and partial results
- Analyze timeout behavior on Python codebase

**5.4 Stress Test 3: Class Hierarchy with Deep Nesting (lines 1162-1260):**
- **Pattern**: `class $NAME($BASE): $I have created the following plan after thorough exploration and analysis of the codebase. Follow the below plan verbatim. Trust the files and references. Do not re-verify what's written in the plan. Explore only when absolutely necessary. First implement all the proposed file changes and then I'll review all the changes together at the end.


- **Focus**: Deeply nested class hierarchies (Django has many)
- **Tool**: ast_search

**Nesting Analysis:**
- Performance with deeply nested classes (5+ inheritance levels)
- Pattern matching accuracy on complex hierarchies
- Memory consumption for nested structure parsing

**5.5 Stress Test 4: Constraint-Based Rule with Multiple Conditions (lines 1262-1360):**
- **Pattern**: `$OBJ.$METHOD($$ARGS)`
- **Constraints**: Multiple constraints on OBJ and METHOD
- **Tool**: ast_run_rule

**Constraint Performance:**
- Overhead of constraint evaluation
- Performance with 1, 2, 3, 4, 5 constraints
- Constraint complexity impact

**5.6 Stress Test 5: Large-Scale Import Refactoring (lines 1362-1460):**
- **Pattern**: `from django.conf.urls import $ITEMS`
- **Replacement**: `from django.urls import $ITEMS`
- **Tool**: ast_replace (dryRun=true)
- **Expected**: Many files affected

**Refactoring Performance:**
- Multi-file refactoring at scale
- Diff generation performance
- Memory consumption for large diffs

**5.7 Stress Test 6: Error Recovery with Malformed Files (lines 1462-1540):**
- **Test**: Introduce malformed Python files or test with files that have syntax errors
- **Focus**: Error recovery, graceful degradation, skipped lines reporting

**Error Recovery Analysis:**
- How many files can have errors before tool fails?
- Are partial results returned?
- Error message quality
- Skipped lines reporting accuracy

**5.8 Summary for Django (lines 1542-1580):**
- Total stress tests: 6
- Timeout scenarios: X
- Memory consumption: Peak XMB, average XMB
- Bottlenecks: List specific bottlenecks
- Python-specific observations
- Production readiness assessment

**6. Repository 3: tokio-rs/tokio (Rust) - Lines 1582-2200:**

**6.1 Repository Information (lines 1582-1620):**
- Clone command and file count (~2500-3500 files)
- Repository size on disk
- Rust version used
- Repository characteristics: Async/await, macros, lifetimes, trait bounds

**6.2 Stress Test 1: Async Function Search with Complex Patterns (lines 1622-1720):**
- **Pattern**: `async fn $NAME<$$GENERICS>($$PARAMS) -> $RET where $$BOUNDS { $$BODY }`
- **Complexity**: Very High - generics, lifetimes, trait bounds, async
- **Tool**: ast_search

**Complex Rust Pattern Analysis:**
- Pattern parsing overhead for complex Rust syntax
- Execution time impact
- Match accuracy on complex signatures

**6.3 Stress Test 2: Macro Definition Search with Timeout Testing (lines 1722-1820):**
- **Pattern**: `macro_rules! $NAME { $$ }`
- **Focus**: Macro parsing complexity
- **Tool**: ast_search

**Macro Parsing Performance:**
- Rust macro parsing overhead
- Timeout behavior with macro-heavy code
- Performance recommendations

**6.4 Stress Test 3: Unsafe Block Detection (lines 1822-1900):**
- **Pattern**: `unsafe { $$BODY }`
- **Tool**: ast_run_rule with severity='warning'

**Unsafe Block Analysis:**
- Performance on Rust safety patterns
- Rule-based scanning effectiveness

**6.5 Stress Test 4: Trait Implementation with Constraints (lines 1902-2000):**
- **Pattern**: `impl $TRAIT for $TYPE { $$ }`
- **Constraints**: Filter by specific trait names
- **Tool**: ast_run_rule

**Trait Pattern Performance:**
- Constraint effectiveness on Rust traits
- Performance with complex trait implementations

**6.6 Stress Test 5: Result Truncation with Large Match Sets (lines 2002-2100):**
- **Pattern**: Common Rust pattern that matches frequently
- **Focus**: maxMatches behavior with 1000+ matches
- **Tool**: ast_search

**Truncation Testing:**
- Test maxMatches at 100, 500, 1000, 5000, 10000
- Verify truncation accuracy
- Performance impact of large result sets

**6.7 Stress Test 6: Memory Consumption with Complex Syntax (lines 2102-2180):**
- **Focus**: Memory usage with Rust's complex syntax (lifetimes, generics, macros)
- **Tool**: ast_search with various patterns

**Memory Profiling:**
- Memory consumption per Rust file
- Impact of syntax complexity on memory
- Comparison with JavaScript and Python memory usage

**6.8 Summary for Tokio (lines 2182-2220):**
- Total stress tests: 6
- Rust-specific performance observations
- Memory consumption patterns
- Bottlenecks identified
- Production readiness for Rust codebases

**7. Cross-Repository Performance Analysis (lines 2222-2500):**

**7.1 Scaling Analysis (lines 2222-2320):**
- **Performance vs File Count**: Graph/table showing execution time vs file count across small (100-500), medium (500-2000), large (2000-5000) repositories
- **Scaling Pattern**: Linear, polynomial, or exponential? Calculate scaling factor.
- **Performance Degradation Rate**: Percentage increase in execution time per 1000 files
- **Memory Scaling**: Memory consumption vs file count pattern
- **Bottleneck Identification**: At what file count does performance become unacceptable?

**7.2 Timeout Scenario Analysis (lines 2322-2400):**
- **Timeout Frequency**: How often do timeouts occur at each threshold (30s, 60s, 120s, etc.)?
- **Pattern Complexity vs Timeout**: Which pattern types are most likely to timeout?
- **Repository Size vs Timeout**: Correlation between file count and timeout likelihood
- **Timeout Handling Quality**: Are partial results returned? Error messages clear?
- **Recommendations**: Suggested default timeouts for small/medium/large repositories

**7.3 Memory Consumption Patterns (lines 2402-2480):**
- **Peak Memory by Repository Size**: Small (XMB), Medium (XMB), Large (XMB)
- **Memory per File**: Average memory consumption per file parsed
- **Memory Leaks**: Any evidence of memory not being released?
- **Language-Specific Memory Usage**: JavaScript vs Python vs Rust memory patterns
- **Memory Limits**: At what point does memory become a constraint?
- **Recommendations**: Suggested memory requirements for production use

**7.4 Result Truncation Behavior (lines 2482-2540):**
- **Truncation Accuracy**: Is truncation working correctly at all maxMatches thresholds?
- **Performance Impact**: How does maxMatches value affect performance?
- **Summary Accuracy**: Are totalMatches and truncated flags correct?
- **Recommendations**: Optimal maxMatches values for different use cases

**8. Bottleneck Identification and Analysis (lines 2542-2720):**

**8.1 Critical Bottlenecks (lines 2542-2600):**
- **Bottleneck 1**: [Name] - Description, impact, affected operations, severity (Critical/High/Medium)
- **Bottleneck 2**: [Name] - Description, impact, affected operations, severity
- **Bottleneck 3**: [Name] - Description, impact, affected operations, severity
- **Bottleneck 4**: [Name] - Description, impact, affected operations, severity
- **Bottleneck 5**: [Name] - Description, impact, affected operations, severity

For each bottleneck:
- Root cause analysis
- Performance impact (quantified)
- Affected scenarios
- Workarounds (if any)
- Optimization recommendations

**8.2 Performance Degradation Patterns (lines 2602-2660):**
- **Non-Linear Scaling**: Where does performance degrade non-linearly?
- **Threshold Effects**: Are there specific file counts where performance drops significantly?
- **Pattern Complexity Impact**: How much does pattern complexity affect performance?
- **Language-Specific Degradation**: Do some languages perform worse at scale?

**8.3 Resource Constraints (lines 2662-2720):**
- **Memory Constraints**: At what point does memory become limiting factor?
- **CPU Constraints**: Is CPU utilization optimal or are there inefficiencies?
- **I/O Constraints**: Is disk I/O a bottleneck for large repositories?
- **Timeout Constraints**: Are timeout limits appropriate for large repositories?

**9. Edge Cases and Error Scenarios (lines 2722-2900):**

**9.1 Timeout Edge Cases (lines 2722-2780):**
- **Patterns that Always Timeout**: List patterns that consistently timeout even at 300s
- **Partial Results**: Are partial results returned on timeout? Quality?
- **Timeout Error Messages**: Are error messages helpful?
- **Recovery**: Can execution be resumed after timeout?

**9.2 Memory Edge Cases (lines 2782-2840):**
- **Out of Memory Scenarios**: Did any tests cause OOM errors?
- **Memory Leaks**: Evidence of memory not being released
- **Large File Handling**: How are files >10MB handled?
- **Result Set Memory**: Memory consumption for 10000 matches

**9.3 Error Recovery Edge Cases (lines 2842-2900):**
- **Malformed Files**: How are syntax errors handled?
- **Binary Files**: Are binary files skipped gracefully?
- **Encoding Issues**: How are non-UTF-8 files handled?
- **Permission Errors**: How are inaccessible files handled?
- **Skipped Lines Accuracy**: Is skippedLines count accurate?

**10. Optimization Recommendations (lines 2902-3100):**

**10.1 Critical Optimizations (Priority 1) (lines 2902-2980):**
- **Optimization 1**: [Name] - Description, expected impact, implementation complexity, estimated effort
- **Optimization 2**: [Name] - Description, expected impact, implementation complexity, estimated effort
- **Optimization 3**: [Name] - Description, expected impact, implementation complexity, estimated effort

For each optimization:
- Problem being solved
- Proposed solution
- Expected performance improvement (quantified)
- Implementation approach
- Risks and trade-offs
- Priority justification

**10.2 High Priority Optimizations (Priority 2) (lines 2982-3040):**
- List 3-5 high priority optimizations
- Similar structure to critical optimizations
- Focus on significant performance improvements

**10.3 Medium Priority Optimizations (Priority 3) (lines 3042-3080):**
- List 3-5 medium priority optimizations
- Nice-to-have improvements
- Incremental performance gains

**10.4 Configuration Recommendations (lines 3082-3120):**
- **Timeout Recommendations**: Suggested defaults for small/medium/large repos
- **MaxMatches Recommendations**: Optimal values for different use cases
- **Context Recommendations**: Optimal context values balancing detail vs performance
- **Memory Recommendations**: Minimum RAM requirements for production use

**11. Production Readiness Assessment (lines 3122-3280):**

**11.1 Overall Readiness Verdict (lines 3122-3180):**
- **Verdict**: Production Ready / Ready with Caveats / Needs Significant Work / Not Ready
- **Confidence Level**: High / Medium / Low
- **Justification**: Detailed explanation of verdict
- **Conditions for Production Use**: List specific conditions or limitations

**11.2 Readiness by Repository Size (lines 3182-3240):**
- **Small Repositories (100-500 files)**: Ready? Limitations?
- **Medium Repositories (500-2000 files)**: Ready? Limitations?
- **Large Repositories (2000-5000 files)**: Ready? Limitations?
- **Very Large Repositories (5000+ files)**: Ready? Limitations?

**11.3 Readiness by Use Case (lines 3242-3300):**
- **Interactive Use (AI agents)**: Ready? Response time acceptable?
- **Batch Processing**: Ready? Performance acceptable?
- **CI/CD Integration**: Ready? Reliability acceptable?
- **Code Quality Scanning**: Ready? Accuracy acceptable?

**11.4 Known Limitations for Production (lines 3302-3340):**
- List 5-10 specific limitations that affect production use
- For each limitation: description, impact, workaround, priority to fix

**12. Performance Metrics Summary (lines 3342-3480):**

**12.1 Execution Time Statistics (lines 3342-3400):**
- **By Repository Size**: Min, max, average, median, std dev for small/medium/large
- **By Pattern Complexity**: Simple, moderate, complex, very complex patterns
- **By Tool**: ast_search, ast_replace, ast_run_rule average times
- **Timeout Rate**: Percentage of tests that timed out at each threshold

**12.2 Memory Statistics (lines 3402-3440):**
- **Peak Memory by Repository**: Small (XMB), Medium (XMB), Large (XMB)
- **Average Memory per File**: X KB/file
- **Memory Growth Rate**: X MB per 1000 files
- **Memory Efficiency**: Comparison with ast-grep CLI direct usage

**12.3 Accuracy Statistics (lines 3442-3480):**
- **Match Accuracy**: Percentage of correct matches
- **False Positive Rate**: Estimated percentage
- **False Negative Rate**: Estimated percentage
- **Skipped Lines**: Total across all tests, percentage of total lines
- **Error Rate**: Percentage of tests with errors

**13. Comparison with Previous Testing Phases (lines 3482-3620):**

**13.1 Performance Scaling Comparison (lines 3482-3540):**
- **Small vs Medium**: Performance increase percentage
- **Medium vs Large**: Performance increase percentage
- **Small vs Large**: Overall scaling factor
- **Scaling Pattern**: Linear, polynomial, exponential?
- **Scaling Efficiency**: Is scaling acceptable?

**13.2 Issue Frequency Comparison (lines 3542-3600):**
- **Timeout Frequency**: Small (X%), Medium (X%), Large (X%)
- **Memory Issues**: Small (X%), Medium (X%), Large (X%)
- **Error Frequency**: Small (X%), Medium (X%), Large (X%)
- **Pattern**: Do issues increase linearly with size?

**13.3 Tool Behavior Consistency (lines 3602-3640):**
- **Consistent Behavior**: Do tools behave consistently across sizes?
- **Emergent Issues**: Issues that only appear at large scale
- **Reliability**: Is reliability consistent across sizes?

**14. Conclusion (lines 3642-3760):**

**14.1 Key Findings (lines 3642-3700):**
- **Finding 1**: [Most critical discovery]
- **Finding 2**: [Second most critical discovery]
- **Finding 3**: [Third most critical discovery]
- **Finding 4**: [Fourth most critical discovery]
- **Finding 5**: [Fifth most critical discovery]
- **Finding 6**: [Sixth most critical discovery]
- **Finding 7**: [Seventh most critical discovery]

For each finding:
- Description
- Impact on production use
- Recommended action

**14.2 Production Readiness Summary (lines 3702-3740):**
- **Overall Assessment**: Final verdict with confidence level
- **Strengths**: What works well at scale
- **Weaknesses**: What needs improvement
- **Blockers**: Critical issues preventing production use (if any)
- **Timeline**: Estimated time to production readiness (if not ready)

**14.3 Next Steps (lines 3742-3780):**
- **Immediate Actions**: Critical fixes needed before production
- **Short-term Actions**: High priority optimizations (1-2 weeks)
- **Medium-term Actions**: Medium priority improvements (1-2 months)
- **Long-term Actions**: Nice-to-have enhancements (3+ months)
- **Refinement Plan**: Preparation for creating REFINEMENT_PLAN.md

**14.4 References (lines 3782-3800):**
- Link to TEST_REPOSITORIES.md
- Link to SMALL_REPO_RESULTS.md
- Link to MEDIUM_REPO_RESULTS.md
- Link to tool source code
- Link to ast-grep documentation
- Link to stress testing procedure guide

**15. Appendices (lines 3802-3950):**

**Appendix A: Detailed Performance Data (lines 3802-3860):**
- CSV-style tables with all performance metrics
- Execution times for all tests
- Memory measurements for all tests
- Timeout occurrences

**Appendix B: Error Logs (lines 3862-3900):**
- Sample error messages from timeout scenarios
- Sample error messages from memory issues
- Sample error messages from parsing failures
- Analysis of error message quality

**Appendix C: Test Commands (lines 3902-3940):**
- Exact commands used for each test
- Parameter values for reproducibility
- Environment variables set
- Monitoring commands used

**Appendix D: Optimization Proposals (lines 3942-3980):**
- Detailed technical proposals for top 5 optimizations
- Code-level suggestions (without writing actual code)
- Performance impact estimates
- Implementation complexity analysis

### tests\test-large-repos-stress.md(NEW)

References: 

- tests\TEST_REPOSITORIES.md
- tests\test-small-repos.md
- tests\test-medium-repos-comparison.md
- src\tools\search.ts
- src\tools\replace.ts
- src\tools\scan.ts

**Create comprehensive stress testing procedure guide for large repositories (2500-3000 lines):**

**1. Prerequisites (lines 1-80):**
- **System Requirements**: Minimum 16GB RAM (32GB recommended), 50GB free disk space, multi-core CPU (4+ cores recommended), fast disk (SSD/NVMe strongly recommended)
- **Software Requirements**: ast-grep installed and verified, Node.js/Bun installed, MCP server functional, monitoring tools available
- **Performance Monitoring Tools**: `process.memoryUsage()` for Node.js memory, system monitors (Task Manager/Activity Monitor/htop), profiling tools (optional: Chrome DevTools, clinic.js)
- **Time Commitment**: Estimate 8-12 hours for complete stress testing of 2-3 large repositories
- **Warning**: Stress testing will consume significant system resources. Close other applications. Do not run on production systems.

**2. Workspace Setup (lines 82-150):**
- **Create Test Workspace**: `mkdir d:/_Project/_test-repos/large`
- **Clone Repositories** (use shallow clones to save time and space):
  ```bash
  cd d:/_Project/_test-repos/large
  git clone --depth 1 https://github.com/facebook/react.git
  git clone --depth 1 https://github.com/django/django.git
  git clone --depth 1 https://github.com/tokio-rs/tokio.git
  ```
- **Verify Clones**: Use `tokei` to count files in each repository
- **Document Versions**: Record git commit hashes for reproducibility
- **Disk Space Check**: Verify sufficient space available (repositories + test results)
- **Baseline Measurements**: Record system idle state - memory usage, CPU usage, disk I/O

**3. Stress Testing Methodology (lines 152-300):**

**3.1 Timeout Testing Strategy (lines 152-200):**
- **Purpose**: Identify patterns that approach or exceed timeout limits
- **Approach**: Test same pattern with increasing timeout thresholds: 30s, 60s, 120s, 180s, 240s, 300s
- **Metrics to Collect**: Completion status (completed/timeout), execution time if completed, files processed, matches found, partial results quality
- **Success Criteria**: Pattern completes within 300s, partial results returned on timeout, error messages are clear
- **Failure Scenarios**: Pattern never completes even at 300s, no partial results on timeout, cryptic error messages

**3.2 Memory Profiling Strategy (lines 202-250):**
- **Purpose**: Identify memory consumption patterns and potential leaks
- **Approach**: Monitor memory before, during (peak), and after execution. Force garbage collection and measure released memory.
- **Metrics to Collect**: Heap used, heap total, external memory, RSS (Resident Set Size), memory per file parsed, memory growth rate
- **Monitoring Method**:
  ```javascript
  const before = process.memoryUsage();
  // Execute tool
  const during = process.memoryUsage(); // Peak
  global.gc(); // Force GC if --expose-gc flag used
  const after = process.memoryUsage();
  ```
- **Success Criteria**: Memory scales linearly with file count, memory released after execution, no memory leaks detected
- **Failure Scenarios**: Memory grows exponentially, memory not released, out-of-memory errors

**3.3 Result Truncation Testing Strategy (lines 252-300):**
- **Purpose**: Verify maxMatches parameter behavior and performance impact
- **Approach**: Test same pattern with maxMatches values: 100, 500, 1000, 5000, 10000
- **Metrics to Collect**: Execution time for each maxMatches value, memory consumption, truncation accuracy (is summary.truncated correct?), total matches vs returned matches
- **Success Criteria**: Truncation works correctly, performance scales reasonably with maxMatches, summary fields accurate
- **Failure Scenarios**: Truncation incorrect, performance degrades exponentially, summary fields inaccurate

**4. Test Execution Framework (lines 302-500):**

**4.1 Node.js Test Script Structure (lines 302-400):**
```javascript
// test-large-repos-stress.js
import { SearchTool, ReplaceTool, ScanTool } from '../src/tools/index.js';
import { AstGrepBinaryManager } from '../src/core/binary-manager.js';
import { WorkspaceManager } from '../src/core/workspace-manager.js';

// Initialize tools
const binaryManager = new AstGrepBinaryManager({ useSystem: true });
await binaryManager.initialize();
const workspaceManager = new WorkspaceManager();

const searchTool = new SearchTool(binaryManager, workspaceManager);
const replaceTool = new ReplaceTool(binaryManager, workspaceManager);
const scanTool = new ScanTool(workspaceManager, binaryManager);

// Stress test function
async function stressTest(config) {
  const memBefore = process.memoryUsage();
  const startTime = Date.now();
  
  try {
    const result = await config.tool.execute(config.params);
    const executionTime = Date.now() - startTime;
    const memAfter = process.memoryUsage();
    
    return {
      success: true,
      executionTime,
      memoryUsed: memAfter.heapUsed - memBefore.heapUsed,
      peakMemory: memAfter.heapUsed,
      result
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    return {
      success: false,
      executionTime,
      error: error.message,
      errorType: error.constructor.name
    };
  }
}

// Timeout testing function
async function testTimeouts(pattern, paths, language) {
  const timeouts = [30000, 60000, 120000, 180000, 240000, 300000];
  const results = [];
  
  for (const timeout of timeouts) {
    console.log(`Testing with timeout: ${timeout}ms`);
    const result = await stressTest({
      tool: searchTool,
      params: { pattern, paths, language, timeoutMs: timeout }
    });
    results.push({ timeout, ...result });
    
    if (result.success) {
      console.log(`Completed in ${result.executionTime}ms`);
      break; // No need to test longer timeouts
    } else {
      console.log(`Timeout occurred`);
    }
  }
  
  return results;
}

// Memory profiling function
async function profileMemory(pattern, paths, language) {
  // Force GC before test (requires --expose-gc flag)
  if (global.gc) global.gc();
  
  const memBefore = process.memoryUsage();
  const result = await stressTest({
    tool: searchTool,
    params: { pattern, paths, language }
  });
  const memDuring = process.memoryUsage();
  
  // Force GC after test
  if (global.gc) global.gc();
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for GC
  
  const memAfter = process.memoryUsage();
  
  return {
    ...result,
    memoryProfile: {
      before: memBefore,
      during: memDuring,
      after: memAfter,
      leaked: memAfter.heapUsed - memBefore.heapUsed
    }
  };
}

// Result truncation testing function
async function testTruncation(pattern, paths, language) {
  const maxMatchesValues = [100, 500, 1000, 5000, 10000];
  const results = [];
  
  for (const maxMatches of maxMatchesValues) {
    console.log(`Testing with maxMatches: ${maxMatches}`);
    const result = await stressTest({
      tool: searchTool,
      params: { pattern, paths, language, maxMatches }
    });
    results.push({ maxMatches, ...result });
  }
  
  return results;
}
```

**4.2 Test Execution Commands (lines 402-450):**
- **Run with memory profiling**: `node --expose-gc test-large-repos-stress.js`
- **Run with increased memory limit**: `node --max-old-space-size=8192 test-large-repos-stress.js`
- **Monitor system resources**: Use separate terminal with `htop` or Task Manager
- **Log output**: Redirect to file for analysis: `node test-large-repos-stress.js > stress-test-results.log 2>&1`

**4.3 Monitoring During Execution (lines 452-500):**
- **Real-time Memory Monitoring**: Watch memory usage in system monitor
- **CPU Utilization**: Monitor CPU usage to identify bottlenecks
- **Disk I/O**: Monitor disk activity to identify I/O bottlenecks
- **Process Status**: Watch for process hangs or crashes
- **Log Warnings**: Monitor console output for warnings or errors

**5. Repository-Specific Test Scenarios (lines 502-1500):**

**5.1 React Repository Stress Tests (lines 502-700):**

**Test 1: Component Search with Large Result Sets**
- Pattern: `function $NAME($$PROPS) { $$BODY }`
- Expected matches: 500-2000+
- Test with maxMatches: 100, 500, 1000, 5000, 10000
- Measure: execution time, memory usage, truncation accuracy
- Document: performance degradation pattern, optimal maxMatches value

**Test 2: JSX Pattern with Timeout Testing**
- Pattern: `<$COMPONENT $$PROPS>$$CHILDREN</$COMPONENT>`
- Test with timeouts: 30s, 60s, 120s, 180s, 240s, 300s
- Measure: completion status, execution time, partial results
- Document: minimum timeout needed, timeout handling quality

**Test 3: Hook Pattern with Context Variations**
- Pattern: `useEffect(() => { $$ }, [$$DEPS])`
- Test with context: 0, 10, 50, 100
- Measure: execution time impact, memory impact
- Document: optimal context value, performance trade-offs

**Test 4: Deprecated Lifecycle Method Rule**
- Pattern: `componentWillMount($$ARGS) { $$BODY }`
- Tool: ast_run_rule
- Measure: YAML generation time, scan time, total time
- Document: rule overhead vs direct search

**Test 5: Multi-File Refactoring Simulation**
- Pattern: `var $NAME = $VALUE`
- Replacement: `const $NAME = $VALUE`
- Tool: ast_replace (dryRun=true)
- Measure: execution time, memory usage, diff size
- Document: refactoring performance at scale

**Test 6: Very Complex Pattern**
- Pattern: Complex pattern with 10+ metavariables, 5+ nesting levels
- Measure: pattern parsing time, execution time, memory usage
- Document: complexity limits, performance impact

**5.2 Django Repository Stress Tests (lines 702-900):**

**Test 1: Model Search with Memory Profiling**
- Pattern: `class $NAME(models.Model): $I have created the following plan after thorough exploration and analysis of the codebase. Follow the below plan verbatim. Trust the files and references. Do not re-verify what's written in the plan. Explore only when absolutely necessary. First implement all the proposed file changes and then I'll review all the changes together at the end.


- Focus: Memory consumption patterns
- Measure: memory before/during/after, memory per file, memory leaks
- Document: memory efficiency, optimization opportunities

**Test 2: ORM Query Pattern with Timeout Testing**
- Pattern: `$MODEL.objects.filter($$ARGS)`
- Expected: Very high match count
- Test with timeouts: 30s, 60s, 120s, 180s, 240s, 300s
- Document: timeout behavior on Python codebase

**Test 3: Class Hierarchy with Deep Nesting**
- Pattern: `class $NAME($BASE): $I have created the following plan after thorough exploration and analysis of the codebase. Follow the below plan verbatim. Trust the files and references. Do not re-verify what's written in the plan. Explore only when absolutely necessary. First implement all the proposed file changes and then I'll review all the changes together at the end.


- Focus: Deeply nested class hierarchies
- Measure: execution time, memory usage, match accuracy
- Document: nesting depth impact on performance

**Test 4: Constraint-Based Rule with Multiple Conditions**
- Pattern: `$OBJ.$METHOD($$ARGS)`
- Constraints: Multiple constraints on OBJ and METHOD
- Test with: 1, 2, 3, 4, 5 constraints
- Document: constraint overhead, performance scaling

**Test 5: Large-Scale Import Refactoring**
- Pattern: `from django.conf.urls import $ITEMS`
- Replacement: `from django.urls import $ITEMS`
- Tool: ast_replace (dryRun=true)
- Measure: multi-file refactoring performance
- Document: diff generation performance, memory usage

**Test 6: Error Recovery Testing**
- Introduce malformed Python files or test with syntax errors
- Measure: error handling, partial results, skipped lines
- Document: error recovery quality, graceful degradation

**5.3 Tokio Repository Stress Tests (lines 902-1100):**

**Test 1: Async Function with Complex Signatures**
- Pattern: `async fn $NAME<$$GENERICS>($$PARAMS) -> $RET where $$BOUNDS { $$BODY }`
- Focus: Complex Rust syntax parsing
- Measure: pattern parsing time, execution time, match accuracy
- Document: Rust complexity handling

**Test 2: Macro Definition Search**
- Pattern: `macro_rules! $NAME { $$ }`
- Focus: Macro parsing complexity
- Test with timeouts to identify macro parsing overhead
- Document: macro parsing performance

**Test 3: Unsafe Block Detection Rule**
- Pattern: `unsafe { $$BODY }`
- Tool: ast_run_rule with severity='warning'
- Measure: rule-based scanning performance
- Document: rule effectiveness on Rust code

**Test 4: Trait Implementation with Constraints**
- Pattern: `impl $TRAIT for $TYPE { $$ }`
- Constraints: Filter by specific trait names
- Measure: constraint effectiveness, performance
- Document: trait pattern performance

**Test 5: Result Truncation Testing**
- Pattern: Common Rust pattern (e.g., `$EXPR?`)
- Test with maxMatches: 100, 500, 1000, 5000, 10000
- Measure: truncation accuracy, performance impact
- Document: optimal maxMatches for Rust

**Test 6: Memory Profiling with Complex Syntax**
- Various patterns testing lifetimes, generics, macros
- Measure: memory per file, memory efficiency
- Document: Rust-specific memory patterns

**6. Edge Case Testing (lines 1102-1300):**

**6.1 Timeout Edge Cases (lines 1102-1150):**
- **Test 1**: Pattern that consistently times out even at 300s
- **Test 2**: Pattern that completes just under timeout limit
- **Test 3**: Verify partial results are returned on timeout
- **Test 4**: Verify error messages are clear and actionable
- **Test 5**: Test timeout with different repository sizes

**6.2 Memory Edge Cases (lines 1152-1200):**
- **Test 1**: Pattern that causes high memory consumption (>4GB)
- **Test 2**: Test with maxMatches=10000 to stress result storage
- **Test 3**: Test with very large files (>10MB)
- **Test 4**: Monitor for memory leaks over multiple executions
- **Test 5**: Test memory behavior with context=100

**6.3 Error Recovery Edge Cases (lines 1202-1250):**
- **Test 1**: Repository with malformed files (syntax errors)
- **Test 2**: Repository with binary files mixed in
- **Test 3**: Repository with encoding issues (non-UTF-8)
- **Test 4**: Repository with permission errors
- **Test 5**: Verify skippedLines reporting accuracy

**6.4 Complex Pattern Edge Cases (lines 1252-1300):**
- **Test 1**: Pattern with 15+ metavariables
- **Test 2**: Pattern with 7+ nesting levels
- **Test 3**: Pattern with very long string (1000+ characters)
- **Test 4**: Pattern with multiple multi-node metavariables
- **Test 5**: Pattern with complex regex constraints

**7. Performance Benchmarking (lines 1302-1500):**

**7.1 Baseline Performance Tests (lines 1302-1350):**
- **Simple Pattern**: `$FUNC($$ARGS)` - baseline execution time
- **Moderate Pattern**: `function $NAME($$PARAMS) { $$BODY }` - moderate complexity
- **Complex Pattern**: Nested function with multiple metavariables - high complexity
- **Very Complex Pattern**: 10+ metavariables, 5+ nesting - very high complexity
- Document: execution time for each complexity level, establish performance baselines

**7.2 Scaling Tests (lines 1352-1400):**
- **Test 1**: Same pattern on small (500 files), medium (1500 files), large (3500 files) subsets
- **Test 2**: Measure execution time scaling factor
- **Test 3**: Measure memory scaling factor
- **Test 4**: Identify non-linear scaling patterns
- Document: scaling efficiency, performance degradation rate

**7.3 Comparative Performance Tests (lines 1402-1450):**
- **Test 1**: Compare SearchTool vs direct ast-grep CLI (if possible)
- **Test 2**: Compare ReplaceTool vs direct ast-grep CLI
- **Test 3**: Compare ScanTool vs direct ast-grep CLI
- **Test 4**: Measure MCP overhead percentage
- Document: overhead analysis, optimization opportunities

**7.4 Language-Specific Performance Tests (lines 1452-1500):**
- **Test 1**: Same pattern complexity on JavaScript, Python, Rust
- **Test 2**: Measure parsing overhead per language
- **Test 3**: Measure memory consumption per language
- **Test 4**: Identify language-specific bottlenecks
- Document: language performance characteristics

**8. Results Documentation Template (lines 1502-1700):**

**For Each Stress Test, Document:**

```markdown
### Stress Test X: [Test Name]

**Repository**: [React/Django/Tokio]
**Pattern**: `[pattern]`
**Complexity**: Low/Moderate/High/Very High
**Focus**: [Timeout/Memory/Truncation/Error Recovery]

#### Test Configuration
- Tool: ast_search | ast_replace | ast_run_rule
- Paths: [paths]
- Language: [language]
- Parameters: [list all parameters]

#### Execution Results

**Timeout Testing** (if applicable):
| Timeout | Completed | Execution Time | Files Processed | Matches | Memory Peak |
|---------|-----------|----------------|-----------------|---------|-------------|
| 30s     | Yes/No    | Xms            | X/Y             | X       | XMB         |
| 60s     | Yes/No    | Xms            | X/Y             | X       | XMB         |
| 120s    | Yes/No    | Xms            | X/Y             | X       | XMB         |
| 180s    | Yes/No    | Xms            | X/Y             | X       | XMB         |
| 240s    | Yes/No    | Xms            | X/Y             | X       | XMB         |
| 300s    | Yes/No    | Xms            | X/Y             | X       | XMB         |

**Memory Profiling** (if applicable):
- Memory before: XMB (heap: XMB, RSS: XMB)
- Memory during (peak): XMB (heap: XMB, RSS: XMB)
- Memory after: XMB (heap: XMB, RSS: XMB)
- Memory leaked: XMB
- Memory per file: X KB/file

**Result Truncation** (if applicable):
| maxMatches | Execution Time | Memory Peak | Total Matches | Returned | Truncated |
|------------|----------------|-------------|---------------|----------|----------|
| 100        | Xms            | XMB         | X             | 100      | Yes/No   |
| 500        | Xms            | XMB         | X             | 500      | Yes/No   |
| 1000       | Xms            | XMB         | X             | 1000     | Yes/No   |
| 5000       | Xms            | XMB         | X             | 5000     | Yes/No   |
| 10000      | Xms            | XMB         | X             | 10000    | Yes/No   |

#### Performance Analysis
- **Bottleneck Identified**: [Description]
- **Performance Pattern**: Linear/Polynomial/Exponential
- **Scaling Factor**: X% increase per 1000 files
- **Optimal Configuration**: [Recommended parameters]

#### Edge Cases Encountered
- [List any edge cases or unexpected behavior]

#### Optimization Recommendations
1. [Recommendation 1]
2. [Recommendation 2]
3. [Recommendation 3]

#### Production Readiness Assessment
- Ready for production: Yes/No/With Caveats
- Limitations: [List specific limitations]
- Recommended use cases: [List appropriate use cases]
```

**9. Troubleshooting Guide (lines 1702-1900):**

**9.1 Timeout Issues (lines 1702-1750):**
- **Issue**: Pattern times out even at 300s
- **Diagnosis**: Pattern too complex or repository too large
- **Solutions**: Simplify pattern, reduce search scope, split into multiple patterns
- **Workaround**: Use more specific paths instead of entire repository

**9.2 Memory Issues (lines 1752-1800):**
- **Issue**: Out of memory errors
- **Diagnosis**: Result set too large or memory leak
- **Solutions**: Reduce maxMatches, increase Node.js memory limit, fix memory leaks
- **Workaround**: `node --max-old-space-size=8192` to increase memory limit

**9.3 Performance Issues (lines 1802-1850):**
- **Issue**: Execution time unacceptably slow
- **Diagnosis**: Pattern complexity, repository size, or inefficient implementation
- **Solutions**: Simplify pattern, use more specific paths, optimize implementation
- **Workaround**: Use ast-grep CLI directly for better performance

**9.4 Error Recovery Issues (lines 1852-1900):**
- **Issue**: Tool crashes on malformed files
- **Diagnosis**: Insufficient error handling
- **Solutions**: Improve error handling, skip malformed files gracefully
- **Workaround**: Pre-filter files to exclude known problematic files

**10. Final Checklist (lines 1902-2000):**

Before completing stress testing:
- [ ] All 2-3 large repositories cloned and verified
- [ ] File counts documented with tokei
- [ ] Baseline system measurements recorded
- [ ] 6 stress tests per repository executed (18 total)
- [ ] Timeout testing completed at all thresholds
- [ ] Memory profiling completed for all tests
- [ ] Result truncation testing completed
- [ ] Edge case testing completed
- [ ] Performance benchmarking completed
- [ ] All metrics collected and documented
- [ ] Bottlenecks identified and analyzed
- [ ] Optimization recommendations drafted
- [ ] Production readiness assessment completed
- [ ] LARGE_REPO_RESULTS.md created and populated
- [ ] Results reviewed for completeness
- [ ] Document committed to repository

**11. Expected Outcomes (lines 2002-2100):**

**Success Criteria:**
- All stress tests executed without critical failures
- Timeout behavior documented at all thresholds
- Memory consumption patterns identified
- Bottlenecks clearly identified with root cause analysis
- Optimization recommendations specific and actionable
- Production readiness assessment clear and justified
- Documentation comprehensive (3500-4000 lines)

**Deliverables:**
- LARGE_REPO_RESULTS.md (3500-4000 lines)
- Performance metrics for 18+ stress tests
- Bottleneck analysis with optimization recommendations
- Production readiness assessment
- Preparation for REFINEMENT_PLAN.md creation

**Timeline:**
- Repository setup: 1-2 hours
- React stress testing: 3-4 hours
- Django stress testing: 3-4 hours
- Tokio stress testing: 2-3 hours
- Analysis and documentation: 3-4 hours
- Total: 12-17 hours

**12. Safety Considerations (lines 2102-2150):**

**System Safety:**
- Monitor system resources continuously
- Stop tests if memory usage exceeds 90% of available RAM
- Stop tests if disk usage exceeds 90% of available space
- Do not run on production systems
- Close other applications to free resources

**Data Safety:**
- Use shallow clones to save space
- Do not modify cloned repositories (use dryRun=true for replacements)
- Back up test results regularly
- Save logs to separate files for analysis

**Time Management:**
- Stress testing is time-consuming (12-17 hours)
- Plan for breaks between repositories
- Monitor progress and adjust timeline as needed
- Prioritize critical tests if time is limited