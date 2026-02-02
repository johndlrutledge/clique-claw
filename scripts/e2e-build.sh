#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."

echo "=== Step 0: Ensure Dependencies ==="

require_cmd() {
	local cmd="$1"
	local hint="$2"
	if ! command -v "$cmd" >/dev/null 2>&1; then
		echo "Missing dependency: $cmd" >&2
		if [ -n "$hint" ]; then
			echo "Hint: $hint" >&2
		fi
		exit 1
	fi
}

require_cmd npm "Install Node.js LTS from https://nodejs.org/"
require_cmd cargo "Install Rust from https://www.rust-lang.org/tools/install"
require_cmd rustup "Install Rust from https://www.rust-lang.org/tools/install"

echo "Ensuring Rust WASM target..."
rustup target add wasm32-unknown-unknown

if ! command -v wasm-bindgen >/dev/null 2>&1; then
	echo "Installing wasm-bindgen-cli (cargo install)"
	cargo install wasm-bindgen-cli
fi

echo "=== Step 1: Clean ==="
rm -rf dist rust/target *.vsix

echo "=== Step 2: Install Dependencies ==="
npm ci

echo "=== Step 3: Build Rust/WASM ==="
cd rust
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen target/wasm32-unknown-unknown/release/clique_wasm.wasm --target nodejs --out-dir ../dist/wasm
cd ..

WASM_PATH="dist/wasm/clique_wasm_bg.wasm"
if [ -f "$WASM_PATH" ]; then
	if command -v wasm-opt >/dev/null 2>&1; then
		echo "Optimizing WASM with wasm-opt"
		wasm-opt -O4 -o "$WASM_PATH" "$WASM_PATH"
	else
		echo "wasm-opt not found; skipping WASM optimization."
		echo "Hint: Install Binaryen (wasm-opt) from https://github.com/WebAssembly/binaryen"
	fi
else
	echo "WASM file not found at $WASM_PATH; skipping optimization."
fi

echo "=== Step 4: TypeScript Type Check ==="
npm run compile

echo "=== Step 5: Bundle Extension ==="
npm run build

echo "=== Step 6: Run Rust Tests ==="
cd rust
cargo test --all
cd ..

echo "=== Step 7: Run TypeScript Tests ==="
npm test

echo "=== Step 8: Lint ==="
npm run lint

echo "=== Step 9: Package VSIX ==="
npx vsce package

echo "=== Build Complete ==="
ls -la *.vsix
