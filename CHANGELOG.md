# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.1] - 2026-04-16

### Fixed

- **web**: Include vendor analytics in details payload (`4c39aab`)

## [0.4.0] - 2026-04-16

> Note: This is the initial changelog entry synthesized from the codebase state at the time of adoption. Earlier history is not available from the shallow clone.

### Added

- **CLI** (`packages/cli`): `slopmeter` CLI tool for generating yearly usage heatmaps across AI coding assistants
  - Support for **8 providers**: Claude Code, Codex, Cursor, Open Code, Pi Coding Agent, Droid, Hermes Agent, and Helios
  - Output formats: **PNG**, **SVG**, and **JSON** export
  - `--all` flag to merge all providers into a single consolidated graph
  - Per-provider flags: `--claude`, `--codex`, `--cursor`, `--opencode`, `--pi`, `--droid`, `--hermes`, `--helios`
  - Dark theme support (`--dark`)
  - Top/bottom metrics per provider: token counts, most-used model, streaks
  - Bounded JSONL record splitter for Claude Code and Codex (no whole-file materialization)
  - Oversized record handling with clear error messages
  - Configurable concurrency and byte cap via environment variables
- **Web** (`packages/web`): Hosted Next.js page for interactive heatmap rendering on Vercel
  - Merged all-provider section and per-provider sections
  - Custom hover tooltips on active cells
  - `publish:web` script for merging local usage data and uploading to Vercel Blob
  - Optional local imports for Windows history and T3 Chat data
- **Registry** (`packages/registry`): `codegraph-registry` package with shadcn-based component registry (e.g., `codegraph-heatmap`)
- **Tooling**: Shared ESLint config and TypeScript config packages
- **Monorepo**: Turborepo-based build orchestration with Bun workspaces

### Technical Details

- Monorepo layout: `packages/cli`, `packages/web`, `packages/registry`, `tooling/eslint-config`, `tooling/typescript-config`
- Runtime: Node.js ≥ 22, Bun 1.3.3, Next.js 15, React 19
- Key dependencies: `better-sqlite3`, `sharp`, `svg-builder`, `ora`, `ow`
- License: MIT
- Author: Jean P.D. Meijer
