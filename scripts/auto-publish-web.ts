import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Daily publisher run by ops/systemd/tokens-publish.service from a dedicated
// automation clone. It is the only writer of the generated artifacts below, so
// it owns them: leftovers from an interrupted run are discarded, never treated
// as a reason to stop publishing.

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const RECOVERY_DB_PATH = resolve(
  homedir(),
  ".local/share/opencode/recovery/opencode-salvage-merged.db",
);
const MACHINE_IMPORT_PATH = resolve(
  homedir(),
  ".local/share/slopmeter/machine-import.json",
);
const STATE_PATH = resolve(
  homedir(),
  ".local/state/slopmeter-automation/last-run.json",
);
const GENERATED_ARTIFACTS = [
  ".slopmeter-data/published/daily-usage.json",
  ".slopmeter-data/published/cost-analysis.json",
  ".slopmeter-data/published/heatmap-last-year.svg",
  "packages/web/lib/published-data.generated.ts",
] as const;
const GIT_AUTHOR_NAME = "Microck";
const GIT_AUTHOR_EMAIL = "contact@micr.dev";
// Every step is bounded so a hung child (ssh, git, build) fails the run
// instead of leaving the oneshot "activating" forever, which blocks every
// later timer tick.
const STEP_TIMEOUT_MS = 15 * 60 * 1000;

interface RunSummary {
  ranAt: string;
  ok: boolean;
  stage: string;
  error: string | null;
  usedRecoveryRefresh: boolean;
  committed: boolean;
  commitSha: string | null;
  pushed: boolean;
}

let stage = "start";

function runCommand(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: STEP_TIMEOUT_MS,
    killSignal: "SIGKILL",
    maxBuffer: 256 * 1024 * 1024,
    env: {
      ...process.env,
      ...env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME,
      GIT_AUTHOR_EMAIL,
      GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
      GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL,
    },
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(" ")}: ${result.error.message}`);
  }

  return result;
}

function assertCommand(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) {
  const result = runCommand(command, args, env);

  // Child output goes to the journal so failures are diagnosable afterwards.
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}\n${(result.stderr || result.stdout).slice(-4000)}`,
    );
  }

  return result.stdout.trim();
}

function step<T>(name: string, run: () => T) {
  stage = name;
  process.stdout.write(`== ${name}\n`);

  return run();
}

function writeState(summary: RunSummary) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

