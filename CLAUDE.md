# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Agreement

- Always commit any code changes before completing work.

## Build Commands

```bash
npm install          # Install dependencies
npm run build:wasm   # Build Rust/WASM module to dist/wasm
npm run build        # Bundle with esbuild to dist/
npm run compile      # TypeScript type-check only (no output)
npm run watch        # Watch mode with esbuild
npm test             # Run TypeScript tests
cd rust && cargo test --all   # Run Rust tests
vsce package         # Package as .vsix for distribution
```

## Publishing

The extension auto-publishes to VS Code Marketplace via GitHub Actions when you push to main.

**To release a new version:**

1. Bump version in `package.json`
2. Push to main
3. GitHub Actions handles the publish automatically

Do NOT run `vsce publish` manually - the workflow does it for you.

## Architecture

Clique is a VS Code extension that integrates with the BMAD workflow methodology. It provides a phase-based UI for the full BMAD methodology.

### Directory Structure

```text
src/
├── core/                    # Shared infrastructure
│   ├── types.ts             # WorkflowItem, WorkflowData, PhaseConfig, Story, Epic
│   ├── workflowParser.ts    # TS parser (fallback/legacy)
│   ├── sprintParser.ts      # TS parser (fallback/legacy)
│   ├── workflowParserWasm.ts # WASM-backed parser wrapper
│   ├── sprintParserWasm.ts   # WASM-backed parser wrapper
│   ├── wasmLoader.ts        # WASM module loader and typed exports
│   └── fileWatcher.ts       # Dual-watcher for both file types
├── phases/                  # Phase-specific tree providers
│   ├── baseWorkflowProvider.ts  # Base class with WorkflowTreeItem
│   ├── discovery/           # Phase 0
│   ├── planning/            # Phase 1
│   ├── solutioning/         # Phase 2
│   └── implementation/      # Phase 3 + sprint stories
├── ui/                      # UI components
│   ├── detailPanel.ts       # Webview for workflow details
│   └── welcomeView.ts       # Welcome view for initialization
└── extension.ts             # Activation entry point

rust/
├── clique-core/              # Pure Rust logic (parsers, updaters, validation)
└── clique-wasm/              # wasm-bindgen exports for Node.js
```

### Data Sources

The extension searches for these files in the workspace:

- **bmm-workflow-status.yaml** - Tracks workflow progress across phases 0-3 (Discovery, Planning, Solutioning, Implementation)
  - Search order: `_bmad-output/planning-artifacts/bmm-workflow-status.yaml`, `_bmad-output/bmm-workflow-status.yaml`, `docs/bmm-workflow-status.yaml`, root
- **sprint-status.yaml** - Tracks sprint stories within Phase 3 Implementation
  - Recursive search finds any `sprint-status.yaml` (typically in `_bmad-output/implementation-artifacts/`)

### Workflow State Machine

**Phase workflows** (from bmm-workflow-status.yaml):

- Status `required`/`optional`/`recommended` → Actionable (show play button)
- Status `conditional` → Waiting on prerequisites
- Status `skipped` → Explicitly skipped
- Status is file path (e.g., `docs/prd.md`) → Completed

**Story workflows** (from sprint-status.yaml):

- `backlog` → runs `claude "/bmad:bmm:workflows:create-story <story-id>"`
- `ready-for-dev` → runs `claude "/bmad:bmm:workflows:dev-story <story-id>"`
- `review` → runs `claude "/bmad:bmm:workflows:code-review <story-id>"`

### Key Data Structures

- `WorkflowItem` - id, phase, status, agent, command, note
- `WorkflowData` - project info + array of WorkflowItem
- `SprintData` - project, projectKey, array of Epic
- `Epic` - id, name, status, array of Story
- `Story` - id, status, epicId

## Rust/WASM Notes

- The WASM module is built to `dist/wasm/clique_wasm.js` and loaded at runtime.
- See [rust/README.md](rust/README.md) for Rust build and test details.
- Rebuild WASM after Rust changes with `npm run build:wasm`.
- Workflow mappings live in `rust/clique-core/src/workflow.rs`; update parity fixtures when changing mappings.

## Fuzzing

Extensive fuzzing tests are available for parser robustness:

```bash
# Rust property-based fuzz tests (proptest)
cd rust/clique-core && cargo test fuzz_ --release

# Quick mode (fewer iterations)
npm run test:fuzz:quick

# TypeScript fuzz tests (Jest)
npm run test:fuzz

# All fuzz modes
npm run fuzz

# Deep fuzzing with libFuzzer (requires cargo-fuzz and nightly)
cd rust/clique-core/fuzz && cargo +nightly fuzz run fuzz_workflow_parser
```

See `src/__tests__/fuzz.test.ts` and `rust/clique-core/src/fuzz_tests.rs` for test implementations.
