#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

Write-Host "=== Build All (WASM + TS) ===" -ForegroundColor Cyan
npm run build:wasm
npm run build:ts

Write-Host "=== Build All Complete ===" -ForegroundColor Green
