# `tokens.micr.dev` Runbook

This site deploys from the Git repository.

## Rule Of Thumb

- If you change UI or app code, edit the repo, commit, and push `main`.
- If you change published usage data, regenerate the published artifacts in the repo, commit them, and push `main`.

## What Production Serves

Production does not depend on runtime blob reads for the canonical dataset.

The deployed site serves the bundled snapshot generated from:

- `.slopmeter-data/published/daily-usage.json`
- `.slopmeter-data/published/heatmap-last-year.svg`
- `packages/web/lib/published-data.generated.ts`

Do not hand-edit `packages/web/lib/published-data.generated.ts`. Regenerate it through the publish script.

## Code Changes

Use this path when changing layout, styling, tabs, analytics rendering, or other web behavior.

1. Edit the repository.
2. Verify locally if needed:

```bash
bunx next build
```

3. Commit the intended files.
4. Push `main`.
5. Wait for the Vercel production deploy for `tokens.micr.dev`.

## Data Changes

Use this path when recovered history, imports, or local provider data changed.

1. Update the relevant source data or imports.
2. Regenerate the published artifacts from the repo root:

```bash
SLOPMETER_WEB_SKIP_BLOB_UPLOAD=1 bun run publish:web
```

3. Review the regenerated outputs:

- `.slopmeter-data/published/daily-usage.json`
- `.slopmeter-data/published/heatmap-last-year.svg`
- `packages/web/lib/published-data.generated.ts`

4. Verify locally if needed:

```bash
bunx next build
```

5. Commit those generated files with the source changes.
6. Push `main`.
7. Wait for the Vercel production deploy for `tokens.micr.dev`.

## OpenCode Recovery Refresh

If the OpenCode recovery source DB changed and you want to rebuild the canonical recovery import first:

```bash
bun run publish:web:refresh-opencode-recovery
```

If you want to regenerate the recovery import without publishing:

```bash
bun run opencode:recovery:export
```

## Publish Checklist

- The worktree contains the intended code or data changes.
- For data changes, the generated published artifacts were regenerated.
- `bunx next build` passes.
- The commit contains the generated artifacts when data changed.
- `main` was pushed.
- Vercel shows a `READY` production deployment for the latest commit.

## Current Deployment Model

- Git is the deployment path.
- Vercel deploys `main`.
- `tokens.micr.dev` should be treated as the production alias for the latest successful production deploy.

## Daily Automation

The daily publish job runs from a dedicated clone on the machine that holds the local usage histories. The units in `ops/systemd/` are the source of truth; install them with symlinks so the deployed units cannot drift from the repo:

```bash
ln -sf ~/.local/share/tokens-publish/repo/ops/systemd/tokens-publish.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
```

- Automation clone: `~/.local/share/tokens-publish/repo`
- Last run summary: `~/.local/state/slopmeter-automation/last-run.json` (`ok`, failing `stage`, `error`)
- Machine export config: `~/.config/slopmeter/machines.json`

`scripts/auto-publish-web.ts`:

- owns the clone: it discards leftovers of an interrupted run in the generated artifacts and `.next`, then resets `main` to `origin/main`; it refuses to run only if other tracked files were edited
- pulls remote machine exports (an unreachable machine keeps its last export), merges them, and runs `publish:web`
- commits and pushes the generated artifacts when the dataset changed
- bounds every step with a timeout and records the failing stage in the run summary

The service retries a failed run every 20 minutes, up to 4 attempts in 12 hours, and times out after 50 minutes.

### Data rules

- Published history is the system of record. A publish may recompute today and yesterday freely; older provider/day rows may grow (for example, when a new machine backfills) but never shrink. Local sources lose history over time: Claude Code prunes transcripts after 30 days and Codex compresses old rollouts.
- Cost is computed on every publish from the merged daily usage and `packages/web/lib/model-prices.ts`. Models without a price are listed as `missing-cost`; add a price there, never in the generated artifacts.

### Remote machine exporters

Each remote machine runs `ops/exporter/run-export.sh` (macOS/Linux) or `ops/exporter/run-export.ps1` (Windows) from a clone of this repo on a schedule. The wrapper resets the clone to `origin/main` before exporting, so loader fixes reach every machine. The central publisher warns in its journal when an export is older than 48 hours or contains no providers.

To inspect or rerun it manually:

```bash
systemctl --user status tokens-publish.timer --no-pager
systemctl --user status tokens-publish.service --no-pager
journalctl --user -u tokens-publish.service -n 100 --no-pager
cat ~/.local/state/slopmeter-automation/last-run.json
systemctl --user start tokens-publish.service
```

If the machine must keep publishing while logged out, verify user linger is enabled:

```bash
loginctl show-user "$USER" -p Linger
```
