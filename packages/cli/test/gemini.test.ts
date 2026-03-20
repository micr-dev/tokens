import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { loadGeminiRows } from "../src/lib/gemini";

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

test("loadGeminiRows aggregates recorded Gemini CLI chat sessions", async (t) => {
  const workspace = createTempWorkspace("gemini");
  const originalGeminiHome = process.env.GEMINI_HOME;
  const sessionPath = join(
    workspace,
    "tmp",
    "workspace",
    "chats",
    "session-2026-03-20T05-00-abcd1234.json",
  );

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });

    if (originalGeminiHome === undefined) {
      delete process.env.GEMINI_HOME;
    } else {
      process.env.GEMINI_HOME = originalGeminiHome;
    }
  });

  process.env.GEMINI_HOME = workspace;

  writeJsonFile(sessionPath, {
    sessionId: "abcd1234",
    messages: [
      {
        timestamp: "2026-03-18T10:00:00.000Z",
        type: "user",
      },
      {
        timestamp: "2026-03-18T10:00:05.000Z",
        type: "gemini",
        model: "gemini-2.5-pro-20260301",
        tokens: {
          input: 100,
          output: 40,
          cached: 20,
          total: 150,
        },
      },
      {
        timestamp: "2026-03-19T15:30:00.000Z",
        type: "gemini",
        model: "gemini-2.5-flash",
        tokens: {
          input: 20,
          output: 10,
          cached: 5,
          total: 30,
        },
      },
      {
        timestamp: "2026-02-10T09:00:00.000Z",
        type: "gemini",
        model: "gemini-old",
        tokens: {
          input: 999,
          output: 1,
          cached: 0,
          total: 1_000,
        },
      },
    ],
  });

  const summary = await loadGeminiRows(
    new Date("2026-03-18T00:00:00.000Z"),
    new Date("2026-03-20T23:59:59.999Z"),
  );

  assert.equal(summary.provider, "gemini");
  assert.deepEqual(
    summary.daily.map((day) => ({
      date: day.date.toISOString().slice(0, 10),
      input: day.input,
      output: day.output,
      cache: day.cache,
      total: day.total,
      models: day.breakdown.map((model) => [model.name, model.tokens.total]),
    })),
    [
      {
        date: "2026-03-18",
        input: 100,
        output: 50,
        cache: { input: 20, output: 0 },
        total: 150,
        models: [["gemini-2.5-pro", 150]],
      },
      {
        date: "2026-03-19",
        input: 20,
        output: 10,
        cache: { input: 5, output: 0 },
        total: 30,
        models: [["gemini-2.5-flash", 30]],
      },
    ],
  );
  assert.equal(summary.insights?.mostUsedModel?.name, "gemini-2.5-pro");
  assert.equal(summary.insights?.recentMostUsedModel?.name, "gemini-2.5-pro");
});

test("loadGeminiRows skips truncated gemini session files", async (t) => {
  const workspace = createTempWorkspace("gemini-invalid");
  const originalGeminiHome = process.env.GEMINI_HOME;
  const validSessionPath = join(
    workspace,
    "tmp",
    "workspace",
    "chats",
    "session-2026-03-20T05-00-valid.json",
  );
  const invalidSessionPath = join(
    workspace,
    "tmp",
    "workspace",
    "chats",
    "session-2026-03-20T05-01-invalid.json",
  );

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });

    if (originalGeminiHome === undefined) {
      delete process.env.GEMINI_HOME;
    } else {
      process.env.GEMINI_HOME = originalGeminiHome;
    }
  });

  process.env.GEMINI_HOME = workspace;

  writeJsonFile(validSessionPath, {
    messages: [
      {
        timestamp: "2026-03-20T10:00:00.000Z",
        type: "gemini",
        model: "gemini-2.5-pro",
        tokens: {
          input: 10,
          output: 5,
          cached: 2,
          total: 15,
        },
      },
    ],
  });
  ensureParent(invalidSessionPath);
  writeFileSync(invalidSessionPath, "{\"messages\":[", "utf8");

  const summary = await loadGeminiRows(
    new Date("2026-03-20T00:00:00.000Z"),
    new Date("2026-03-20T23:59:59.999Z"),
  );

  assert.deepEqual(
    summary.daily.map((day) => ({
      date: day.date.toISOString().slice(0, 10),
      total: day.total,
    })),
    [{ date: "2026-03-20", total: 15 }],
  );
});
