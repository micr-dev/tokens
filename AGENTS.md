# Repository Agent Notes

These notes are repo-local guidance for `tokens.micr.dev`.

## Workflow

- Use Bun for this repo. The root has `bun.lock`; do not introduce npm or pnpm lockfile churn.
- Use jj for version control in this checkout. Inspect `jj status` and `jj diff` before committing.
- Before pushing, run `residue status`. This repo currently has Residue configured but no hooks installed.
- Facts are part of the project contract. Add or update `.facts` when changing user-visible behavior, then run the relevant `facts check --tags ...` command or verify manual facts explicitly.

## Published Data

- The public site is driven by generated artifacts:
  - `.slopmeter-data/published/daily-usage.json`
  - `.slopmeter-data/published/cost-analysis.json`
  - `.slopmeter-data/published/heatmap-last-year.svg`
  - `packages/web/lib/published-data.generated.ts`
- If a generated artifact changes, keep the bundled TypeScript module in sync.
- `publish:web` refreshes cost data before publishing usage. If `ccusage` hangs locally, do not claim a fresh ccusage refresh; use the existing artifact as the current published snapshot and call out the limitation.

## Cost Tab Accounting

- Treat harness spend as the canonical top-line cost total.
- Treat Provider/Model cost rows as an allocation of that same canonical harness spend. The displayed model subtotal should round to the displayed harness spend.
- Do not sum imported `model_cost_summary` as a separate UI subtotal. Those rows are useful as model-rate inputs and diagnostics, but they can disagree with harness spend because preserved, subscription-plan, null-cost, and refreshed sources have different coverage.
- OpenCode cost history includes sessions from another machine. Do not treat local `ccusage opencode` as a complete oracle.
- Pi should use model-estimated spend when local ccusage undercounts the published Pi history.
- Keep model alias canonicalization aligned between artifact normalization and analytics so names such as `cliproxyapi/gpt-5.4` and `gpt-5.4` do not split in the UI.

## Verification

- Focused web checks:
  - `bun run --cwd packages/web typecheck`
  - `bun test packages/web/test/usage.test.ts`
  - `bun test packages/web/test/publish-usage.test.ts --test-name-pattern 'normalizeCostAnalysisPayload'`
  - `bun run --cwd packages/web build`
- A full `packages/web/test/publish-usage.test.ts` run currently has unrelated merge-behavior failures. Do not hide those failures, but do not treat them as cost-tab regressions unless the touched change affects that merge path.
- For browser verification, start the web app on `0.0.0.0` with an unused port and inspect the rendered Cost tab. A healthy Cost tab shows Harness spend and Model subtotal as the same rounded dollar amount.
