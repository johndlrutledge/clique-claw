#!/usr/bin/env bash
set -euo pipefail

echo "=== Build All (WASM + TS) ==="
npm run build:wasm
npm run build:ts

echo "=== Build All Complete ==="
