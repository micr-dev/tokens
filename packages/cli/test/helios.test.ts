import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadHeliosRows } from "../src/lib/helios";
import { formatLocalDate } from "../src/lib/utils";

const skipSqliteBackedTest = Boolean(process.versions.bun);
const sqliteBackedTest = skipSqliteBackedTest ? test.skip : test;

function createTempWorkspace(label: string) {
  return mkdtempSync(join(tmpdir(), `slopmeter-${label}-`));
}

function epochMillis(iso: string) {
  return Date.parse(iso);
}

async function createHeliosDb(path: string) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(path);

  try {
    database.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        model TEXT,
        timestamp INTEGER NOT NULL
      );
    `);

    const insertSession = database.prepare(`
      INSERT INTO sessions (id, provider, model, status, created_at, last_active_at, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMessage = database.prepare(`
      INSERT INTO messages (session_id, role, content, token_count, model, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertSession.run(
      "h-1",
      "openrouter",
      "session-model-20250101",
      "completed",
      epochMillis("2026-03-14T08:00:00.000Z"),
      epochMillis("2026-03-15T12:00:00.000Z"),
      90,
      30,
    );
    insertMessage.run("h-1", "assistant", "first", 10, null, epochMillis("2026-03-14T10:00:00.000Z"));
    insertMessage.run(
      "h-1",
      "assistant",
      "second",
      20,
      "message-model-20250202",
      epochMillis("2026-03-15T10:00:00.000Z"),
    );

    insertSession.run(
      "h-2",
      "anthropic",
      "fallback-model-20250101",
      "completed",
      epochMillis("2026-03-15T14:00:00.000Z"),
      epochMillis("2026-03-15T15:00:00.000Z"),
      5,
      15,
    );
  } finally {
    database.close();
  }
}

sqliteBackedTest(
  "loadHeliosRows uses per-message models and falls back to session totals",
  async (t) => {
  const workspace = createTempWorkspace("helios");
  const originalHeliosHome = process.env.HELIOS_HOME;

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });

    if (originalHeliosHome === undefined) {
      delete process.env.HELIOS_HOME;
    } else {
      process.env.HELIOS_HOME = originalHeliosHome;
    }
  });

  await createHeliosDb(join(workspace, "helios.db"));
  process.env.HELIOS_HOME = workspace;

  const summary = await loadHeliosRows(
    new Date("2026-03-14T00:00:00.000Z"),
    new Date("2026-03-15T23:59:59.999Z"),
  );

  assert.equal(summary.provider, "helios");
  assert.deepEqual(
    summary.daily.map((day) => ({
      date: formatLocalDate(day.date),
      input: day.input,
      output: day.output,
      total: day.total,
      model: day.breakdown[0]?.name,
    })),
    [
      {
        date: "2026-03-14",
        input: 30,
        output: 10,
        total: 40,
        model: "session-model",
      },
      {
        date: "2026-03-15",
        input: 65,
        output: 35,
        total: 100,
        model: "message-model",
      },
    ],
  );
  assert.equal(summary.insights?.mostUsedModel?.name, "message-model");
  },
);
