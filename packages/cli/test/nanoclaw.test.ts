import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { loadNanoClawRows } from "../src/lib/nanoclaw";

function writeSessionFile(
  filePath: string,
  sessionId: string,
  input: number,
  output: number,
) {
  mkdirSync(dirname(filePath), { recursive: true });
  const timestamp = "2026-10-10T10:00:00.000Z";
  const records = [
    { type: "session_meta", timestamp, payload: { session_id: sessionId } },
    { type: "turn_context", timestamp, payload: { model: "gpt-5-codex" } },
    {
      type: "event_msg",
      timestamp,
      payload: {
        type: "token_count",
        info: {
          model: "gpt-5-codex",
          total_token_usage: {
            input_tokens: input,
            cached_input_tokens: 0,
            output_tokens: output,
            total_tokens: input + output,
          },
        },
      },
    },
  ];

  writeFileSync(
    filePath,
    records.map((record) => JSON.stringify(record)).join("\n"),
  );
}

test("loads NanoClaw group Codex sessions separately and ignores other JSONL files", async (t) => {
  const dataDirectory = mkdtempSync(join(tmpdir(), "slopmeter-nanoclaw-"));
  t.after(() => rmSync(dataDirectory, { recursive: true, force: true }));

  const sessionsDirectory = join(dataDirectory, "v2-sessions");
  writeSessionFile(
    join(sessionsDirectory, "group-a", ".codex-shared", "sessions", "a.jsonl"),
    "shared-session",
    100,
    20,
  );
  writeSessionFile(
    join(
      sessionsDirectory,
      "group-b",
      ".codex-shared",
      "sessions",
      "copy.jsonl",
    ),
    "shared-session",
    100,
    20,
  );
  writeSessionFile(
    join(sessionsDirectory, "group-b", ".codex-shared", "sessions", "b.jsonl"),
    "unique-session",
    200,
    50,
  );
  writeSessionFile(
    join(
      sessionsDirectory,
      "group-b",
      ".claude-shared",
      "sessions",
      "ignored.jsonl",
    ),
    "unrelated-session",
    900,
    90,
  );

  const summary = await loadNanoClawRows(
    new Date("2026-10-10T00:00:00.000Z"),
    new Date("2026-10-10T23:59:59.999Z"),
    [],
    dataDirectory,
  );

  assert.equal(summary.provider, "nanoclaw");
  assert.equal(summary.daily.length, 1);
  assert.equal(summary.daily[0].input, 300);
  assert.equal(summary.daily[0].output, 70);
  assert.equal(summary.daily[0].total, 370);
});
