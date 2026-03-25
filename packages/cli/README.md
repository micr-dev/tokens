# slopmeter

`slopmeter` is a Node.js CLI that scans local Claude Code, Codex, Gemini CLI, Cursor, Open Code, Pi Coding Agent, Droid, Hermes Agent, and Helios usage data and generates a contribution-style heatmap for the rolling past year.

## Requirements

- Node.js `>=22`

## Run with npm

Use it without installing:

```bash
npx slopmeter
```

Install it globally:

```bash
npm install -g slopmeter
slopmeter
```

## Usage

```bash
slopmeter [--all] [--claude] [--codex] [--gemini] [--cursor] [--opencode] [--pi] [--droid] [--hermes] [--helios] [--dark] [--format png|svg|json] [--output ./heatmap-last-year.png]
```

By default, the CLI:

- scans all supported providers
- writes `./heatmap-last-year.png`
- infers the date window as the rolling last year ending today

## Options

- `--claude`: include only Claude Code data
- `--codex`: include only Codex data
- `--gemini`: include only Gemini CLI data
- `--cursor`: include only Cursor data
- `--opencode`: include only Open Code data
- `--pi`: include only Pi Coding Agent data
- `--droid`: include only Droid data
- `--hermes`: include only Hermes Agent data
- `--helios`: include only Helios data
- `--all`: merge all providers into one combined graph
- `--dark`: render the image with the dark theme
- `-f, --format <png|svg|json>`: choose the output format
- `-o, --output <path>`: write output to a custom path
- `-h, --help`: print the help text

## Examples

Generate the default PNG:

```bash
npx slopmeter
```

Write an SVG:

```bash
npx slopmeter --format svg --output ./out/heatmap.svg
```

Write JSON for custom rendering:

```bash
npx slopmeter --format json --output ./out/heatmap.json
```

Render only Codex usage:

```bash
npx slopmeter --codex
```

Render only Cursor usage:

```bash
npx slopmeter --cursor
```

Render only Gemini CLI usage:

```bash
npx slopmeter --gemini
```

Render only Pi Coding Agent usage:

```bash
npx slopmeter --pi
```

Render only Droid usage:

```bash
npx slopmeter --droid
```

Render only Hermes Agent usage:

```bash
npx slopmeter --hermes
```

Render only Helios usage:

```bash
npx slopmeter --helios
```

Render one merged graph across all providers:

```bash
npx slopmeter --all
```

When provider flags are present, `slopmeter` only loads those providers and only prints availability for those providers.

Render a dark-theme SVG:

```bash
npx slopmeter --dark --format svg --output ./out/heatmap-dark.svg
```

## Output behavior

- If `--format` is omitted, the format is inferred from the `--output` extension when possible.
- Supported extensions are `.png`, `.svg`, and `.json`.
- If neither `--format` nor a recognized output extension is provided, PNG is used.

## JSON export

- `--format json` writes a machine-readable export with `version`, `start`, `end`, and `providers`.
- Each provider entry contains `provider`, `daily`, and optional `insights`.
- Each `daily` row contains `date`, `input`, `output`, `cache`, `total`, optional `displayValue`, and `breakdown`.

## Data locations

