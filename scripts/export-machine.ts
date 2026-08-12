import { hostname } from "node:os";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createJsonExportPayload,
  writeJsonExport,
} from "../packages/cli/src/lib/export";
import { aggregateUsage, providerIds } from "../packages/cli/src/providers";

function getDateWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setFullYear(start.getFullYear() - 1);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function main() {
  const outputPath = resolve(
    process.env.SLOPMETER_MACHINE_EXPORT_PATH?.trim() ||
      `${process.env.HOME}/.local/share/slopmeter/machine-export.json`,
  );
  const { start, end } = getDateWindow();
  const requestedProviders = process.env.SLOPMETER_MACHINE_PROVIDERS?.split(",")
    .map((provider) => provider.trim())
    .filter(Boolean) || ["claude", "codex"];
  const { rowsByProvider, warnings } = await aggregateUsage({
    start,
    end,
    requestedProviders,
  });
  for (const warning of warnings) process.stderr.write(`${warning}\n`);
  const providers = providerIds.flatMap((provider) => {
    const summary = rowsByProvider[provider];
    return summary ? [summary] : [];
  });
  const payload = createJsonExportPayload(start, end, providers);
  const envelope = {
    exportVersion: 1 as const,
    machine: process.env.SLOPMETER_MACHINE_ID?.trim() || hostname(),
    exportedAt: new Date().toISOString(),
    payload,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify(envelope, null, 2)}\n`,
    "utf8",
  );
  renameSync(temporaryPath, outputPath);
  process.stdout.write(
    `Exported ${providers.length} provider(s) to ${outputPath}\n`,
  );
}

void main();
