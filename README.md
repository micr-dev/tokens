# slopmeter

CLI tool that generates usage heatmaps for Claude Code, Codex, Cursor, Open Code, Pi Coding Agent, Droid, Hermes Agent, and Helios for the rolling past year (ending today).

## Monorepo layout

```text
packages/
  cli/
  registry/
  web/
tooling/
  typescript-config/
```

## Setup

```bash
bun install
bun run check
```

## Usage

```bash
# Build once
bun run build

# Run from built output
node packages/cli/dist/cli.js

# Run the CLI package directly in dev mode
bun run --cwd packages/cli dev

# Or if installed as a package binary
slopmeter
```

### Options

```bash
# Output file (default: ./heatmap-last-year.png)
slopmeter --output ./out/heatmap.svg
slopmeter -o ./out/heatmap.svg

# Output format
slopmeter --format png
slopmeter --format svg
slopmeter --format json
slopmeter -f svg

# Dark theme
slopmeter --dark
slopmeter --dark --format svg

# Merge all providers into one graph
slopmeter --all

# Provider filters (optional)
slopmeter --claude
slopmeter --codex
slopmeter --cursor
slopmeter --opencode
slopmeter --pi
slopmeter --droid
slopmeter --hermes
slopmeter --helios
```

## What the image shows

- Monday-first contribution-style heatmap for the last year.
- Top metrics per provider:
  - `LAST 30 DAYS`
  - `INPUT TOKENS`
  - `OUTPUT TOKENS`
  - `TOTAL TOKENS` (includes cache tokens)
- Bottom metrics per provider:
  - `MOST USED MODEL` (with total tokens)
  - `RECENT USE (LAST 30 DAYS)` (with total tokens)
  - `LONGEST STREAK`
  - `CURRENT STREAK`

Model names are normalized to remove a trailing date suffix like `-20251101`.

## Format behavior

- Default format is PNG.
- If `--format` is omitted, format is inferred from `--output` extension (`.png`, `.svg`, or `.json`).
- If neither provides a format, PNG is used.

## JSON export

- Use `--format json` (or an `.json` output filename) to export data for interactive rendering.
- Export includes fixed `version: "2026-03-03"`.
- Each provider includes:
  - `daily` rows with `date`, `input`, `output`, `cache`, `total`
  - `daily[].breakdown` per-model usage for that day, sorted by `tokens.total` (includes `input` and `output`)
  - `insights` (`mostUsedModel`, `recentMostUsedModel`) when available

## Hosted daily page

`packages/web` contains a small Next.js page meant for Vercel deployment. It renders the original `slopmeter` SVG layout on the web:

- one merged all-provider section
- one section per available provider
- custom hover tooltips on active cells

### Local-only verification

```bash
# optional frozen import from another machine
mkdir -p .slopmeter-data/imports
cp /path/to/windows-export.json .slopmeter-data/imports/windows-history.json

# optional one-time T3 Chat export kept outside the repo
mkdir -p ~/.local/share/slopmeter
cp /path/to/t3-chat-export.json ~/.local/share/slopmeter/t3-chat-export.json

# merge local usage + import and write only the local published artifact
SLOPMETER_WEB_SKIP_BLOB_UPLOAD=1 bun run publish:web

# run the web app locally against .slopmeter-data/published/daily-usage.json
bun run dev:web
```

### Publish flow

- The page reads `SLOPMETER_WEB_SVG_URL` at runtime.
- The hosted app serves from `/` by default. Set `SLOPMETER_WEB_BASE_PATH` only if you intentionally want a subpath deployment.
- `bun run publish:web` scans this machine's current usage, merges the optional Windows import at `.slopmeter-data/imports/windows-history.json`, merges the optional one-time T3 import at `~/.local/share/slopmeter/t3-chat-export.json`, writes `.slopmeter-data/published/daily-usage.json` plus `.slopmeter-data/published/heatmap-last-year.svg`, and uploads both artifacts to Vercel Blob.
- Set `BLOB_READ_WRITE_TOKEN` for real uploads.
- Optional overrides:
  - `SLOPMETER_WEB_BASE_PATH`
  - `SLOPMETER_WEB_IMPORT_PATH`
  - `SLOPMETER_WEB_T3_IMPORT_PATH`
  - `SLOPMETER_WEB_T3_MAX_BYTES`
  - `SLOPMETER_WEB_LOCAL_OUTPUT_PATH`
  - `SLOPMETER_WEB_LOCAL_SVG_OUTPUT_PATH`
  - `SLOPMETER_WEB_BLOB_PATH`
  - `SLOPMETER_WEB_SVG_BLOB_PATH`
  - `SLOPMETER_WEB_SKIP_BLOB_UPLOAD=1`

