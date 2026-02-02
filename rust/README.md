# CliqueClaw Rust Workspace

This directory contains the Rust core used by the VS Code extension and its WASM bindings.

## Structure

- `clique-core`: Pure Rust logic (parsers, status updates, path validation)
- `clique-wasm`: wasm-bindgen bindings exposing the core to Node.js

## Build

```bash
# From repository root
npm run build:wasm
```

Or build directly with Cargo/wasm-bindgen:

```bash
cd rust
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen target/wasm32-unknown-unknown/release/clique_wasm.wasm --target nodejs --out-dir ../dist/wasm
```

## Test

```bash
cd rust
cargo test --all
```

## Troubleshooting

- Ensure the `wasm32-unknown-unknown` target is installed:
  - `rustup target add wasm32-unknown-unknown`
- Ensure `wasm-pack` is installed:
  - `cargo install wasm-pack`
- If the extension cannot find the WASM module, ensure `dist/wasm/clique_wasm.js` exists.
