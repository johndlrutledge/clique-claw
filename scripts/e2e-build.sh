#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "========================================"
echo "  CliqueClaw E2E Build"
echo "========================================"
echo

echo "[1/6] Installing npm dependencies..."
if [ -f package-lock.json ] && [ "${CI:-}" = "true" ]; then
  npm ci
else
  npm install
fi
echo "  Done!"
echo

echo "[2/6] Build Rust/WASM"
echo "----------------------------------------"
npm run build:wasm
echo "  Done!"
echo

echo "[3/6] Building TypeScript..."
npm run build:ts
echo "  Done!"
echo

echo "[4/6] Running tests..."
npm test
echo "  Done!"
echo

echo "[5/6] Packaging VS Code extension..."
npx --yes @vscode/vsce package
echo "  Done!"
echo

echo "========================================"
echo "  Build Complete!"
echo "========================================"
echo
echo "To install locally:"
for f in *.vsix; do
  [ -e "$f" ] && echo "  code --install-extension $f"
done

exit 0
