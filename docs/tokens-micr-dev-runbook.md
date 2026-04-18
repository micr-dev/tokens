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
