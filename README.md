# CliqueClaw

Streamline agent development with the BMad-Method. This VS Code extension reads `sprint-status.yaml` files and provides a UI to run Claude workflows based on story status.

**Repository:** [https://github.com/johndlrutledge/cliqueclaw](https://github.com/johndlrutledge/cliqueclaw)

> Fork note: CliqueClaw is a fork of [https://github.com/hedingerm/clique](https://github.com/hedingerm/clique) with a partial Rust/WASM rewrite focused on core parsing, validation, and update logic.

## Features

- **Phase-Based Workflow UI** - Four tabs for Discovery, Planning, Solutioning, and Implementation phases
- **Workflow Status Tracking** - Read `bmm-workflow-status.yaml` to show workflow progress
- **Rich Workflow Cards** - Status icons, agent badges, and notes for each workflow item
- **Detail Panel** - Click any workflow to see full details and run/skip actions
- **Welcome View** - Easy initialization when no workflow file exists
- **Tree View Sidebar** - Display stories grouped by epic with status indicators
- **Workflow Actions** - Inline play button to run appropriate Claude commands
- **Status Management** - Right-click to change story status directly
- **Sprint File Selection** - Search workspace and select which `sprint-status.yaml` to use
- **Terminal Integration** - Spawn terminals with the correct workflow command
- **Auto-refresh** - Automatically watches both workflow and sprint status files

## Workflow State Machine

Stories progress through a defined workflow:

```text
backlog → create-story → ready-for-dev → dev-story → in-progress → review → code-review → done
```

| Current Status        | Action       | Command                                                |
| --------------------- | ------------ | ------------------------------------------------------ |
| `backlog`             | Create Story | `claude "/bmad:bmm:workflows:create-story <story-id>"` |
| `ready-for-dev`       | Start Dev    | `claude "/bmad:bmm:workflows:dev-story <story-id>"`    |
| `review`              | Code Review  | `claude "/bmad:bmm:workflows:code-review <story-id>"`  |
| `in-progress`, `done` | No action    | -                                                      |

## Usage

### Sidebar

The extension adds a "CliqueClaw" view to the activity bar. The tree view displays:

- Epics as collapsible parent nodes
- Stories nested under their epics with status icons
- Play button on actionable stories (backlog, ready-for-dev, review)

### Running Workflows

1. Click the play button next to a story to run its workflow
2. A terminal opens with the appropriate Claude command
3. The story status updates as the workflow progresses

### Changing Status

Right-click any story to access the status menu:

- Set Status: Backlog
- Set Status: Ready for Dev
- Set Status: In Progress
- Set Status: Review
- Set Status: Done

### Multiple Sprint Files

If your workspace contains multiple `sprint-status.yaml` files:

1. Click the folder icon in the view title bar
2. Select which file to use from the quick pick menu

## Workflow Status File Format

The extension reads `bmm-workflow-status.yaml` to track BMAD methodology progress (searches `_bmad-output/`, `docs/`, then root):

```yaml
project: my-project
selected_track: enterprise
workflow_status:
  - id: "product-brief"
    phase: 0
    status: "required"
    agent: "analyst"
    command: "product-brief"
    note: "Create product brief first"

  - id: "prd"
    phase: 1
    status: "docs/prd.md"
    agent: "pm"
    command: "prd"
    note: "Completed"
```

### Status Values

- `required` / `optional` / `recommended` - Actionable, shows play button
- `conditional` - Waiting on prerequisites
- `skipped` - Explicitly skipped
- File path (e.g., `docs/prd.md`) - Completed, shows checkmark

## Sprint Status File Format

The extension expects a `sprint-status.yaml` file with this structure:

```yaml
project: my-project
sprint: 1

epics:
  - id: 1
    name: User Authentication
    status: in-progress
    stories:
      - id: 1-1-login-page
        status: done
      - id: 1-2-signup-flow
        status: ready-for-dev
      - id: 1-3-password-reset
        status: backlog

  - id: 2
    name: Dashboard
    status: backlog
    stories:
      - id: 2-1-metrics-display
        status: backlog
```

### Story ID Format

Story IDs follow the pattern: `{epic-num}-{story-num}-{description}`

Example: `4-7-create-admin-staff-domain`

## Requirements

- VS Code 1.85.0 or higher
- Claude CLI installed and configured
- Rust toolchain (stable) with `wasm32-unknown-unknown` target
- `wasm-pack` for building the WASM module

## Development

### Local Setup

- Install Rust and add the WASM target: `rustup target add wasm32-unknown-unknown`
- Install `wasm-pack`: `cargo install wasm-pack`
- Install Node dependencies: `npm install`

### Build & Test

```bash
npm install
npm run build:wasm
npm run build
npm test
```

For WASM source maps (debug builds):

```bash
npm run build:wasm:debug
```

You can also use the helper script with an environment flag:

```bash
CLIQUE_WASM_DEBUG=1 pwsh scripts/build-wasm.ps1
```

```bash
CLIQUE_WASM_DEBUG=1 bash scripts/build-wasm.sh
```

For Rust-only testing:

```bash
cd rust
cargo test --all
```

### Architecture Overview

CliqueClaw uses a Rust core for parsing and status updates, compiled to WASM and loaded by the VS Code extension. This is part of the fork’s partial Rust rewrite of the original project.

- `rust/clique-core` contains pure logic (parsers, status updates, validation).
- `rust/clique-wasm` exposes the core via `wasm-bindgen`.
- `src/core/wasmLoader.ts` loads the module and provides typed wrappers.
- The TypeScript layer handles VS Code APIs, file I/O, and UI rendering.

### Debugging WASM in VS Code

- Rebuild the WASM module after Rust changes: `npm run build:wasm`.
- For source maps, use `npm run build:wasm:debug` (or run the build script with `CLIQUE_WASM_DEBUG=1`).
- Use `RUST_BACKTRACE=1` to get richer error output from Rust panics.
- If debugging JS-side behavior, set breakpoints in `src/core/wasmLoader.ts`.

### Adding Workflow Mappings

- Update workflow/agent/command mappings in the Rust core (`rust/clique-core/src/workflow.rs`).
- Update any corresponding TS fallback logic if needed (`src/core/workflowParser.ts`).
- Add or update fixtures/tests in `src/__tests__/fixtures` and parity tests.

## Extension Settings

This extension currently has no configurable settings. The sprint file selection is stored per-workspace.

## Commands

| Command                           | Description                                         |
| --------------------------------- | --------------------------------------------------- |
| `CliqueClaw: Run Workflow`        | Run the appropriate workflow for the selected story |
| `CliqueClaw: Refresh`             | Reload the sprint-status.yaml file                  |
| `CliqueClaw: Select Sprint File`  | Choose which sprint-status.yaml to use              |
| `CliqueClaw: Set Status: *`       | Change story status                                 |

## Known Issues

- External changes to `sprint-status.yaml` may require a manual refresh in some cases

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Acknowledgments

This extension is built for the [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD) created by [Brian Madison](https://github.com/bmad-code-org). BMAD is a methodology for streamlined agent-driven development workflows.

## License

MIT - See [LICENSE](LICENSE) for details.
