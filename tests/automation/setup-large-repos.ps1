# Large Repository Setup Script
# Purpose: Automate workspace creation and repository cloning for stress testing
# Requirements: PowerShell 5.1+, Git 2.30+
# Usage: .\setup-large-repos.ps1 [-WorkspaceRoot <path>] [-SkipVerification]

param(
    [string]$WorkspaceRoot = "d:/_Project/_test-repos/large",
    [switch]$SkipVerification = $false,
    [switch]$Force = $false
)

# =================================================================
# Configuration
# =================================================================

$ErrorActionPreference = "Stop"

$Repositories = @(
    @{
        Name = "react"
        Url = "https://github.com/facebook/react.git"
        Language = "JavaScript/TypeScript"
        ExpectedFiles = 3500
        ExpectedSize = "1-3 GB"
    },
    @{
        Name = "django"
        Url = "https://github.com/django/django.git"
        Language = "Python"
        ExpectedFiles = 4500
        ExpectedSize = "100-300 MB"
    },
    @{
        Name = "tokio"
        Url = "https://github.com/tokio-rs/tokio.git"
        Language = "Rust"
        ExpectedFiles = 3000
        ExpectedSize = "50-150 MB"
    }
)

# =================================================================
# Utility Functions
# =================================================================

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Format-FileSize {
    param([long]$Bytes)

    if ($Bytes -ge 1GB) {
        return "{0:N2} GB" -f ($Bytes / 1GB)
    } elseif ($Bytes -ge 1MB) {
        return "{0:N2} MB" -f ($Bytes / 1MB)
    } elseif ($Bytes -ge 1KB) {
        return "{0:N2} KB" -f ($Bytes / 1KB)
    } else {
        return "$Bytes bytes"
    }
}

# =================================================================
# Prerequisite Checks
# =================================================================

function Test-Prerequisites {
    Write-Header "Checking Prerequisites"

    $allPassed = $true

    # Check Git
    Write-Info "Checking Git installation..."
    try {
        $gitVersion = git --version
        Write-Success "Git found: $gitVersion"
    } catch {
        Write-Error-Custom "Git not found. Please install Git 2.30+ from https://git-scm.com/"
        $allPassed = $false
    }

    # Check PowerShell version
    Write-Info "Checking PowerShell version..."
    $psVersion = $PSVersionTable.PSVersion
    if ($psVersion.Major -ge 5) {
        Write-Success "PowerShell version: $psVersion"
    } else {
        Write-Error-Custom "PowerShell 5.1+ required. Current version: $psVersion"
        $allPassed = $false
    }

    # Check disk space
    Write-Info "Checking disk space..."
    $drive = Split-Path -Qualifier $WorkspaceRoot
    if (-not $drive) {
        $drive = "C:"
    }

    $driveInfo = Get-PSDrive ($drive -replace ":", "")
    $freeSpaceGB = [math]::Round($driveInfo.Free / 1GB, 2)

    if ($freeSpaceGB -ge 50) {
        Write-Success "Free disk space: $freeSpaceGB GB"
    } else {
        Write-Error-Custom "Insufficient disk space. Required: 50 GB, Available: $freeSpaceGB GB"
        $allPassed = $false
    }

    # Check RAM
    Write-Info "Checking system RAM..."
    $totalRAM = (Get-CimInstance Win32_PhysicalMemory | Measure-Object -Property capacity -Sum).Sum / 1GB
    $totalRAM = [math]::Round($totalRAM, 2)

    if ($totalRAM -ge 16) {
        Write-Success "Total RAM: $totalRAM GB"
    } else {
        Write-Error-Custom "Insufficient RAM. Recommended: 16+ GB, Available: $totalRAM GB"
        Write-Info "You may proceed, but stress testing may be limited"
    }

    # Check CPU cores
    Write-Info "Checking CPU cores..."
    $cpuCores = (Get-CimInstance Win32_Processor).NumberOfLogicalProcessors
    if ($cpuCores -ge 4) {
        Write-Success "CPU cores: $cpuCores"
    } else {
        Write-Error-Custom "Insufficient CPU cores. Recommended: 4+, Available: $cpuCores"
    }

    return $allPassed
}

