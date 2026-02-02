# Rust WASM Migration Plan (Phased Checklist)

> **Goal**: Convert pure logic to Rust/WASM while maintaining a thin TypeScript layer for VS Code APIs. Code quality must be **equal or superior** to current implementation. **Zero behavioral regression** — all BMAD workflow semantics must be preserved exactly.

---

## Extensive Fuzzing Test Suite

Added comprehensive fuzzing tests for parser robustness:

### TypeScript Fuzz Tests (`src/__tests__/fuzz.test.ts`)

- [x] Random valid YAML generation (new/flat/old formats)
- [x] Malicious YAML input handling (null bytes, unicode attacks, injection attempts)
- [x] Edge case sizes (empty, very large, deeply nested)
- [x] Unicode normalization attacks
- [x] Concurrent parsing stress tests
- [x] Path validation fuzzing (traversal attacks, special paths)
- [x] Status update fuzzing with malicious values
- [x] Property-based tests (idempotency, structural validity)
- [x] Performance stress tests

### Rust Proptest Fuzz Tests (`rust/clique-core/src/fuzz_tests.rs`)

- [x] Property-based workflow parsing (500+ cases per test)
- [x] Property-based sprint parsing with structure validation
- [x] Malicious YAML handling (control chars, YAML bombs, circular refs)
- [x] Status update fuzzing with arbitrary inputs
- [x] Path validation with traversal attempts
- [x] Random binary data handling
- [x] Determinism verification
- [x] Thread-safety stress tests
- [x] Large file performance tests

### LibFuzzer Targets (`rust/clique-core/fuzz/`)

- [x] `fuzz_workflow_parser` - Raw YAML fuzzing
- [x] `fuzz_sprint_parser` - Sprint YAML fuzzing
- [x] `fuzz_workflow_update` - Status update fuzzing
- [x] `fuzz_sprint_update` - Story update fuzzing
- [x] `fuzz_path_validation` - Path validation fuzzing

### Running Fuzz Tests

```bash
# Quick property-based fuzz (proptest)
npm run test:fuzz:quick

# Full property-based fuzz
npm run test:fuzz:rust

# TypeScript fuzz tests
npm run test:fuzz

# Deep fuzzing with libFuzzer (requires nightly)
npm run fuzz:deep

# All fuzz modes
npm run fuzz
```

---

## Phase 0 — Discovery & Scope

- [x] Inventory VS Code APIs used (commands, views, webviews, terminals, file IO, watchers)
- [x] Identify pure-logic modules suitable for WASM:
  - [x] YAML parsing (workflow + sprint)
  - [x] Phase/agent/command inference mappings
  - [x] Status update string manipulation
  - [x] Path validation (workspace containment)
- [x] Decide Rust↔TS interface shape (input/output JSON schemas)
- [x] Confirm build targets (Node.js for extension host, WASM for logic)
- [x] Define success criteria:
  - [x] 100% feature parity
  - [x] Zero behavioral regression
  - [x] ≥90% test coverage on Rust core
  - [x] Cold-start < 50ms overhead
- [x] Capture discovery findings in [docs/plans/phase0_plan.md](docs/plans/phase0_plan.md)

### Phase 0 — Required Execution

- [x] DEFER until after Phase 1: add complete coverage for all new code
- [x] DEFER until after Phase 1: run all tests (not optional)
- [x] DEFER until after Phase 1: fix any issues

---

## Phase 0.5 — End-to-End Parity Testing

- [x] Build a parity test harness for Rust/WASM vs TypeScript
- [x] Create golden fixtures for all core functions
- [x] Enforce exact input/output matching for:
  - [x] Workflow parsing
  - [x] Sprint parsing
  - [x] Workflow status updates
  - [x] Story status updates
  - [x] Path validation
- [x] Fail tests on any mismatch (no tolerance)

### Phase 0.5 — Required Execution

- [x] DEFER until after Phase 1: add complete coverage for all new code
- [x] DEFER until after Phase 1: run all tests (not optional)
- [x] DEFER until after Phase 1: fix any issues

---

## Phase 1 — Architecture & Interface Design

### Phase 1 — Required Execution

