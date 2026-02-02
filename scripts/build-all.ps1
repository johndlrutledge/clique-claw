$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir "..")

Write-Host "Running build:wasm"

npm run build:wasm

Write-Host "Running build:ts"

npm run build:ts