# =================================================================
# Workspace Setup
# =================================================================

function New-TestWorkspace {
    Write-Header "Creating Test Workspace"

    Write-Info "Workspace location: $WorkspaceRoot"

    if (Test-Path $WorkspaceRoot) {
        if ($Force) {
            Write-Info "Force flag detected. Removing existing workspace..."
            Remove-Item -Path $WorkspaceRoot -Recurse -Force
            Write-Success "Existing workspace removed"
        } else {
            Write-Info "Workspace already exists"
            $response = Read-Host "Do you want to remove and recreate it? (y/N)"
            if ($response -eq 'y' -or $response -eq 'Y') {
                Remove-Item -Path $WorkspaceRoot -Recurse -Force
                Write-Success "Existing workspace removed"
            } else {
                Write-Info "Using existing workspace"
                return
            }
        }
    }

    Write-Info "Creating workspace directory..."
    New-Item -ItemType Directory -Force -Path $WorkspaceRoot | Out-Null
    Write-Success "Workspace created: $WorkspaceRoot"

    # Create subdirectories
    $subdirs = @("logs", "results", "metadata")
    foreach ($subdir in $subdirs) {
        $path = Join-Path $WorkspaceRoot $subdir
        New-Item -ItemType Directory -Force -Path $path | Out-Null
        Write-Info "Created subdirectory: $subdir"
    }
}

# =================================================================
# Repository Cloning
# =================================================================

function Clone-Repository {
    param(
        [hashtable]$Repo
    )

    $repoPath = Join-Path $WorkspaceRoot $Repo.Name
    $metadataDir = Join-Path $WorkspaceRoot "metadata"
    $metadataPath = Join-Path $metadataDir "$($Repo.Name)-commit-info.txt"

    Write-Header "Cloning Repository: $($Repo.Name)"

    Write-Info "Repository: $($Repo.Url)"
    Write-Info "Language: $($Repo.Language)"
    Write-Info "Expected files: $($Repo.ExpectedFiles)"
    Write-Info "Expected size: $($Repo.ExpectedSize)"

    if (Test-Path $repoPath) {
        Write-Info "Repository already exists at: $repoPath"
        $response = Read-Host "Do you want to re-clone it? (y/N)"
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Info "Skipping clone for $($Repo.Name)"
            return
        }
        Write-Info "Removing existing repository..."
        Remove-Item -Path $repoPath -Recurse -Force
    }

    Write-Info "Cloning repository (shallow clone with --depth 1)..."
    $startTime = Get-Date

    Push-Location $WorkspaceRoot

    # Git outputs progress to stderr, so we need to capture both streams
    $ErrorActionPreference = "Continue"
    git clone --depth 1 $Repo.Url
    $cloneExitCode = $LASTEXITCODE
    $ErrorActionPreference = "Stop"

    Pop-Location

    if ($cloneExitCode -ne 0) {
        throw "Git clone failed with exit code $cloneExitCode"
    }

    $duration = (Get-Date) - $startTime
    Write-Success "Clone completed in $($duration.TotalSeconds.ToString('F1')) seconds"

    # Save commit information
    try {
        Push-Location $repoPath
        $commitInfo = git log --format="%H %ai %s" -1
        Set-Content -Path $metadataPath -Value $commitInfo -Encoding UTF8
        Write-Info "Commit info saved to: $metadataPath"
        Write-Info "Commit: $commitInfo"
        Pop-Location
    } catch {
        Write-Error-Custom "Failed to save commit info: $_"
        if (Test-Path $repoPath) {
            Pop-Location
        }
    }
}

