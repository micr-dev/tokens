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
- `publish:usage` (and `publish:web`) computes `cost-analysis.json` from the merged `daily-usage.json` it just built: every provider/day/model breakdown row is priced with `packages/web/lib/model-prices.ts`. There is no ccusage step and no preserved cost history; the same usage always yields the same cost artifact.

## Cost Tab Accounting

- Treat harness spend as the canonical top-line cost total. Model rows are priced from the same breakdown rows, so harness and model totals match by construction.
- Per row: uncached input × input price + cache reads × cached-input price + cache writes × cache-write price (input price when none is published) + output × output price. omp stores cache tokens outside input/output; every other loader folds them in (see `splitBillableTokens`).
- Add prices only from LiteLLM's `model_prices_and_context_window.json`, an official vendor pricing page, or a documented $0 tier, and record the source on the entry. Map naming variants through `MODEL_PRICE_ALIASES`. Never guess: unknown models must stay in `modelWarnings` as missing-cost.
- Keep model alias canonicalization aligned between the price table and analytics so names such as `cliproxyapi/gpt-5.4` and `gpt-5.4` do not split in the UI.

## Verification

- Focused web checks:
  - `bun run --cwd packages/web typecheck`
  - `bun test packages/web/test/usage.test.ts`
  - `bun test packages/web/test/cost-analysis.test.ts`
  - `bun run --cwd packages/web build`
- A full `packages/web/test/publish-usage.test.ts` run currently has unrelated merge-behavior failures. Do not hide those failures, but do not treat them as cost-tab regressions unless the touched change affects that merge path.
- For browser verification, start the web app on `0.0.0.0` with an unused port and inspect the rendered Cost tab. A healthy Cost tab shows Harness spend and Model subtotal as the same rounded dollar amount.