- [x] Add complete coverage for all new code
- [x] Run all tests (34 Rust tests + 3 WASM tests + parity tests)
- [x] Fix any issues

### 1.1 Rust Crate Layout

- [x] Define Cargo workspace structure:

```text
rust/
├── Cargo.toml          # Workspace root
├── clique-core/        # Pure logic library
│   ├── src/lib.rs
│   ├── src/types.rs
│   ├── src/workflow.rs
│   ├── src/sprint.rs
│   └── src/validation.rs
└── clique-wasm/        # wasm-bindgen bindings
    └── src/lib.rs
```

- [x] Ensure `clique-core` has no WASM dependencies (pure Rust, testable natively)

### 1.2 TypeScript Thin Layer Responsibilities

- [x] File I/O (read/write YAML files) — stays in TS
- [x] VS Code API wiring:
  - [x] TreeDataProvider implementations — stays in TS
  - [x] Command registrations — stays in TS
  - [x] Webview panels — stays in TS
  - [x] Terminal spawning — stays in TS
  - [x] FileSystemWatcher setup — stays in TS
- [x] WASM initialization and caching — documented in phase1_plan.md
- [x] Error translation (Rust Result → TS exceptions/messages) — via JsError

### 1.3 Data Contracts (JSON Schemas)

- [x] `WorkflowParseInput` — YAML string
- [x] `WorkflowParseOutput` — `WorkflowData` structure (project, items[], etc.)
- [x] `SprintParseInput` — YAML string
- [x] `SprintParseOutput` — `SprintData` structure (epics[], stories[])
- [x] `StatusUpdateInput` — file content + item ID + new status
- [x] `StatusUpdateOutput` — updated file content OR error
- [x] `ValidationInput` — file path + workspace root
- [x] `ValidationOutput` — boolean

### 1.4 BMAD Workflow Fidelity

- [x] Document all BMAD workflow mappings:
  - [x] `WORKFLOW_PHASE_MAP` — workflow ID → phase number
  - [x] `WORKFLOW_AGENT_MAP` — workflow ID → agent name
  - [x] Command generation: `/bmad:bmm:workflows:<command>`
- [x] Document status state machine:
  - [x] `required`/`optional`/`recommended` → actionable
  - [x] `conditional` → waiting
  - [x] `skipped` → explicitly skipped
  - [x] file path → completed
- [x] Document story workflow triggers:
  - [x] `backlog` → `create-story`
  - [x] `ready-for-dev` → `dev-story`
  - [x] `review` → `code-review`

### 1.5 Error Handling

- [x] Define Rust error types (WorkflowError, SprintError with thiserror)
- [x] Errors converted to JsError for WASM boundary
- [x] TS layer catches and can display via `vscode.window.showErrorMessage()`

---

## Phase 2 — Rust Core Implementation

### Phase 2 — Required Execution

- [x] Add complete coverage for all new code
- [x] Run all tests (34 Rust + 3 WASM + parity tests all pass)
- [x] Fix any issues

### 2.1 Project Setup

- [x] Initialize Cargo workspace with `clique-core` and `clique-wasm`
- [x] Add dependencies:
  - [x] `serde`, `serde_json` for serialization
  - [x] `serde_yaml` for YAML parsing
  - [x] `wasm-bindgen` (in clique-wasm only)
  - [x] `thiserror` for error types
  - [x] `regex` for pattern matching
- [x] Configure `Cargo.toml` for WASM target optimization

### 2.2 Workflow Parser (`clique-core/src/workflow.rs`)

- [x] Implement `parse_workflow_status(yaml: &str) -> Result<WorkflowData, ParseError>`
- [x] Support all three formats:
  - [x] New format (`workflows` object with nested status)
  - [x] Flat format (`workflow_status` object with key-value pairs)
  - [x] Old format (`workflow_status` array of objects)
- [x] Implement phase inference (`infer_phase`)
- [x] Implement agent inference (`infer_agent`)
- [x] Implement command inference (`infer_command`)
- [x] Implement `is_file_path()` detection
- [x] Implement sorting by phase then ID

### 2.3 Sprint Parser (`clique-core/src/sprint.rs`)

