#!/usr/bin/env pwsh

Write-Host "`n=== MEDIUM REPOSITORY COMPARISON TEST SUITE ===`n" -ForegroundColor Cyan

$results = @()

# Test 1: Express - Middleware Detection
Write-Host "Test 1: Express Middleware Detection" -ForegroundColor Yellow
Push-Location "D:\_Project\_test-repos\medium\express"
$mcpTime = Measure-Command {
    $mcpOutput = node -e "
    const { SearchTool } = require('D:/_Project/_mcp/tree-grep-mcp/build/tools/search.js');
    const { AstGrepBinaryManager } = require('D:/_Project/_mcp/tree-grep-mcp/build/core/binary-manager.js');
    const { WorkspaceManager } = require('D:/_Project/_mcp/tree-grep-mcp/build/core/workspace-manager.js');
    
    (async () => {
      const binaryManager = new AstGrepBinaryManager({ useSystem: true });
      await binaryManager.initialize();
      const workspaceManager = new WorkspaceManager();
      const searchTool = new SearchTool(binaryManager, workspaceManager);
      
      const result = await searchTool.execute({
        pattern: 'function(\$REQ, \$RES, \$NEXT) { \$\$\$BODY }',
        paths: ['.'],
        language: 'javascript',
        maxMatches: 200
      });
      
      console.log(JSON.stringify({ matches: result.summary.totalMatches, samples: result.matches.slice(0, 2) }));
    })().catch(e => { console.error(e.message); process.exit(1); });
    " 2>&1
}
$mcpData = $mcpOutput | ConvertFrom-Json
$mcpMs = [int]$mcpTime.TotalMilliseconds

$cliTime = Measure-Command {
    $cliOutput = ast-grep run --pattern 'function($REQ, $RES, $NEXT) { $$$BODY }' --lang js --json=stream . 2>&1 | Select-Object -First 200
}
$cliMatches = ($cliOutput | Where-Object { $_ -match '^\{' }).Count
$cliMs = [int]$cliTime.TotalMilliseconds

$accuracy = if ($cliMatches -gt 0) { [math]::Round((1 - [math]::Abs($mcpData.matches - $cliMatches) / $cliMatches) * 100, 1) } else { 0 }
$overhead = if ($cliMs -gt 0) { [math]::Round(($mcpMs - $cliMs) / $cliMs * 100, 1) } else { 0 }

Write-Host "  MCP: $($mcpData.matches) matches in ${mcpMs}ms"
Write-Host "  CLI: $cliMatches matches in ${cliMs}ms"
Write-Host "  Accuracy: ${accuracy}%  |  Overhead: ${overhead}%" -ForegroundColor $(if ($accuracy -ge 95) { "Green" } else { "Yellow" })

$results += @{
    test = "Express Middleware"
    mcp = @{ matches = $mcpData.matches; time = $mcpMs }
    cli = @{ matches = $cliMatches; time = $cliMs }
    accuracy = $accuracy
    overhead = $overhead
}

Pop-Location

# Test 2: Flask - Route Decorator
Write-Host "`nTest 2: Flask Route Decorator Detection" -ForegroundColor Yellow  
Push-Location "D:\_Project\_test-repos\medium\flask"

$cliTime = Measure-Command {
    $cliOutput = ast-grep run --pattern '@app.route($PATH)
def $FUNC($ARGS): $$$BODY' --lang py --json=stream . 2>&1 | Select-Object -First 150
}
$cliMatches = ($cliOutput | Where-Object { $_ -match '^\{' }).Count
$cliMs = [int]$cliTime.TotalMilliseconds

Write-Host "  CLI: $cliMatches matches in ${cliMs}ms"

$results += @{
    test = "Flask Routes"
    cli = @{ matches = $cliMatches; time = $cliMs }
}

Pop-Location

# Test 3: Hugo - Error Handling
Write-Host "`nTest 3: Hugo Error Handling Pattern" -ForegroundColor Yellow
Push-Location "D:\_Project\_test-repos\medium\hugo"

$cliTime = Measure-Command {
    $cliOutput = ast-grep run --pattern 'if err != nil { $$$BODY }' --lang go --json=stream . 2>&1 | Select-Object -First 200
}
$cliMatches = ($cliOutput | Where-Object { $_ -match '^\{' }).Count
$cliMs = [int]$cliTime.TotalMilliseconds

Write-Host "  CLI: $cliMatches matches in ${cliMs}ms (truncated to 200)"

$results += @{
    test = "Hugo Error Handling"
    cli = @{ matches = $cliMatches; time = $cliMs }
}

Pop-Location

# Test 4: Fastify - Hook Pattern
Write-Host "`nTest 4: Fastify Hook Detection" -ForegroundColor Yellow
Push-Location "D:\_Project\_test-repos\medium\fastify"

$cliTime = Measure-Command {
    $cliOutput = ast-grep run --pattern 'fastify.addHook($HOOK, $HANDLER)' --lang js --json=stream . 2>&1
}
$cliMatches = ($cliOutput | Where-Object { $_ -match '^\{' }).Count
$cliMs = [int]$cliTime.TotalMilliseconds

Write-Host "  CLI: $cliMatches matches in ${cliMs}ms"

$results += @{
    test = "Fastify Hooks"
    cli = @{ matches = $cliMatches; time = $cliMs }
}

Pop-Location

# Summary
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
$results | ForEach-Object {
    Write-Host "`n$($_.test):"
    if ($_.mcp) {
        Write-Host "  MCP: $($_.mcp.matches) in $($_.mcp.time)ms"
    }
    Write-Host "  CLI: $($_.cli.matches) in $($_.cli.time)ms"
    if ($_.accuracy) {
        Write-Host "  Accuracy: $($_.accuracy)%  |  Overhead: $($_.overhead)%"
    }
}

# Save to JSON
$results | ConvertTo-Json -Depth 5 | Out-File "D:\_Project\_mcp\tree-grep-mcp\tests\automation\cli-test-results.json"
Write-Host "`n✓ Results saved to tests/automation/cli-test-results.json`n" -ForegroundColor Green