- Claude Code: `$CLAUDE_CONFIG_DIR/*/projects` or `~/.config/claude/projects`, `~/.claude/projects`
- Older Claude Code layouts: falls back to `$CLAUDE_CONFIG_DIR/stats-cache.json`, `~/.config/claude/stats-cache.json`, or `~/.claude/stats-cache.json` for days not present in project logs
- Earliest Claude Code activity fallback: uses `$CLAUDE_CONFIG_DIR/history.jsonl`, `~/.config/claude/history.jsonl`, or `~/.claude/history.jsonl` to mark activity-only days when token totals are unavailable
- Codex: `$CODEX_HOME/sessions` or `~/.codex/sessions`
- Gemini CLI: `$GEMINI_HOME/tmp/*/chats/session-*.json` or `~/.gemini/tmp/*/chats/session-*.json`
- Cursor: reads `cursorAuth/accessToken` and `cursorAuth/refreshToken` from `$CURSOR_STATE_DB_PATH`, `$CURSOR_CONFIG_DIR/User/globalStorage/state.vscdb`, `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (macOS), `%APPDATA%/Cursor/User/globalStorage/state.vscdb` (Windows), or `~/.config/Cursor/User/globalStorage/state.vscdb` (Linux), then loads usage from Cursor's CSV export endpoint
- Open Code: prefers `$OPENCODE_DATA_DIR/opencode.db` or `~/.local/share/opencode/opencode.db`, and falls back to `$OPENCODE_DATA_DIR/storage/message` or `~/.local/share/opencode/storage/message`
- Pi Coding Agent: `$PI_CODING_AGENT_DIR/sessions` or `~/.pi/agent/sessions`
- GSD-2: `$GSD_HOME/sessions` or `~/.gsd/sessions`, merged into `pi`
- Droid: `~/.factory/sessions/**/*.settings.json`
- Hermes Agent: `$HERMES_HOME/state.db` or `~/.hermes/state.db`
- Helios: `$HELIOS_HOME/helios.db` or `~/.helios/helios.db`

When Claude Code falls back to `stats-cache.json`, the daily input/output/cache split is reconstructed from Claude's cached model totals because the older layout does not keep per-request usage logs.
When Claude Code falls back to `history.jsonl`, those days are rendered as activity-only cells and do not affect the token totals shown in the header.

## Exit behavior

- If no provider flags are passed, `slopmeter` renders every provider with available data.
- If `--all` is passed, `slopmeter` loads all providers and renders one combined graph with merged totals, streaks, and model rankings.
- Gemini CLI usage is derived from recorded `gemini` chat messages in session JSON files, using Gemini's recorded prompt, cache, and total token counts per message.
- Pi Coding Agent usage is derived from assistant messages in Pi and GSD session logs, grouped by the model that handled each turn.
- Hermes Agent usage is derived from assistant-message token counts in `state.db`, with session input distributed proportionally across assistant turns.
- Helios usage is derived from assistant-message token counts in `helios.db`, with session input distributed proportionally across assistant turns.
- If provider flags are passed and a requested provider has no data, the command exits with an error.
- If no provider has data, the command exits with an error.

## Environment variables

- `SLOPMETER_FILE_PROCESS_CONCURRENCY`: positive integer file-processing limit for Claude Code and Codex JSONL files. Default: `16`.
- `SLOPMETER_MAX_JSONL_RECORD_BYTES`: byte cap for Claude Code and Codex JSONL records, OpenCode JSON documents, and OpenCode SQLite `message.data` payloads. Default: `67108864` (`64 MB`).
- `GEMINI_HOME`: alternate Gemini CLI base directory. Default: `~/.gemini`.
- `GSD_HOME`: alternate GSD base directory. Default: `~/.gsd`.
- `HERMES_HOME`: alternate Hermes base directory. Default: `~/.hermes`.
- `HELIOS_HOME`: alternate Helios base directory. Default: `~/.helios`.

## JSONL record handling

- Claude Code and Codex JSONL files are streamed through the same bounded record splitter; `slopmeter` does not materialize whole files in memory.
- Oversized Claude Code JSONL records fail the file with a clear error that names the file, line number, byte cap, and `SLOPMETER_MAX_JSONL_RECORD_BYTES`.
- OpenCode prefers the current SQLite store (`opencode.db`) and falls back to the legacy file-backed message layout.
- OpenCode legacy JSON message files are read through a bounded JSON document reader before `JSON.parse`.
- OpenCode SQLite `message.data` payloads use the same byte cap before `JSON.parse`.
- Oversized OpenCode JSON documents and SQLite message payloads fail clearly with the source path or row label, byte cap, and `SLOPMETER_MAX_JSONL_RECORD_BYTES`.
- Only Codex `turn_context` and `event_msg` `token_count` records are parsed for usage aggregation.
- Oversized irrelevant Codex records are skipped and reported in a warning summary.
- Oversized relevant Codex records fail the file with a clear error that names the file, line number, byte cap, and `SLOPMETER_MAX_JSONL_RECORD_BYTES`.
- Pi Coding Agent and GSD session logs are streamed and only assistant messages are parsed for usage aggregation.

## License

MIT
