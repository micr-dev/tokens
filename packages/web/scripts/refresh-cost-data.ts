import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writePublishedCostArtifact } from "./publish-usage";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const DEFAULT_COST_ANALYSIS_IMPORT_PATH = "token-usage-analysis.json";
const DEFAULT_LOCAL_COST_OUTPUT_PATH =
  ".slopmeter-data/published/cost-analysis.json";

function resolveRepoPath(pathValue: string) {
  return resolve(REPO_ROOT, pathValue);
}

function resolveHomePath(pathValue: string) {
  return resolve(homedir(), pathValue);
}

function assertCcusageAvailable() {
  const check = spawnSync("ccusage", ["--version"], {
    encoding: "utf8",
  });

  if (check.status !== 0) {
    throw new Error(
      "ccusage is required to refresh the published cost snapshot.",
    );
  }
}

function main() {
  assertCcusageAvailable();

  const sourcePath = resolve(
    process.env.SLOPMETER_WEB_COST_ANALYSIS_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_COST_ANALYSIS_IMPORT_PATH.trim()
      : resolveHomePath(DEFAULT_COST_ANALYSIS_IMPORT_PATH),
  );
  const outputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_COST_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_COST_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_LOCAL_COST_OUTPUT_PATH),
  );
  const payload = writePublishedCostArtifact({ sourcePath, outputPath });

  process.stdout.write(
    `${JSON.stringify(
      {
        sourcePath,
        outputPath,
        generatedAt: payload.generatedAt,
        harnessTotalCostUsd: payload.harnessTotalCostUsd,
        modelTotalCostUsd: payload.modelTotalCostUsd,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
