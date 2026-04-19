import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

const GIT_AUTHOR_NAME = "Microck";
const GIT_AUTHOR_EMAIL = "contact@micr.dev";

interface GitCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export interface GitBackupRepoPaths {
  historyDir: string;
  latestDir: string;
  snapshotDir: string;
  snapshotJsonPath: string;
  snapshotSvgPath: string;
  latestJsonPath: string;
  latestSvgPath: string;
}

export interface GitBackupResult {
  enabled: boolean;
  skipped: boolean;
  pushed: boolean;
  repoDir: string | null;
  commitHash: string | null;
  reason: string | null;
}

function runGit(repoDir: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME,
      GIT_AUTHOR_EMAIL,
      GIT_COMMITTER_NAME: GIT_AUTHOR_NAME,
      GIT_COMMITTER_EMAIL: GIT_AUTHOR_EMAIL,
    },
  }) satisfies GitCommandResult;

  if (result.error) {
    throw result.error;
  }

  return result;
}

function assertGitSuccess(repoDir: string, args: string[]) {
  const result = runGit(repoDir, args);

  if (result.status !== 0) {
    throw new Error(
      `Git command failed in ${repoDir}: git ${args.join(" ")}\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout.trim();
}

function hasGitUpstream(repoDir: string) {
  const result = runGit(repoDir, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);

  return result.status === 0;
}

function normalizePublishedJsonForDiff(jsonText: string) {
  try {
    const parsed = JSON.parse(jsonText) as { updatedAt?: string };

    delete parsed.updatedAt;

    return JSON.stringify(parsed);
  } catch {
    return jsonText;
  }
}

function readTextIfExists(pathValue: string) {
  if (!existsSync(pathValue)) {
    return null;
  }

  return readFileSync(pathValue, "utf8");
}

export function buildGitBackupRepoPaths(
  repoDir: string,
  updatedAt: Date,
): GitBackupRepoPaths {
  const timestamp = updatedAt
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const historyDir = resolve(repoDir, "history");
  const latestDir = resolve(repoDir, "latest");
  const snapshotDir = resolve(historyDir, timestamp);

  return {
    historyDir,
    latestDir,
    snapshotDir,
    snapshotJsonPath: resolve(snapshotDir, "daily-usage.json"),
    snapshotSvgPath: resolve(snapshotDir, "heatmap-last-year.svg"),
    latestJsonPath: resolve(latestDir, "daily-usage.json"),
    latestSvgPath: resolve(latestDir, "heatmap-last-year.svg"),
  };
}

export function syncPublishedArtifactsToGitBackupRepo({
  repoDir,
  jsonSourcePath,
  svgSourcePath,
  updatedAt,
  push,
}: {
  repoDir: string;
  jsonSourcePath: string;
  svgSourcePath: string;
  updatedAt: Date;
  push: boolean;
}): GitBackupResult {
  assertGitSuccess(repoDir, ["rev-parse", "--is-inside-work-tree"]);

  const sourceJson = readFileSync(jsonSourcePath, "utf8");
  const sourceSvg = readFileSync(svgSourcePath, "utf8");
  const paths = buildGitBackupRepoPaths(repoDir, updatedAt);
  const latestJson = readTextIfExists(paths.latestJsonPath);
  const latestSvg = readTextIfExists(paths.latestSvgPath);
  const jsonChanged =
    !latestJson ||
    normalizePublishedJsonForDiff(latestJson) !==
      normalizePublishedJsonForDiff(sourceJson);
  const svgChanged = latestSvg !== sourceSvg;

  if (!jsonChanged && !svgChanged) {
    return {
      enabled: true,
      skipped: true,
      pushed: false,
      repoDir,
      commitHash: null,
      reason: "No backup changes detected.",
    };
  }

  for (const outputPath of [
    paths.snapshotJsonPath,
    paths.snapshotSvgPath,
    paths.latestJsonPath,
    paths.latestSvgPath,
  ]) {
    mkdirSync(dirname(outputPath), { recursive: true });
  }

  writeFileSync(paths.snapshotJsonPath, sourceJson, "utf8");
  writeFileSync(paths.snapshotSvgPath, sourceSvg, "utf8");
  writeFileSync(paths.latestJsonPath, sourceJson, "utf8");
  writeFileSync(paths.latestSvgPath, sourceSvg, "utf8");

  const trackedPaths = [
    relative(repoDir, paths.snapshotJsonPath),
    relative(repoDir, paths.snapshotSvgPath),
    relative(repoDir, paths.latestJsonPath),
    relative(repoDir, paths.latestSvgPath),
  ];

  assertGitSuccess(repoDir, ["add", "--", ...trackedPaths]);

  const diffResult = runGit(repoDir, ["diff", "--cached", "--quiet", "--exit-code"]);

  if (diffResult.status === 0) {
    return {
      enabled: true,
      skipped: true,
      pushed: false,
      repoDir,
      commitHash: null,
      reason: "No staged backup changes detected.",
    };
  }

  if (diffResult.status !== 1) {
    throw new Error(
      `Git diff check failed in ${repoDir}: ${diffResult.stderr || diffResult.stdout}`,
    );
  }

  const commitMessage = `backup: slopmeter snapshot ${updatedAt.toISOString()}`;

  assertGitSuccess(repoDir, ["commit", "-m", commitMessage]);

  const commitHash = assertGitSuccess(repoDir, ["rev-parse", "HEAD"]);

  if (push) {
    if (hasGitUpstream(repoDir)) {
      assertGitSuccess(repoDir, ["push"]);
    } else {
      assertGitSuccess(repoDir, ["push", "--set-upstream", "origin", "HEAD"]);
    }
  }

  return {
    enabled: true,
    skipped: false,
    pushed: push,
    repoDir,
    commitHash,
    reason: null,
  };
}
