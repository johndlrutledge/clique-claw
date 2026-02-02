$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir "..")

Write-Host "========================================"
Write-Host "  CliqueClaw E2E Build"
Write-Host "========================================"
Write-Host ""

Write-Host "[1/6] Installing npm dependencies..."
if ($env:CI -eq "true" -and (Test-Path "package-lock.json")) {
    npm ci
} else {
    npm install
}
Write-Host "  Done!"
Write-Host ""

Write-Host "[2/6] Build Rust/WASM"
Write-Host "----------------------------------------"
Write-Host "Build Rust/WASM"

npm run build:wasm
Write-Host "  Done!"
Write-Host ""

Write-Host "[3/6] Building TypeScript..."

npm run build:ts
Write-Host "  Done!"
Write-Host ""

Write-Host "[4/6] Running tests..."

npm test
Write-Host "  Done!"
Write-Host ""

Write-Host "[5/6] Packaging VS Code extension..."

npx --yes @vscode/vsce package
Write-Host "  Done!"
Write-Host ""

Write-Host "========================================"
Write-Host "  Build Complete!"
Write-Host "========================================"
Write-Host ""
Write-Host "To install locally:"
Get-ChildItem -Filter "*.vsix" | ForEach-Object { Write-Host "  code --install-extension $($_.Name)" }
