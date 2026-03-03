# codegraph CLI

TypeScript CLI that generates usage heatmaps for Claude Code, Codex, and Open Code for the rolling past year (ending today).

Data is loaded directly in-process (no shelling out to `npx`/CLI binaries).

## Runtime and tooling

- Package manager: Bun
- Runtime: Node.js 22+
- Module format: ESM
- Type checking: TypeScript (`tsc`)
- Build compiler: `tsup`
- SVG library: `svg-builder`
- PNG rendering: `sharp`

## Setup

```bash
bun install
bun run typecheck
bun run build
```

## Usage

```bash
# Default output file: ./heatmap-last-year.png
codegraph-usage

# Custom output path
codegraph-usage --output ./out/heatmap.svg
# or
codegraph-usage -o ./out/heatmap.svg

# Explicit format
codegraph-usage --format svg
codegraph-usage --format png

# Optional provider filters
codegraph-usage --claude
codegraph-usage --codex
codegraph-usage --OpenCodex
```

## Notes

- The heatmap is Monday-first.
- The rendered range is always the past year from today, with today as the latest day.
- Default output format is PNG.
- If `--format` is not provided, format is inferred from `--output` extension (`.svg` or `.png`), otherwise PNG.
- If no provider flags are passed, the CLI renders every provider that has data.
- It always prints provider availability status lines (`found` / `not found`).
- If explicit provider flags are passed and one is missing, the command exits with an error.
- If no provider flags are passed and none have data, the command exits with an error.
