import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildGitBackupRepoPaths,
  syncPublishedArtifactsToGitBackupRepo,
} from "../scripts/lib/git-backup";

function runGit(repoDir: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
  }).trim();
}

function createTempGitRepo() {
  const repoDir = mkdtempSync(join(tmpdir(), "slopmeter-git-backup-"));

  runGit(repoDir, ["init", "-b", "main"]);

  return repoDir;
}

function createSourceArtifacts(baseDir: string, json: string, svg: string) {
  const sourceDir = join(baseDir, "source");

  mkdirSync(sourceDir, { recursive: true });

  const jsonPath = join(sourceDir, "daily-usage.json");
  const svgPath = join(sourceDir, "heatmap-last-year.svg");

  writeFileSync(jsonPath, json, "utf8");
  writeFileSync(svgPath, svg, "utf8");

  return { jsonPath, svgPath };
}

test("buildGitBackupRepoPaths targets latest and history snapshot locations", () => {
  const paths = buildGitBackupRepoPaths(
    "/tmp/slopmeter-private-backups",
    new Date("2026-04-15T21:30:45.123Z"),
  );

  assert.equal(paths.historyDir, "/tmp/slopmeter-private-backups/history");
  assert.equal(paths.latestDir, "/tmp/slopmeter-private-backups/latest");
  assert.equal(
    paths.snapshotDir,
    "/tmp/slopmeter-private-backups/history/2026-04-15T21-30-45-123Z",
  );
});

test("syncPublishedArtifactsToGitBackupRepo commits changes and skips updatedAt-only duplicates", () => {
  const repoDir = createTempGitRepo();
  const firstArtifacts = createSourceArtifacts(
    repoDir,
    JSON.stringify(
      {
        version: "2026-03-03",
        start: "2026-04-01",
        end: "2026-04-15",
        updatedAt: "2026-04-15T21:30:45.123Z",
        providers: [
          {
            provider: "codex",
            daily: [
              {
                date: "2026-04-15",
                input: 7,
                output: 3,
                cache: { input: 0, output: 0 },
                total: 10,
                breakdown: [],
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    "<svg>first</svg>",
  );

  const firstResult = syncPublishedArtifactsToGitBackupRepo({
    repoDir,
    jsonSourcePath: firstArtifacts.jsonPath,
    svgSourcePath: firstArtifacts.svgPath,
    updatedAt: new Date("2026-04-15T21:30:45.123Z"),
    push: false,
  });

  assert.equal(firstResult.skipped, false);
  assert.equal(firstResult.commitHash !== null, true);
  assert.equal(existsSync(join(repoDir, "latest", "daily-usage.json")), true);
  assert.equal(
    existsSync(
      join(
        repoDir,
        "history",
        "2026-04-15T21-30-45-123Z",
        "daily-usage.json",
      ),
    ),
    true,
  );
  assert.equal(runGit(repoDir, ["rev-list", "--count", "HEAD"]), "1");

  const duplicateArtifacts = createSourceArtifacts(
    repoDir,
    JSON.stringify(
      {
        version: "2026-03-03",
        start: "2026-04-01",
        end: "2026-04-15",
        updatedAt: "2026-04-15T21:40:45.123Z",
        providers: [
          {
            provider: "codex",
            daily: [
              {
                date: "2026-04-15",
                input: 7,
                output: 3,
                cache: { input: 0, output: 0 },
                total: 10,
                breakdown: [],
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    "<svg>first</svg>",
  );

  const duplicateResult = syncPublishedArtifactsToGitBackupRepo({
    repoDir,
    jsonSourcePath: duplicateArtifacts.jsonPath,
    svgSourcePath: duplicateArtifacts.svgPath,
    updatedAt: new Date("2026-04-15T21:40:45.123Z"),
    push: false,
  });

  assert.equal(duplicateResult.skipped, true);
  assert.equal(runGit(repoDir, ["rev-list", "--count", "HEAD"]), "1");

  const changedArtifacts = createSourceArtifacts(
    repoDir,
    JSON.stringify(
      {
        version: "2026-03-03",
        start: "2026-04-01",
        end: "2026-04-15",
        updatedAt: "2026-04-16T00:00:00.000Z",
        providers: [
          {
            provider: "codex",
            daily: [
              {
                date: "2026-04-15",
                input: 70,
                output: 30,
                cache: { input: 0, output: 0 },
                total: 100,
                breakdown: [],
              },
            ],
          },
        ],
      },
      null,
      2,
    ),
    "<svg>second</svg>",
  );

  const changedResult = syncPublishedArtifactsToGitBackupRepo({
    repoDir,
    jsonSourcePath: changedArtifacts.jsonPath,
    svgSourcePath: changedArtifacts.svgPath,
    updatedAt: new Date("2026-04-16T00:00:00.000Z"),
    push: false,
  });

  assert.equal(changedResult.skipped, false);
  assert.equal(runGit(repoDir, ["rev-list", "--count", "HEAD"]), "2");
  assert.match(
    readFileSync(join(repoDir, "latest", "daily-usage.json"), "utf8"),
    /"total": 100/,
  );
  assert.equal(
    readFileSync(join(repoDir, "latest", "heatmap-last-year.svg"), "utf8"),
    "<svg>second</svg>",
  );
});