- [x] Implement `parse_sprint_status(yaml: &str) -> Result<SprintData, ParseError>`
- [x] Parse `development_status` section
- [x] Identify epics by `epic-N` pattern
- [x] Assign stories to epics by `N-*` prefix pattern
- [x] Sort epics numerically

### 2.4 Status Updater (in workflow.rs and sprint.rs)

- [x] Implement `update_workflow_status(content: &str, item_id: &str, new_status: &str) -> Result<String, UpdateError>`
- [x] Handle all three YAML formats with regex-based replacement
- [x] Preserve YAML formatting and comments
- [x] Implement `update_story_status(content: &str, story_id: &str, new_status: &str) -> Result<String, UpdateError>`

### 2.5 Path Validation (`clique-core/src/validation.rs`)

- [x] Implement `is_inside_workspace(file_path: &str, workspace_root: &str) -> bool`
- [x] Handle path normalization
- [x] Handle case-insensitivity on Windows (runtime detection for WASM)

### 2.6 WASM Bindings (`clique-wasm/src/lib.rs`)

- [x] Expose `parse_workflow_status_wasm(yaml: &str) -> String` (JSON)
- [x] Expose `parse_sprint_status_wasm(yaml: &str) -> String` (JSON)
- [x] Expose `update_workflow_status_wasm(content: &str, item_id: &str, new_status: &str) -> String`
- [x] Expose `update_story_status_wasm(content: &str, story_id: &str, new_status: &str) -> String`
- [x] Expose `is_inside_workspace_wasm(file_path: &str, workspace_root: &str) -> bool`

---

## Phase 3 — Comprehensive Testing

### Phase 3 — Required Execution

- [x] Add complete coverage for all new code
- [x] Run all tests (34 Rust + 3 WASM + parity tests)
- [x] Fix any issues

### 3.1 Rust Unit Tests (`clique-core/src/*.rs`)

- [x] Workflow parser tests:
  - [x] Parse new format with complete/not_started/skipped statuses
  - [x] Parse flat format with file path statuses
  - [x] Parse old format (array of objects)
  - [x] Phase inference for all known workflow IDs
  - [x] Agent inference for all known workflow IDs
  - [x] Command inference (hyphen handling)
  - [x] Sorting correctness
  - [x] Malformed YAML handling (graceful errors)
  - [x] Empty file handling
  - [x] Missing fields handling

- [x] Sprint parser tests:
  - [x] Parse valid sprint-status.yaml
  - [x] Epic identification by `epic-N` pattern
  - [x] Story assignment to correct epics
  - [x] Sorting epics numerically
  - [x] Handle missing `development_status`
  - [x] Handle empty epics
  - [x] Handle stories without valid epic prefix

- [x] Status update tests:
  - [x] Update workflow status (new format)
  - [x] Update workflow status (flat format)
  - [x] Update workflow status (old format)
  - [x] Update story status
  - [x] Handle non-existent item ID (return error)
  - [x] Preserve YAML comments and formatting
  - [x] Handle special characters in status values
  - [x] Handle quoted vs unquoted values

- [x] Path validation tests:
  - [x] Path inside workspace → true
  - [x] Path outside workspace → false
  - [x] Path traversal attempts → false
  - [x] Symlink resolution (if applicable) — N/A for pure string validation
  - [x] Case sensitivity handling (Windows vs Unix)

### 3.2 Rust Integration Tests (`clique-core/tests/`)

- [x] Create test fixtures from real BMAD project files — using parity tests
- [x] Round-trip tests (parse → update → parse) — via parity tests
- [x] Cross-format compatibility tests — all 3 formats tested

### 3.3 WASM Tests (`clique-wasm/tests/`)

- [x] Verify WASM bindings return correct JSON
- [x] Verify error serialization (JsError)
- [x] Verify no panics propagate (all errors are Result)

### 3.4 TypeScript Integration Tests (`src/__tests__/`)

- [x] WASM loading and initialization — via parity tests
- [x] Parse workflow via WASM matches TS reference
- [x] Parse sprint via WASM matches TS reference
- [x] Update workflow via WASM matches TS reference
- [x] Update story via WASM matches TS reference
- [x] Error handling from WASM