## Provider/data behavior

- If no provider flags are passed, the CLI renders all providers with available data.
- If `--all` is passed, the CLI renders one merged graph across all providers with consolidated totals, streaks, and model rankings.
- Pi Coding Agent usage is derived from assistant messages in Pi and GSD session logs, grouped by the model that handled each turn.
- Hermes and Helios stay separate provider sections even when they route to other backends underneath.
- T3 Chat is hosted-page-only and is sourced from a one-time local export during `publish:web`.
- If provider flags are passed, `slopmeter` only loads those providers and only prints availability for those providers.
- If no provider flags are passed, the CLI loads all providers and prints availability for all providers.
- If explicit provider flags are passed and any requested provider has no data, the command exits with an error.
- If no provider flags are passed and no provider has data, the command exits with an error.

## Environment knobs

- `SLOPMETER_FILE_PROCESS_CONCURRENCY`: positive integer file-processing limit for Claude Code and Codex JSONL files. Default: `16`.
- `SLOPMETER_MAX_JSONL_RECORD_BYTES`: byte cap for Claude Code and Codex JSONL records, OpenCode JSON documents, and OpenCode SQLite `message.data` payloads. Default: `67108864` (`64 MB`).
- `GSD_HOME`: alternate GSD base directory. Default: `~/.gsd`.
- `Droid`: `~/.factory/sessions/**/*.settings.json`
- `HERMES_HOME`: alternate Hermes base directory. Default: `~/.hermes`.
- `HELIOS_HOME`: alternate Helios base directory. Default: `~/.helios`.

## JSONL oversized-record behavior

- Claude Code and Codex now share the same bounded JSONL record splitter and do not materialize whole files in memory.
- Oversized Claude Code JSONL records fail the affected file with a clear error that names the file, line number, byte cap, and `SLOPMETER_MAX_JSONL_RECORD_BYTES`.
- OpenCode legacy JSON message files use a bounded JSON document reader before `JSON.parse`.
- OpenCode SQLite `message.data` payloads use the same byte cap before `JSON.parse`.
- Oversized OpenCode JSON documents and SQLite message payloads fail clearly with the source path or row label, byte cap, and `SLOPMETER_MAX_JSONL_RECORD_BYTES`.
- Codex now streams JSONL records and only parses records that affect usage aggregation.
- Oversized irrelevant Codex records are skipped and summarized with a warning after processing.
- Oversized relevant Codex records fail the affected file with a clear error that names the file, line number, byte cap, and `SLOPMETER_MAX_JSONL_RECORD_BYTES`.
- Pi Coding Agent and GSD session logs are streamed and only assistant messages are parsed for usage aggregation.

## Data locations

- Claude Code: `$CLAUDE_CONFIG_DIR/*/projects` (comma-separated dirs) or defaults `~/.config/claude/projects` and `~/.claude/projects`
- Codex: `$CODEX_HOME/sessions` or `~/.codex/sessions`
- Cursor: reads `cursorAuth/accessToken` and `cursorAuth/refreshToken` from `$CURSOR_STATE_DB_PATH`, `$CURSOR_CONFIG_DIR/User/globalStorage/state.vscdb`, `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (macOS), `%APPDATA%/Cursor/User/globalStorage/state.vscdb` (Windows), or `~/.config/Cursor/User/globalStorage/state.vscdb` (Linux), then loads usage from Cursor's CSV export endpoint
- Open Code: prefers `$OPENCODE_DATA_DIR/opencode.db` or `~/.local/share/opencode/opencode.db`, and falls back to `$OPENCODE_DATA_DIR/storage/message` or `~/.local/share/opencode/storage/message`
- Pi Coding Agent: `$PI_CODING_AGENT_DIR/sessions` or `~/.pi/agent/sessions`
- GSD-2: `$GSD_HOME/sessions` or `~/.gsd/sessions`, merged into `pi`
- Hermes Agent: `$HERMES_HOME/state.db` or `~/.hermes/state.db`
- Helios: `$HELIOS_HOME/helios.db` or `~/.helios/helios.db`
- T3 Chat hosted import: `SLOPMETER_WEB_T3_IMPORT_PATH` or `~/.local/share/slopmeter/t3-chat-export.json`
