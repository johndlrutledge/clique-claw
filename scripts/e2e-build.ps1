#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

if (-not $PSScriptRoot) {
	$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

Write-Host "=== Step 0: Ensure Dependencies ===" -ForegroundColor Cyan

function Assert-Command($CommandName, $InstallHint) {
	if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
		Write-Host "Missing dependency: $CommandName" -ForegroundColor Red
		if ($InstallHint) {
			Write-Host "Hint: $InstallHint" -ForegroundColor Yellow
		}
		exit 1
	}
}

Assert-Command "npm" "Install Node.js LTS from https://nodejs.org/"
Assert-Command "cargo" "Install Rust from https://www.rust-lang.org/tools/install"
Assert-Command "rustup" "Install Rust from https://www.rust-lang.org/tools/install"

Write-Host "Ensuring Rust WASM target..." -ForegroundColor DarkCyan
rustup target add wasm32-unknown-unknown | Out-Host

if (-not (Get-Command "wasm-bindgen" -ErrorAction SilentlyContinue)) {
	Write-Host "Installing wasm-bindgen-cli (cargo install)" -ForegroundColor DarkCyan
	cargo install wasm-bindgen-cli
}

Write-Host "=== Step 1: Clean ===" -ForegroundColor Cyan
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force rust/target -ErrorAction SilentlyContinue
Remove-Item *.vsix -ErrorAction SilentlyContinue

Write-Host "=== Step 2: Install Dependencies ===" -ForegroundColor Cyan
npm ci

Write-Host "=== Step 3: Build Rust/WASM ===" -ForegroundColor Cyan
Push-Location rust
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen target/wasm32-unknown-unknown/release/clique_wasm.wasm --target nodejs --out-dir ../dist/wasm
Pop-Location

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

Write-Host "=== Step 4: TypeScript Type Check ===" -ForegroundColor Cyan
npm run compile

Write-Host "=== Step 5: Bundle Extension ===" -ForegroundColor Cyan
npm run build

Write-Host "=== Step 6: Run Rust Tests ===" -ForegroundColor Cyan
Push-Location rust
cargo test --all
Pop-Location

Write-Host "=== Step 7: Run TypeScript Tests ===" -ForegroundColor Cyan
npm test

Write-Host "=== Step 8: Lint ===" -ForegroundColor Cyan
npm run lint

Write-Host "=== Step 9: Package VSIX ===" -ForegroundColor Cyan
npx vsce package

Write-Host "=== Build Complete ===" -ForegroundColor Green
Get-ChildItem *.vsix
