#!/usr/bin/env bash
# Scheduled entry point for remote machine exporters (macOS LaunchAgent, Linux
# timer). Machine identity and providers come from the scheduler environment
# (SLOPMETER_MACHINE_ID, SLOPMETER_MACHINE_PROVIDERS).
#
# The exporter checkout tracks origin/main so loader fixes reach every machine
# without manual redeploys; it must never hold local edits.
#
# The body is one brace group so bash parses it fully before `git reset`
# rewrites this file.
{
  set -euo pipefail
  cd "$(dirname "$0")/../.."

  # Offline is normal for laptops: export with the current code rather than
  # skipping the export.
  if git fetch -q origin main; then
    git reset -q --hard origin/main
    bun install --frozen-lockfile >/dev/null
  else
    echo "git fetch failed; exporting with $(git rev-parse --short HEAD)" >&2
  fi

  exec bun scripts/export-machine.ts
}
