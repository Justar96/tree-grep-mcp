# Quick test script to collect metrics
$repos = @{
    'chalk' = @{
        'path' = 'D:\test-repos\chalk'
        'tests' = @(
            @{ name = 'Function Definitions'; pattern = 'function $N($$$P) { $$$B }'; lang = 'javascript' }
            @{ name = 'Console.log'; pattern = 'console.log($$$A)'; lang = 'javascript' }
            @{ name = 'Arrow Functions'; pattern = 'const $N = ($$$A) => $$$B'; lang = 'javascript' }
            @{ name = 'Export Default'; pattern = 'export default $E'; lang = 'javascript' }
        )
    }
    'typer' = @{
        'path' = 'D:\test-repos\typer'
        'tests' = @(
            @{ name = 'Function Definitions'; pattern = 'def $N($$$P): $$$B'; lang = 'python' }
            @{ name = 'Class Definitions'; pattern = 'class $N: $$$B'; lang = 'python' }
        )
    }
    'hyperfine' = @{
        'path' = 'D:\test-repos\hyperfine'
        'tests' = @(
            @{ name = 'Function Definitions'; pattern = 'fn $N($$$P) { $$$B }'; lang = 'rust' }
            @{ name = 'Struct Definitions'; pattern = 'struct $N { $$$F }'; lang = 'rust' }
        )
    }
    'execa' = @{
        'path' = 'D:\test-repos\execa'
        'tests' = @(
            @{ name = 'Async Functions'; pattern = 'async function $N($$$P) { $$$B }'; lang = 'javascript' }
            @{ name = 'Export Named'; pattern = 'export { $$$E }'; lang = 'javascript' }
        )
    }
}

$results = @()

foreach ($repoName in $repos.Keys) {
    $repo = $repos[$repoName]
    Write-Host "`n=== Testing $repoName ===" -ForegroundColor Cyan
    
    foreach ($test in $repo.tests) {
        Set-Location $repo.path
        $start = Get-Date
        
        try {
            $output = ast-grep -p $test.pattern -l $test.lang 2>&1
            $lines = ($output | Measure-Object -Line).Lines
            if ($null -eq $lines) { $lines = 0 }
            
            $end = Get-Date
            $time = [math]::Round(($end - $start).TotalMilliseconds, 0)
            
            Write-Host "  $($test.name): $lines matches in ${time}ms" -ForegroundColor Green
            
            # Get first 3 sample matches
            $samples = ($output | Select-Object -First 3) -join "`n"
            
            $results += [PSCustomObject]@{
                Repo = $repoName
                Test = $test.name
                Pattern = $test.pattern
                Language = $test.lang
                Matches = $lines
                TimeMs = $time
                Samples = $samples
            }
        }
        catch {
            Write-Host "  $($test.name): ERROR - $($_.Exception.Message)" -ForegroundColor Red
            $results += [PSCustomObject]@{
                Repo = $repoName
                Test = $test.name
                Pattern = $test.pattern
                Language = $test.lang
                Matches = 0
                TimeMs = 0
                Samples = "ERROR: $($_.Exception.Message)"
            }
        }
    }
}

# Save results
$results | Export-Csv -Path "D:\_Project\_mcp\tree-grep-mcp\tests\test-metrics.csv" -NoTypeInformation
Write-Host "`n✓ Results saved to test-metrics.csv" -ForegroundColor Green

# Display summary
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