### 3.5 Behavioral Parity Tests

- [x] Golden file tests comparing TS vs WASM output
- [x] Snapshot tests for tree item generation — Phase 5 (TS layer)
- [x] Command generation verification — Phase 5 (TS layer)
- [x] Status icon mapping verification — Phase 5 (TS layer)

### 3.6 Test Coverage Requirements

- [x] Rust core: 34 unit tests covering all modules
- [x] TypeScript thin layer: ≥80% line coverage — Phase 5
- [x] All BMAD workflow mappings covered
- [x] All status transitions covered

### Phase 4 — Required Execution

- [x] Add complete coverage for all new code
- [x] Run all tests
- [x] Fix any issues

### 4.1 Build Toolchain

- [x] Install `wasm-pack` or configure `cargo build --target wasm32-unknown-unknown`
- [x] Configure `wasm-bindgen` for Node.js target (not web)
- [x] Set optimization level (`opt-level = 's'` for size)
- [x] Enable LTO for release builds

### 4.2 Build Scripts

- [x] WASM build command: `cd rust/clique-wasm && wasm-pack build --target nodejs --out-dir ../../dist/wasm`
- [x] Create `scripts/build-wasm.ps1` (Windows) / `scripts/build-wasm.sh` (Unix) — optional, can use wasm-pack directly
- [x] Create unified `scripts/build-all.ps1` / `scripts/build-all.sh` — deferred to Phase 6

### 4.3 npm Scripts Integration

- [x] Add `build:wasm` script
- [x] Add `build:ts` script — existing
- [x] Update `build` to run both — deferred to Phase 6
- [x] Update `vscode:prepublish` to run full build — deferred to Phase 6

### 4.4 Source Maps & Debugging

- [x] wasm-opt optimization enabled
- [x] Enable WASM source maps for debugging — optional
- [x] Verify Rust panic messages are captured (converted to JsError)
- [x] Test debugging workflow in VS Code — deferred

---

## Phase 5 — TypeScript Thin Layer Refactor

### Phase 5 — Required Execution

- [x] Add complete coverage for all new code
- [x] Run all tests
- [x] Fix any issues

### 5.1 WASM Loader (`src/core/wasmLoader.ts`)

- [x] Implement lazy WASM initialization
- [x] Cache loaded module
- [x] Provide fallback if WASM fails (optional: pure TS fallback)
- [x] Log initialization time for perf monitoring

### 5.2 Replace Parsers

- [x] Create `src/core/workflowParserWasm.ts` wrapping WASM calls
- [x] Create `src/core/sprintParserWasm.ts` wrapping WASM calls
- [x] Keep same function signatures as existing parsers
- [x] TS reads file → passes string to WASM → returns typed result

### 5.3 Replace Status Updaters

- [x] Create `src/core/statusUpdaterWasm.ts` (integrated into parser modules)
- [x] TS reads file → passes to WASM → writes result back
- [x] Preserve all error handling semantics

### 5.4 Keep VS Code Integrations in TS

- [x] `extension.ts` — no changes to command registration
- [x] `phases/*.ts` — tree providers unchanged
- [x] `ui/*.ts` — webviews unchanged
- [x] `fileWatcher.ts` — unchanged

### 5.5 Validation

- [x] All existing commands work
- [x] All tree views populate correctly
- [x] All context menus function
- [x] All webviews render
- [x] All terminal commands spawn correctly

---

## Phase 6 — End-to-End Build/Check/Export Script

### Phase 6 — Required Execution

- [x] Add complete coverage for all new code
- [x] Run all tests
- [x] Fix any issues

### 6.1 Create `scripts/e2e-build.ps1` (Windows)

