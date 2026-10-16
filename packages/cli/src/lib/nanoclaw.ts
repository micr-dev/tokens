import { homedir } from "node:os";
import { join, sep } from "node:path";
import type { UsageSummary } from "../interfaces";
import { listFilesRecursive } from "./utils";
import { loadCodexRowsFromFiles } from "./codex";

const DEFAULT_NANOCLAW_DATA_DIR = join(
  homedir(),
  "workspace",
  "nanoclaw",
  "data",
);

function isNanoClawCodexSession(filePath: string) {
  const segments = filePath.split(sep);
  const codexHomeIndex = segments.lastIndexOf(".codex-shared");

  return codexHomeIndex >= 0 && segments[codexHomeIndex + 1] === "sessions";
}

export async function loadNanoClawRows(
  start: Date,
  end: Date,
  warnings: string[] = [],
  dataDirectory = DEFAULT_NANOCLAW_DATA_DIR,
): Promise<UsageSummary> {
  const files = await listFilesRecursive(
    join(dataDirectory, "v2-sessions"),
    ".jsonl",
  );

  return loadCodexRowsFromFiles(
    files.filter(isNanoClawCodexSession),
    start,
    end,
    "nanoclaw",
    warnings,
  );
}
