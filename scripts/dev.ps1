#!/usr/bin/env pwsh
# Development helper script for Windows PowerShell
# Detects runtime and runs appropriate commands

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('dev', 'build', 'test', 'install')]
    [string]$Command
)

# Check if Bun is available
$bunAvailable = $null -ne (Get-Command bun -ErrorAction SilentlyContinue)

Write-Host "Detecting runtime..." -ForegroundColor Cyan

if ($bunAvailable) {
    Write-Host "✓ Bun detected - using Bun for faster execution" -ForegroundColor Green
    $runtime = "bun"
} else {
    Write-Host "✓ Using Node.js (install Bun for faster development)" -ForegroundColor Yellow
    $runtime = "node"
}

switch ($Command) {
    'install' {
        if ($runtime -eq 'bun') {
            bun install
        } else {
            npm install
        }
    }
    'dev' {
        if ($runtime -eq 'bun') {
            bun run dev:bun
        } else {
            npm run dev
        }
    }
    'build' {
        if ($runtime -eq 'bun') {
            bun run build:bun
        } else {
            npm run build
        }
    }
    'test' {
        if ($runtime -eq 'bun') {
            bun test
        } else {
            npm test
        }
    }
}