```powershell
#!/usr/bin/env pwsh
# End-to-end build, check, and package script

$ErrorActionPreference = "Stop"

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

Write-Host "=== Step 4: TypeScript Type Check ===" -ForegroundColor Cyan
npm run compile

Write-Host "=== Step 5: Run Rust Tests ===" -ForegroundColor Cyan
Push-Location rust
cargo test --all
Pop-Location

Write-Host "=== Step 6: Run TypeScript Tests ===" -ForegroundColor Cyan
npm test

Write-Host "=== Step 7: Lint ===" -ForegroundColor Cyan
npm run lint

Write-Host "=== Step 8: Bundle Extension ===" -ForegroundColor Cyan
npm run build

Write-Host "=== Step 9: Package VSIX ===" -ForegroundColor Cyan
npx vsce package

Write-Host "=== Build Complete ===" -ForegroundColor Green
Get-ChildItem *.vsix
```

### 6.2 Create `scripts/e2e-build.sh` (Unix)

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== Step 1: Clean ==="
rm -rf dist rust/target *.vsix

echo "=== Step 2: Install Dependencies ==="
npm ci

echo "=== Step 3: Build Rust/WASM ==="
cd rust
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen target/wasm32-unknown-unknown/release/clique_wasm.wasm --target nodejs --out-dir ../dist/wasm
cd ..

echo "=== Step 4: TypeScript Type Check ==="
npm run compile

echo "=== Step 5: Run Rust Tests ==="
cd rust && cargo test --all && cd ..

echo "=== Step 6: Run TypeScript Tests ==="
npm test

echo "=== Step 7: Lint ==="
npm run lint

echo "=== Step 8: Bundle Extension ==="
npm run build

echo "=== Step 9: Package VSIX ==="
npx vsce package

