import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { loadDroidRows } from "../src/lib/droid";
import { formatLocalDate } from "../src/lib/utils";

function createTempWorkspace(label: string) {
  return mkdtempSync(join(tmpdir(), `slopmeter-${label}-`));
}

function ensureParent(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function writeJsonFile(path: string, value: unknown) {
  ensureParent(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("loadDroidRows aggregates Factory Droid session settings", async (t) => {
  const workspace = createTempWorkspace("droid");
  const originalHome = process.env.HOME;

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  });

  process.env.HOME = workspace;

  writeJsonFile(
    join(
      workspace,
      ".factory",
      "sessions",
      "-tmp-project",
      "session-one.settings.json",
    ),
    {
      model: "custom:gpt-5.4-[CLIProxy]-24",
      providerLockTimestamp: "2026-03-14T10:00:00.000Z",
      tokenUsage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 2,
        cacheCreationTokens: 1,
        thinkingTokens: 3,
      },
    },
  );
  writeJsonFile(
    join(
      workspace,
      ".factory",
      "sessions",
      "-tmp-project",
      "session-two.settings.json",
    ),
    {
      model: "glm-5",
      providerLockTimestamp: "2026-03-15T10:00:00.000Z",
      tokenUsage: {
        inputTokens: 4,
        outputTokens: 6,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        thinkingTokens: 0,
      },
    },
  );

  const summary = await loadDroidRows(
    new Date("2026-03-13T00:00:00.000Z"),
    new Date("2026-03-15T23:59:59.999Z"),
  );

  assert.equal(summary.provider, "droid");
  assert.deepEqual(
    summary.daily.map((day) => ({
      date: formatLocalDate(day.date),
      input: day.input,
      output: day.output,
      cache: day.cache,
      total: day.total,
      model: day.breakdown[0]?.name,
    })),
    [
      {
        date: "2026-03-14",
        input: 12,
        output: 9,
        cache: { input: 2, output: 1 },
        total: 21,
        model: "custom:gpt-5.4-[CLIProxy]-24",
      },
      {
        date: "2026-03-15",
        input: 4,
        output: 6,
        cache: { input: 0, output: 0 },
        total: 10,
        model: "glm-5",
      },
    ],
  );
});
