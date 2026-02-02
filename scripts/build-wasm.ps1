#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

Write-Host "=== Build WASM ===" -ForegroundColor Cyan

if ($env:CLIQUE_WASM_DEBUG -eq "1") {
	Write-Host "Debug mode enabled (source maps)" -ForegroundColor Yellow
	npm run build:wasm:debug
} else {
	npm run build:wasm

	$wasmPath = "dist/wasm/clique_wasm_bg.wasm"
	if (Test-Path $wasmPath) {
		if (Get-Command "wasm-opt" -ErrorAction SilentlyContinue) {
			Write-Host "Optimizing WASM with wasm-opt" -ForegroundColor DarkCyan
			wasm-opt -O4 -o $wasmPath $wasmPath
		} else {
			Write-Host "wasm-opt not found; skipping WASM optimization." -ForegroundColor Yellow
			Write-Host "Hint: Install Binaryen (wasm-opt) from https://github.com/WebAssembly/binaryen" -ForegroundColor Yellow
		}
	} else {
		Write-Host "WASM file not found at $wasmPath; skipping optimization." -ForegroundColor Yellow
	}
}

Write-Host "=== Build WASM Complete ===" -ForegroundColor Green