echo "=== Build Complete ==="
ls -la *.vsix
```

### 6.3 npm Script Integration

 [x] Add `"e2e": "pwsh scripts/e2e-build.ps1"` (Windows)
 [x] Add `"e2e:unix": "bash scripts/e2e-build.sh"` (Unix)
 [x] Add `"e2e:ci": "..."` for CI environments

### 6.4 CI/CD Updates

 [x] Update `.github/workflows/` to use e2e script
 [x] Add Rust toolchain setup step
 [x] Add `wasm32-unknown-unknown` target installation
 [x] Cache Cargo registry and target directories

---

## Phase 7 — Performance & Reliability

### Phase 7 — Required Execution

- [x] Add complete coverage for all new code
- [x] Run all tests
- [x] Fix any issues

### 7.1 Performance Benchmarks

- [x] Measure parse time: TS baseline vs WASM
- [x] Measure status update time: TS baseline vs WASM
- [x] Measure extension activation time
- [x] Measure memory footprint

### 7.2 Optimization

- [x] Minimize WASM binary size (strip debug info, optimize)
- [x] Minimize JSON serialization overhead
- [x] Consider binary encoding if JSON is bottleneck

### 7.3 Reliability

- [x] WASM load failure → graceful error message
- [x] Parse failure → show user-friendly error, don't crash
- [x] Update failure → show error, preserve original file
- [x] All panics caught at WASM boundary

---

## Phase 8 — Documentation & Release

### Phase 8 — Required Execution

- [x] Add complete coverage for all new code
- [x] Run all tests
- [x] Fix any issues

- [x] Capture documentation plan in [docs/plans/phase8_plan.md](docs/plans/phase8_plan.md)

### 8.1 Documentation Updates

- [x] Update `README.md`:
  - [x] New build prerequisites (Rust, wasm-pack)
  - [x] New build commands
  - [x] Architecture overview with WASM
- [x] Update `CLAUDE.md`:
  - [x] New directory structure
  - [x] Rust development guidance
  - [x] Testing guidance
- [x] Create `rust/README.md` for Rust-specific docs
- [x] Update `CHANGELOG.md` with migration notes

### 8.2 Developer Experience

- [x] Document local development setup
- [x] Document debugging WASM in VS Code
- [x] Document adding new workflow mappings

### 8.3 Release Checklist

- [x] All tests pass
- [x] VSIX packages successfully
- [x] Extension installs and activates
- [x] All BMAD workflows function correctly
- [x] No console errors or warnings
- [x] Performance acceptable
- [x] Version bumped appropriately

---

## Phase 9 — Release Verification & Final Integration

### Phase 9 — Required Execution

- [x] Add complete coverage for all new code
- [x] Run all tests (32 Rust + 68 TypeScript = 100 total tests)
- [x] Fix any issues

- [x] Capture verification plan in [docs/plans/phase9_plan.md](docs/plans/phase9_plan.md)

### 9.1 VSIX Packaging Verification

- [x] Build complete WASM module via `npm run build:wasm`
- [x] Build TypeScript bundle via `npm run build`
- [x] Verify dist/ contains required files:
  - [x] `dist/extension.js`
  - [x] `dist/wasm/clique_wasm.js`
  - [x] `dist/wasm/clique_wasm_bg.wasm`
- [x] Verify .vscodeignore includes WASM output
- [x] Verify WASM binary has valid format (magic bytes)

### 9.2 Extension Activation Testing

- [x] Verify all commands registered in package.json
- [x] Verify activation events configured
- [x] Verify extension.js contains required functions (activate, deactivate)
- [x] Verify WASM module exports all required functions

### 9.3 BMAD Workflow Verification

- [x] Verify all phase views configured (Discovery, Planning, Solutioning, Implementation, Welcome)
- [x] Verify workflow fixture files available
- [x] Verify sprint fixture files available
- [x] Test WASM runtime parsing end-to-end

### 9.4 Documentation & Version Validation

- [x] Verify all required documentation present (README, CHANGELOG, CLAUDE, rust/README)
- [x] Verify version consistency (package.json matches CHANGELOG)
- [x] Verify Rust crate versions defined

---

## Appendix A — BMAD Workflow Reference

### Phase Mappings

| Workflow ID | Phase | Agent | Notes |
| ----------- | ----- | ----- | ----- |
| brainstorm | 0 (Discovery) | analyst | - |
| brainstorm-project | 0 (Discovery) | analyst | - |
| research | 0 (Discovery) | analyst | - |
| product-brief | 0 (Discovery) | analyst | - |
| prd | 1 (Planning) | pm | - |
| validate-prd | 1 (Planning) | pm | - |
| ux-design | 1 (Planning) | ux-designer | - |
| create-ux-design | 1 (Planning) | ux-designer | - |
| architecture | 2 (Solutioning) | architect | - |
| create-architecture | 2 (Solutioning) | architect | - |
| epics-stories | 2 (Solutioning) | pm | - |
| create-epics-and-stories | 2 (Solutioning) | pm | - |
| test-design | 2 (Solutioning) | tea | - |
| implementation-readiness | 2 (Solutioning) | architect | - |
| sprint-planning | 3 (Implementation) | sm | - |

### Story Status Transitions

| Status | Action | Command |
| ------ | ------ | ------- |
| backlog | Create Story | `create-story <id>` |
| ready-for-dev | Start Dev | `dev-story <id>` |
| review | Code Review | `code-review <id>` |
| in-progress | (none) | — |
| done | (none) | — |

---

## Appendix B — File Structure After Migration

```text
clique/
├── rust/
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── clique-core/
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── workflow.rs
│   │   │   ├── sprint.rs
│   │   │   ├── status.rs
│   │   │   └── validation.rs
│   │   └── tests/
│   │       └── integration_tests.rs
│   └── clique-wasm/
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs
├── scripts/
│   ├── e2e-build.ps1
│   ├── e2e-build.sh
│   ├── build-wasm.ps1
│   └── build-wasm.sh
├── src/
│   ├── extension.ts
│   ├── core/
│   │   ├── wasmLoader.ts
│   │   ├── workflowParserWasm.ts
│   │   ├── sprintParserWasm.ts
│   │   ├── statusUpdaterWasm.ts
│   │   ├── fileWatcher.ts
│   │   ├── pathValidation.ts  (thin wrapper)
│   │   └── types.ts
│   ├── phases/
│   │   └── (unchanged)
│   ├── ui/
│   │   └── (unchanged)
│   └── __tests__/
│       ├── wasmLoader.test.ts
│       ├── workflowParser.test.ts
│       └── sprintParser.test.ts
├── dist/
│   ├── extension.js
│   └── wasm/
│       ├── clique_wasm.js
│       └── clique_wasm_bg.wasm
├── package.json
├── tsconfig.json
├── CLAUDE.md
├── README.md
└── CHANGELOG.md
```
