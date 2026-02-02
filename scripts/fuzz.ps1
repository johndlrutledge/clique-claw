#!/usr/bin/env pwsh
# Fuzzing Script for Clique
#
# This script runs various fuzzing tests for the Clique parsers.
# Requires: cargo, cargo-fuzz (install with: cargo install cargo-fuzz)

param(
    [Parameter(Position=0)]
    [ValidateSet("proptest", "libfuzzer", "all", "quick")]
    [string]$Mode = "proptest",

    [Parameter()]
    [int]$Duration = 60,

    [Parameter()]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$RustDir = Join-Path $RootDir "rust"
$CoreDir = Join-Path $RustDir "clique-core"

Write-Host "🔍 Clique Fuzzing Suite" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""

function Run-PropTests {
    Write-Host "📦 Running Property-Based Tests (proptest)..." -ForegroundColor Yellow
    Write-Host ""

    Push-Location $CoreDir
    try {
        # Run all fuzz tests with proptest
        cargo test fuzz_ --release -- --nocapture
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Proptest fuzzing failed!" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Proptest fuzzing completed successfully!" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

function Run-LibFuzzer {
    param([string]$TargetName, [int]$Seconds)

    Write-Host "🔥 Running libFuzzer on target: $TargetName for $Seconds seconds..." -ForegroundColor Yellow
    Write-Host ""

    $FuzzDir = Join-Path $CoreDir "fuzz"
    Push-Location $FuzzDir
    try {
        # Run cargo-fuzz with timeout
        $env:RUSTFLAGS = "-C target-cpu=native"
        cargo +nightly fuzz run $TargetName -- -max_total_time=$Seconds
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️  Fuzzer found issues or was interrupted" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "⚠️  cargo-fuzz not available. Install with: cargo install cargo-fuzz" -ForegroundColor Yellow
        Write-Host "   Also requires nightly: rustup install nightly" -ForegroundColor Yellow
    }
    finally {
        Pop-Location
    }
}

function Run-TypeScriptFuzz {
    Write-Host "📦 Running TypeScript Fuzz Tests..." -ForegroundColor Yellow
    Write-Host ""

    Push-Location $RootDir
    try {
        npm test -- --testPathPattern=fuzz --testTimeout=120000
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ TypeScript fuzzing failed!" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ TypeScript fuzzing completed successfully!" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# Main execution
switch ($Mode) {
    "proptest" {
        Run-PropTests
        Run-TypeScriptFuzz
    }
    "libfuzzer" {
        $targets = @(
            "fuzz_workflow_parser",
            "fuzz_sprint_parser",
            "fuzz_workflow_update",
            "fuzz_sprint_update",
            "fuzz_path_validation"
        )

        if ($Target -eq "all") {
            foreach ($t in $targets) {
                Run-LibFuzzer -TargetName $t -Seconds $Duration
            }
        }
        else {
            Run-LibFuzzer -TargetName $Target -Seconds $Duration
        }
    }
    "quick" {
        Write-Host "⚡ Quick Fuzz Mode (reduced iterations)..." -ForegroundColor Yellow
        Write-Host ""

        Push-Location $CoreDir
        try {
            # Run with fewer cases for quick verification
            $env:PROPTEST_CASES = "50"
            cargo test fuzz_ --release -- --nocapture
        }
        finally {
            $env:PROPTEST_CASES = $null
            Pop-Location
        }

        Run-TypeScriptFuzz
    }
    "all" {
        Run-PropTests
        Run-TypeScriptFuzz

        Write-Host ""
        Write-Host "💡 For deeper fuzzing with libFuzzer, run:" -ForegroundColor Cyan
        Write-Host "   .\scripts\fuzz.ps1 -Mode libfuzzer -Duration 300" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "🎉 Fuzzing complete!" -ForegroundColor Green