function Verify-Repository {
    param(
        [hashtable]$Repo
    )

    $repoPath = Join-Path $WorkspaceRoot $Repo.Name

    Write-Info "Verifying repository: $($Repo.Name)"

    if (-not (Test-Path $repoPath)) {
        Write-Error-Custom "Repository not found: $repoPath"
        return $false
    }

    # Count files
    $fileCount = (Get-ChildItem -Path $repoPath -Recurse -File | Measure-Object).Count
    Write-Info "Total files: $fileCount (expected: ~$($Repo.ExpectedFiles))"

    # Calculate size
    $totalSize = (Get-ChildItem -Path $repoPath -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $formattedSize = Format-FileSize $totalSize
    Write-Info "Total size: $formattedSize (expected: $($Repo.ExpectedSize))"

    # Verify .git directory
    $gitPath = Join-Path $repoPath ".git"
    if (Test-Path $gitPath) {
        Write-Success "Git repository verified"
    } else {
        Write-Error-Custom "Not a valid Git repository"
        return $false
    }

    # Check file count variance
    $variance = [math]::Abs($fileCount - $Repo.ExpectedFiles) / $Repo.ExpectedFiles
    if ($variance -gt 0.5) {
        Write-Error-Custom "File count significantly different from expected ($fileCount vs $($Repo.ExpectedFiles))"
        Write-Info "This may indicate an incomplete clone or repository changes"
    } else {
        Write-Success "File count within expected range"
    }

    return $true
}

# =================================================================
# Summary and Next Steps
# =================================================================

function Show-Summary {
    param(
        [bool]$Success
    )

    Write-Header "Setup Summary"

    if ($Success) {
        Write-Success "All repositories cloned and verified successfully!"
        Write-Host ""
        Write-Info "Workspace location: $WorkspaceRoot"
        Write-Host ""
        Write-Info "Next steps:"
        Write-Host "  1. Build the MCP server: npm run build" -ForegroundColor Cyan
        Write-Host "  2. Run stress tests: node --expose-gc tests/automation/stress-test-runner.js" -ForegroundColor Cyan
        Write-Host "  3. Or run specific repository: node --expose-gc tests/automation/stress-test-runner.js react" -ForegroundColor Cyan
        Write-Host ""
        Write-Info "Repository details:"
        foreach ($repo in $Repositories) {
            $repoPath = Join-Path $WorkspaceRoot $repo.Name
            if (Test-Path $repoPath) {
                $fileCount = (Get-ChildItem -Path $repoPath -Recurse -File | Measure-Object).Count
                $totalSize = (Get-ChildItem -Path $repoPath -Recurse -File | Measure-Object -Property Length -Sum).Sum
                $formattedSize = Format-FileSize $totalSize
                Write-Host "  - $($repo.Name): $fileCount files, $formattedSize" -ForegroundColor Green
            }
        }
        Write-Host ""
        Write-Success "Setup complete! You can now run stress tests."
    } else {
        Write-Error-Custom "Setup completed with errors. Please review the output above."
        Write-Info "You may need to manually verify or re-clone repositories."
    }
}

# =================================================================
# Main Execution
# =================================================================

function Main {
    $scriptStartTime = Get-Date

    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Magenta
    Write-Host "  Large Repository Setup Script" -ForegroundColor Magenta
    Write-Host "  Purpose: Prepare workspace for stress testing" -ForegroundColor Magenta
    Write-Host "================================================================" -ForegroundColor Magenta
    Write-Host ""

    # Check prerequisites
    $prereqsPassed = Test-Prerequisites
    if (-not $prereqsPassed) {
        Write-Error-Custom "Prerequisites check failed. Please resolve the issues above."
        Write-Info "You can skip verification with -SkipVerification flag (not recommended)"
        if (-not $SkipVerification) {
            exit 1
        }
        Write-Info "Continuing with -SkipVerification flag..."
    }

    # Create workspace
    New-TestWorkspace

    # Clone repositories
    $allSuccess = $true
    foreach ($repo in $Repositories) {
        try {
            Clone-Repository -Repo $repo

            if (-not $SkipVerification) {
                $verified = Verify-Repository -Repo $repo
                if (-not $verified) {
                    $allSuccess = $false
                }
            }
        } catch {
            Write-Error-Custom "Failed to process repository $($repo.Name): $_"
            $allSuccess = $false
        }
    }

    # Show summary
    $scriptDuration = (Get-Date) - $scriptStartTime
    Write-Host ""
    Write-Info "Total setup time: $($scriptDuration.TotalMinutes.ToString('F1')) minutes"

    Show-Summary -Success $allSuccess

    if ($allSuccess) {
        exit 0
    } else {
        exit 1
    }
}

# Run main function
Main

