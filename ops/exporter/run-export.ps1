# Scheduled entry point for Windows machine exporters (Task Scheduler).
# Machine identity and providers come from the calling task wrapper
# (SLOPMETER_MACHINE_ID, SLOPMETER_MACHINE_PROVIDERS, SLOPMETER_MACHINE_EXPORT_PATH).
#
# The exporter checkout tracks origin/main so loader fixes reach every machine
# without manual redeploys; it must never hold local edits.
# Native-command stderr must not abort the script (Windows PowerShell 5.1 turns
# it into terminating errors under 'Stop'); exit codes are checked explicitly.
$ErrorActionPreference = 'Continue'
Set-Location (Resolve-Path "$PSScriptRoot\..\..")

# Offline is normal for laptops: export with the current code rather than
# skipping the export.
git fetch -q origin main
if ($LASTEXITCODE -eq 0) {
  git reset -q --hard origin/main
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  bun install --frozen-lockfile | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Warning "git fetch failed; exporting with $(git rev-parse --short HEAD)"
}

bun run scripts/export-machine.ts
exit $LASTEXITCODE
