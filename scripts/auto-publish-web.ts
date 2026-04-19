import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_RECOVERY_DB_PATH = resolve(
  homedir(),
  ".local/share/opencode/recovery/opencode-salvage-merged.db",
);
const DEFAULT_STATE_PATH = resolve(
  homedir(),
  ".local/state/slopmeter-automation/last-run.json",
);
const GENERATED_ARTIFACTS = [
  ".slopmeter-data/published/daily-usage.json",
  ".slopmeter-data/published/heatmap-last-year.svg",
  "packages/web/lib/published-data.generated.ts",
] as const;
const GIT_AUTHOR_NAME = "Microck";
const GIT_AUTHOR_EMAIL = "contact@micr.dev";

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface RunSummary {
  ranAt: string;
  repoRoot: string;
  usedRecoveryRefresh: boolean;
  latestBackupDir: string | null;
  materialChangeDetected: boolean;
  committed: boolean;
  commitSha: string | null;
  pushed: boolean;
}

function runCommand(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME,
      GIT_AUTHOR_EMAIL,
      GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
      GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL,
    },
  }) satisfies CommandResult;

  if (result.error) {
    throw result.error;
  }

  return result;
}

function assertCommand(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  const result = runCommand(command, args, env);

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout.trim();
}

function readTextIfExists(pathValue: string) {
  if (!existsSync(pathValue)) {
    return null;
  }

  return readFileSync(pathValue, "utf8");
}

function normalizePublishedJson(jsonText: string | null) {
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as { updatedAt?: string };

    delete parsed.updatedAt;

    return JSON.stringify(parsed);
  } catch {
    return jsonText;
  }
}

function assertCleanTrackedWorktree() {
  const status = assertCommand("git", [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);

  if (status) {
    throw new Error(
      `Automation clone is not clean. Refusing to publish.\n${status}`,
    );
  }
}

function assertMainBranch() {
  const branch = assertCommand("git", ["branch", "--show-current"]);

  if (branch !== "main") {
    throw new Error(`Automation clone must stay on main. Current branch: ${branch}`);
  }
}

function pullLatestMain() {
  assertCommand("git", ["fetch", "origin", "main"]);
  assertCommand("git", ["pull", "--ff-only", "origin", "main"]);
}

function installDependencies() {
  assertCommand("bun", ["install", "--frozen-lockfile"]);
}

function getLatestBackupDir() {
  const historyDir = resolve(REPO_ROOT, ".slopmeter-data/history");

  if (!existsSync(historyDir)) {
    return null;
  }

  const latestDir = readdirSync(historyDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .at(-1);

  return latestDir ? resolve(historyDir, latestDir) : null;
}

function restoreGeneratedArtifacts() {
  assertCommand("git", ["restore", "--", ...GENERATED_ARTIFACTS]);
}

function writeState(summary: RunSummary) {
  mkdirSync(dirname(DEFAULT_STATE_PATH), { recursive: true });
  writeFileSync(DEFAULT_STATE_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

function main() {
  const beforeJson = normalizePublishedJson(
    readTextIfExists(resolve(REPO_ROOT, GENERATED_ARTIFACTS[0])),
  );
  const beforeSvg = readTextIfExists(resolve(REPO_ROOT, GENERATED_ARTIFACTS[1]));
  const useRecoveryRefresh = existsSync(DEFAULT_RECOVERY_DB_PATH);
  const publishEnv = {
    SLOPMETER_WEB_SKIP_BLOB_UPLOAD: "1",
  } satisfies NodeJS.ProcessEnv;

  assertMainBranch();
  assertCleanTrackedWorktree();
  pullLatestMain();
  installDependencies();

  if (useRecoveryRefresh) {
    assertCommand("bun", ["run", "publish:web:refresh-opencode-recovery"], publishEnv);
  } else {
    assertCommand("bun", ["run", "publish:web"], publishEnv);
  }

  assertCommand("bunx", ["next", "build"]);

  const afterJson = normalizePublishedJson(
    readTextIfExists(resolve(REPO_ROOT, GENERATED_ARTIFACTS[0])),
  );
  const afterSvg = readTextIfExists(resolve(REPO_ROOT, GENERATED_ARTIFACTS[1]));
  const materialChangeDetected = beforeJson !== afterJson || beforeSvg !== afterSvg;
  const latestBackupDir = getLatestBackupDir();

  if (!materialChangeDetected) {
    restoreGeneratedArtifacts();

    const summary: RunSummary = {
      ranAt: new Date().toISOString(),
      repoRoot: REPO_ROOT,
      usedRecoveryRefresh: useRecoveryRefresh,
      latestBackupDir,
      materialChangeDetected: false,
      committed: false,
      commitSha: null,
      pushed: false,
    };

    writeState(summary);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  assertCommand("git", ["add", "--", ...GENERATED_ARTIFACTS]);
  const stagedDiff = runCommand("git", ["diff", "--cached", "--quiet", "--exit-code"]);

  if (stagedDiff.status === 0) {
    const summary: RunSummary = {
      ranAt: new Date().toISOString(),
      repoRoot: REPO_ROOT,
      usedRecoveryRefresh: useRecoveryRefresh,
      latestBackupDir,
      materialChangeDetected: false,
      committed: false,
      commitSha: null,
      pushed: false,
    };

    writeState(summary);
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (stagedDiff.status !== 1) {
    throw new Error(stagedDiff.stderr || stagedDiff.stdout);
  }

  const dateKey = new Date().toISOString().slice(0, 10);
  assertCommand("git", ["commit", "-m", `chore(data): daily publish ${dateKey}`]);
  const commitSha = assertCommand("git", ["rev-parse", "HEAD"]);
  assertCommand("git", ["push", "origin", "main"]);

  const summary: RunSummary = {
    ranAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    usedRecoveryRefresh: useRecoveryRefresh,
    latestBackupDir,
    materialChangeDetected: true,
    committed: true,
    commitSha,
    pushed: true,
  };

  writeState(summary);
  console.log(JSON.stringify(summary, null, 2));
}

main();
