import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadHermesRows } from "../src/lib/hermes";
import { formatLocalDate } from "../src/lib/utils";

const skipSqliteBackedTest = Boolean(process.versions.bun);
const sqliteBackedTest = skipSqliteBackedTest ? test.skip : test;

function createTempWorkspace(label: string) {
  return mkdtempSync(join(tmpdir(), `slopmeter-${label}-`));
}

function epochSeconds(iso: string) {
  return Date.parse(iso) / 1000;
}

async function createHermesDb(path: string) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(path);

  try {
    database.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        model TEXT,
        started_at REAL NOT NULL,
        ended_at REAL,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0
      );

      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        timestamp REAL NOT NULL,
        token_count INTEGER
      );
    `);

    const insertSession = database.prepare(`
      INSERT INTO sessions (id, source, model, started_at, ended_at, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMessage = database.prepare(`
      INSERT INTO messages (session_id, role, timestamp, token_count)
      VALUES (?, ?, ?, ?)
    `);

    insertSession.run(
      "s-1",
      "cli",
      "hermes-2-20250301",
      epochSeconds("2026-03-13T08:00:00.000Z"),
      epochSeconds("2026-03-15T12:00:00.000Z"),
      40,
      20,
    );
    insertMessage.run("s-1", "assistant", epochSeconds("2026-03-14T10:00:00.000Z"), 5);
    insertMessage.run("s-1", "assistant", epochSeconds("2026-03-15T10:00:00.000Z"), 15);

    insertSession.run(
      "s-2",
      "cli",
      "fallback-model-20250101",
      epochSeconds("2026-03-15T14:00:00.000Z"),
      epochSeconds("2026-03-15T14:30:00.000Z"),
      3,
      7,
    );
  } finally {
    database.close();
  }
}

sqliteBackedTest(
  "loadHermesRows distributes session input across assistant messages and falls back when needed",
  async (t) => {
  const workspace = createTempWorkspace("hermes");
  const originalHermesHome = process.env.HERMES_HOME;

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });

    if (originalHermesHome === undefined) {
      delete process.env.HERMES_HOME;
    } else {
      process.env.HERMES_HOME = originalHermesHome;
    }
  });

  await createHermesDb(join(workspace, "state.db"));
  process.env.HERMES_HOME = workspace;

  const summary = await loadHermesRows(
    new Date("2026-03-14T00:00:00.000Z"),
    new Date("2026-03-15T23:59:59.999Z"),
  );

  assert.equal(summary.provider, "hermes");
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
        input: 10,
        output: 5,
        total: 15,
        model: "hermes-2",
      },
      {
        date: "2026-03-15",
        input: 33,
        output: 22,
        total: 55,
        model: "hermes-2",
      },
    ],
  );
  assert.equal(summary.insights?.mostUsedModel?.name, "hermes-2");
  },
);
