# Changelog

All notable changes to the "CliqueClaw" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.5] - 2026-01-26

### Added (0.2.5)

- Support for flat `workflow_status` format with key-value pairs

## [Unreleased]

### Added (Unreleased)

- Rust/WASM documentation and developer setup guidance
- Rust workspace README for build/test workflows

### Changed (Unreleased)

- WASM parse exports now return JS values to reduce JSON serialization overhead

## [0.2.4] - 2026-01-26

### Added (0.2.4)

- Search for `bmm-workflow-status.yaml` in `_bmad-output/planning-artifacts/` folder

## [0.2.3] - 2026-01-26

### Added (0.2.3)

- Support for new `_bmad-output` folder structure and workflow format

### Fixed (0.2.3)

- Tree item click routing and Implementation panel menus

## [0.2.0] - 2025-12-07

### Changed (0.2.0)

- Phase-based workflow UI architecture
- Auto-publish via GitHub Actions

## [0.1.5] - 2025-12-07

### Changed (0.1.5)

- Updated README

## [0.1.4] - 2025-12-07

### Fixed (0.1.4)

- Extension now activates when clicking sidebar view

## [0.1.3] - 2025-12-07

### Changed (0.1.3)

- Renamed all internal IDs from "bmad" to "clique"
- Updated user-facing text to use "Clique" branding

## [0.1.2] - 2025-12-07

### Added (0.1.2)

- Custom sidebar icon

## [0.1.1] - 2025-12-07

### Changed (0.1.1)

- Updated repository URLs

## [0.1.0] - 2025-12-07

### Added (0.1.0)

- Initial release
- Tree view sidebar displaying epics and stories
- Workflow actions with inline play button
- Status management via context menu
- Terminal integration for Claude workflows
- Auto-refresh on file changes
- Extension icon
- Acknowledgments for Brian Madison and the BMAD Method
