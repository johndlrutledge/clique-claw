# Clique VS Code Extension

## Overview

A VS Code extension that reads `sprint-status.yaml` and provides a UI to run Claude workflows based on story status.

## Features

1. **Tree View Sidebar** - Display stories grouped by epic with status indicators
2. **Workflow Actions** - Inline play button to run appropriate Claude commands
3. **Status Management** - Right-click to change story status directly
4. **Sprint File Selection** - Search workspace and select which `sprint-status.yaml` to use
5. **Terminal Integration** - Spawn terminals with the correct workflow command
6. **Terminal Tracking** - See active terminals under each story, click to focus, trash to close
7. **Session Resumption** - Automatically tracks Claude session IDs, resume where you left off
8. **Auto-refresh** - Watch `sprint-status.yaml` for changes

## Workflow State Machine

```
backlog → create-story → ready-for-dev → dev-story → in-progress → (manual) → review → code-review → done
```

| Current Status    | Action       | Command                                                      |
| ----------------- | ------------ | ------------------------------------------------------------ |
| backlog           | Create Story | `claude "/bmad:bmm:workflows:create-story <story-id>"`       |
| ready-for-dev     | Start Dev    | `claude "/bmad:bmm:workflows:dev-story <story-id>"`          |
| review            | Code Review  | `claude "/bmad:bmm:workflows:code-review <story-id>"`        |
| in-progress, done | No action    | -                                                            |

## File Structure

```
clique/
├── package.json              # Extension manifest with commands, views
├── tsconfig.json             # TypeScript configuration
├── src/
│   ├── extension.ts          # Activation entry point
│   ├── sprintParser.ts       # Parse sprint-status.yaml
│   ├── storyTreeProvider.ts  # Tree view data provider
│   └── workflowRunner.ts     # Terminal spawning logic
└── docs/
    └── PLAN.md               # This file
```

## Commands

| Command                  | Description                              |
| ------------------------ | ---------------------------------------- |
| `clique.runWorkflow`       | Run the appropriate workflow for a story |
| `clique.refresh`           | Reload sprint-status.yaml                |
| `clique.selectFile`        | Choose which sprint-status.yaml to use   |
| `clique.setStatus.*`       | Change story status (backlog, ready-for-dev, in-progress, review, done) |
| `clique.focusTerminal`     | Focus/show a terminal (click on terminal item) |
| `clique.closeTerminal`     | Close a terminal (trash icon)            |
| `clique.resumeSession`     | Resume a Claude session where you left off |
| `clique.clearSession`      | Clear saved session for a story          |

## UI

### Sidebar Tree View
```
CLIQUE
├── [folder] Select Sprint File
├── [refresh] Refresh
│
├── Epic 3: Public API [in-progress]
│   └── 3-4-create-public-calendar-domain [done] ✓
├── Epic 4: Admin Migration [in-progress]
│   ├── 4-6-create-admin-services-domain [done] ✓
│   ├── 4-7-create-admin-staff-domain [review] ▶ (play button)
│   │   └── 🖥 Clique: 4-7-create-admin-staff-domain  [trash] (close)
│   ├── 4-8-create-admin-team-domain [backlog] ▶ (play button)
│   └── ...
```

- Stories with active terminals become expandable
- Click terminal to focus it
- Trash icon closes the terminal

### Right-Click Context Menu (on stories)
- Set Status: Backlog
- Set Status: Ready for Dev
- Set Status: In Progress
- Set Status: Review
- Set Status: Done

## Installation

```bash
# From source
cd bmad-workflow
npm install
npm run compile
vsce package

# Install
code --install-extension bmad-workflow-0.1.0.vsix
```

## Dependencies

- `yaml` - YAML parsing
- VS Code API (built-in)
