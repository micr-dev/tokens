import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { loadPiRows } from "../src/lib/pi";
import { formatLocalDate } from "../src/lib/utils";

function createTempWorkspace(label: string) {
  return mkdtempSync(join(tmpdir(), `slopmeter-${label}-`));
}

function ensureParent(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function writeJsonlFile(path: string, records: string[]) {
  ensureParent(path);
  writeFileSync(path, `${records.join("\n")}\n`, "utf8");
}

function piAssistantMessage(options: {
  timestamp: string;
  model: string;
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}) {
  const {
    timestamp,
    model,
    input,
    output,
    cacheRead = 0,
    cacheWrite = 0,
  } = options;

  return JSON.stringify({
    type: "message",
    timestamp,
    message: {
      role: "assistant",
      model,
      usage: {
        input,
        output,
        cacheRead,
        cacheWrite,
        totalTokens: input + output + cacheRead + cacheWrite,
      },
      timestamp: Date.parse(timestamp),
    },
  });
}

test("loadPiRows merges Pi and GSD session logs into the pi provider", async (t) => {
  const workspace = createTempWorkspace("pi-gsd");
  const originalPiHome = process.env.PI_CODING_AGENT_DIR;
  const originalGsdHome = process.env.GSD_HOME;

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });

    if (originalPiHome === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = originalPiHome;
    }

    if (originalGsdHome === undefined) {
      delete process.env.GSD_HOME;
    } else {
      process.env.GSD_HOME = originalGsdHome;
    }
  });

  const piHome = join(workspace, "pi");
  const gsdHome = join(workspace, "gsd");
  const firstDay = "2026-03-14T10:00:00.000Z";
  const secondDay = "2026-03-15T10:00:00.000Z";

  writeJsonlFile(join(piHome, "sessions", "pi.jsonl"), [
    piAssistantMessage({
      timestamp: firstDay,
      model: "gpt-5.4",
      input: 10,
      output: 5,
      cacheRead: 2,
    }),
  ]);
  writeJsonlFile(join(gsdHome, "sessions", "gsd.jsonl"), [
    piAssistantMessage({
      timestamp: secondDay,
      model: "kimi-k2.5",
      input: 4,
      output: 6,
      cacheWrite: 1,
    }),
  ]);

  process.env.PI_CODING_AGENT_DIR = piHome;
  process.env.GSD_HOME = gsdHome;

  const summary = await loadPiRows(
    new Date("2026-03-13T00:00:00.000Z"),
    new Date("2026-03-15T23:59:59.999Z"),
  );

  assert.equal(summary.provider, "pi");
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
        output: 5,
        cache: { input: 2, output: 0 },
        total: 17,
        model: "gpt-5.4",
      },
      {
        date: "2026-03-15",
        input: 4,
        output: 7,
        cache: { input: 0, output: 1 },
        total: 11,
        model: "kimi-k2.5",
      },
    ],
  );
});
