import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";

import {
  JSON_EXPORT_VERSION,
  mergeJsonExportsToPublishedUsage,
} from "../packages/cli/src/lib/export";
import type { JsonExportPayload } from "../packages/cli/src/interfaces";

interface MachineExportEnvelope {
  exportVersion: 1;
  machine: string;
  exportedAt: string;
  payload: JsonExportPayload;
}

const inputDir = resolve(
  process.env.SLOPMETER_MACHINE_EXPORT_DIR?.trim() ||
    `${process.env.HOME}/.local/share/slopmeter/machine-exports`,
);
const outputPath = resolve(
  process.env.SLOPMETER_MACHINE_IMPORT_PATH?.trim() ||
    `${process.env.HOME}/.local/share/slopmeter/machine-import.json`,
);

function fail(message: string): never {
  throw new Error(message);
}

function readEnvelope(path: string): JsonExportPayload {
  const value = JSON.parse(
    readFileSync(path, "utf8"),
  ) as Partial<MachineExportEnvelope>;

  if (
    value.exportVersion !== 1 ||
    typeof value.machine !== "string" ||
    !value.machine
  ) {
    fail(`Invalid machine export envelope: ${path}`);
  }

  if (
    typeof value.exportedAt !== "string" ||
    !value.exportedAt ||
    Number.isNaN(Date.parse(value.exportedAt))
  ) {
    fail(`Missing export timestamp: ${path}`);
  }

  const payload = value.payload;

  if (!payload || payload.version !== JSON_EXPORT_VERSION) {
    fail(`Unsupported export version in ${path}`);
  }

  if (
    payload.providers.some(
      (provider) => provider.provider === "all" || provider.provider === "t3",
    )
  ) {
    fail(
      `Machine export must contain provider-specific non-hosted data: ${path}`,
    );
  }

  return payload;
}

function main() {
  const paths = existsSync(inputDir)
    ? readdirSync(inputDir)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => resolve(inputDir, name))
    : [];

  if (paths.length === 0) {
    process.stdout.write(
      "No machine exports found; preserving the existing import.\n",
    );
    return;
  }

  const merged = mergeJsonExportsToPublishedUsage(paths.map(readEnvelope));
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, outputPath);
  process.stdout.write(
    `Merged ${paths.length} machine export(s) into ${basename(outputPath)}\n`,
  );
}

main();
