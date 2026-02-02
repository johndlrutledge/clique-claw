#!/usr/bin/env bash
set -euo pipefail

echo "=== Build WASM ==="

if [ "${CLIQUE_WASM_DEBUG:-}" = "1" ]; then
	echo "Debug mode enabled (source maps)"
	npm run build:wasm:debug
else
	npm run build:wasm

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
fi

echo "=== Build WASM Complete ==="