// Drop anything a previous interrupted run left behind in paths this script
// owns, then require the rest of the clone to match origin/main exactly.
function resetAutomationClone() {
  assertCommand("git", ["fetch", "origin", "main"]);
  assertCommand("git", ["checkout", "--", ...GENERATED_ARTIFACTS]);

  const dirty = assertCommand("git", [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);

  if (dirty) {
    throw new Error(
      `Automation clone has edits outside generated artifacts; refusing to discard them.\n${dirty}`,
    );
  }

  // The clone never carries its own commits: a failed push from an earlier
  // run is regenerated from current data instead of being replayed.
  assertCommand("git", ["switch", "--force-create", "main", "origin/main"]);
  rmSync(resolve(REPO_ROOT, ".next"), { recursive: true, force: true });
}

function readArtifacts() {
  return GENERATED_ARTIFACTS.map((path) => {
    const fullPath = resolve(REPO_ROOT, path);

    if (!existsSync(fullPath)) {
      return null;
    }

    const text = readFileSync(fullPath, "utf8");

    // updatedAt and generatedAt change every run; ignore them when deciding
    // whether the dataset changed.
    return text.replace(/"(updatedAt|generatedAt)":\s*"[^"]*"/g, "");
  });
}

interface PublishedRow {
  date: string;
  total: number;
}

interface PublishedDataset {
  end: string;
  providers: { provider: string; daily: PublishedRow[] }[];
}

// Last line of defense before anything reaches git: compare the generated
// dataset with the one on origin/main and refuse to publish if history was
// lost, whatever the cause (merge bug, broken loader, truncated write). A
// failed run leaves the site on the last good dataset and records why.
function validatePublishedDataset(previousText: string, nextText: string) {
  const previous = JSON.parse(previousText) as PublishedDataset;
  const next = JSON.parse(nextText) as PublishedDataset;
  const nextTotals = new Map<string, number>();
  const problems: string[] = [];

  for (const provider of next.providers) {
    for (const row of provider.daily) {
      nextTotals.set(`${provider.provider}:${row.date}`, row.total);
    }
  }

  // Same window as RECOMPUTE_WINDOW_DAYS in publish-usage.ts: today and
  // yesterday may legitimately be recomputed downward.
  const windowStart = new Date(`${next.end}T00:00:00.000Z`);

  windowStart.setUTCDate(windowStart.getUTCDate() - 1);
  const windowStartKey = windowStart.toISOString().slice(0, 10);

  for (const provider of previous.providers) {
    if (!next.providers.some((entry) => entry.provider === provider.provider)) {
      problems.push(`provider ${provider.provider} disappeared`);
      continue;
    }

    for (const row of provider.daily) {
      const nextTotal = nextTotals.get(`${provider.provider}:${row.date}`) ?? 0;

      if (row.date < windowStartKey && nextTotal < row.total) {
        problems.push(
          `${provider.provider} ${row.date} shrank ${row.total} -> ${nextTotal}`,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Generated dataset loses published history; refusing to publish.\n${problems.slice(0, 20).join("\n")}`,
    );
  }
}

function main() {
  const usedRecoveryRefresh = existsSync(RECOVERY_DB_PATH);

  step("reset automation clone", resetAutomationClone);
  step("install dependencies", () =>
    assertCommand("bun", ["install", "--frozen-lockfile"]),
  );

  const before = readArtifacts();
  const previousDatasetText = readFileSync(
    resolve(REPO_ROOT, GENERATED_ARTIFACTS[0]),
    "utf8",
  );

  step("pull machine exports", () =>
    assertCommand("bun", ["run", "machine-exports:pull"]),
  );
  step("merge machine exports", () =>
    assertCommand("bun", ["run", "machine-exports:merge"]),
  );
  step("publish", () =>
    assertCommand(
      "bun",
      [
        "run",
        usedRecoveryRefresh
          ? "publish:web:refresh-opencode-recovery"
          : "publish:web",
      ],
      {
        SLOPMETER_WEB_SKIP_BLOB_UPLOAD: "1",
        SLOPMETER_WEB_IMPORT_PATH: MACHINE_IMPORT_PATH,
      },
    ),
  );
  step("validate", () =>
    validatePublishedDataset(
      previousDatasetText,
      readFileSync(resolve(REPO_ROOT, GENERATED_ARTIFACTS[0]), "utf8"),
    ),
  );
  step("build", () => assertCommand("bun", ["x", "next", "build"]));
  rmSync(resolve(REPO_ROOT, ".next"), { recursive: true, force: true });

  const after = readArtifacts();
  const changed = before.some((text, index) => text !== after[index]);

  if (!changed) {
    assertCommand("git", ["checkout", "--", ...GENERATED_ARTIFACTS]);
    writeState({
      ranAt: new Date().toISOString(),
      ok: true,
      stage: "done",
      error: null,
      usedRecoveryRefresh,
      committed: false,
      commitSha: null,
      pushed: false,
    });
    return;
  }

  const commitSha = step("commit", () => {
    assertCommand("git", ["add", "--", ...GENERATED_ARTIFACTS]);
    assertCommand("git", [
      "commit",
      "-m",
      `chore(data): daily publish ${new Date().toISOString().slice(0, 10)}`,
    ]);

    return assertCommand("git", ["rev-parse", "HEAD"]);
  });

  step("push", () => assertCommand("git", ["push", "origin", "main"]));
  writeState({
    ranAt: new Date().toISOString(),
    ok: true,
    stage: "done",
    error: null,
    usedRecoveryRefresh,
    committed: true,
    commitSha,
    pushed: true,
  });
}

try {
  main();
} catch (error) {
  writeState({
    ranAt: new Date().toISOString(),
    ok: false,
    stage,
    error: error instanceof Error ? error.message : String(error),
    usedRecoveryRefresh: existsSync(RECOVERY_DB_PATH),
    committed: false,
    commitSha: null,
    pushed: false,
  });
  process.exitCode = 1;
}
