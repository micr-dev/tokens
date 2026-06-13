import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import {
  loadAntigravityRows,
  parseAntigravityGenerationMetadata,
} from "../src/lib/antigravity";

function createTempWorkspace(label: string) {
  return mkdtempSync(join(tmpdir(), `slopmeter-${label}-`));
}

function varint(value: number | bigint) {
  let remaining = BigInt(value);
  const bytes: number[] = [];

  do {
    let byte = Number(remaining & 0x7fn);

    remaining >>= 7n;

    if (remaining > 0n) {
      byte |= 0x80;
    }

    bytes.push(byte);
  } while (remaining > 0n);

  return Buffer.from(bytes);
}

function fieldVarint(fieldNumber: number, value: number | bigint) {
  return Buffer.concat([varint((fieldNumber << 3) | 0), varint(value)]);
}

function fieldString(fieldNumber: number, value: string) {
  const encoded = Buffer.from(value, "utf8");

  return Buffer.concat([
    varint((fieldNumber << 3) | 2),
    varint(encoded.length),
    encoded,
  ]);
}

function fieldMessage(fieldNumber: number, fields: Buffer[]) {
  const encoded = Buffer.concat(fields);

  return Buffer.concat([
    varint((fieldNumber << 3) | 2),
    varint(encoded.length),
    encoded,
  ]);
}

function createAntigravityGenerationMetadata({
  seconds,
  nanos = 0,
  input,
  output,
  cacheRead,
  model,
}: {
  seconds: number;
  nanos?: number;
  input: number;
  output: number;
  cacheRead: number;
  model: string;
}) {
  return fieldMessage(1, [
    fieldMessage(4, [
      fieldVarint(1, 1132),
      fieldVarint(2, input),
      fieldVarint(3, output),
      fieldVarint(5, cacheRead),
      fieldVarint(6, 24),
      fieldVarint(9, output),
    ]),
    fieldMessage(9, [
      fieldMessage(4, [fieldVarint(1, seconds), fieldVarint(2, nanos)]),
    ]),
    fieldString(19, model),
  ]);
}

function createAntigravityDatabase(databasePath: string, blobs: Buffer[]) {
  const database = new Database(databasePath);

  try {
    database.exec(`
      CREATE TABLE gen_metadata (
        idx integer PRIMARY KEY,
        data blob,
        size integer NOT NULL DEFAULT 0
      );
    `);

    const insert = database.prepare(
      "INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)",
    );

    blobs.forEach((blob, index) => {
      insert.run(index, blob, blob.length);
    });
  } finally {
    database.close();
  }
}

test("parseAntigravityGenerationMetadata reads protobuf token usage", () => {
  const metadata = createAntigravityGenerationMetadata({
    seconds: 1_779_924_000,
    input: 4_030,
    output: 113,
    cacheRead: 24_471,
    model: "gemini-3-flash-a",
  });
  const usage = parseAntigravityGenerationMetadata(metadata);

  assert.deepEqual(usage && {
    date: usage.timestamp?.toISOString(),
    modelName: usage.modelName,
    tokens: usage.tokens,
  }, {
    date: "2026-05-27T23:20:00.000Z",
    modelName: "gemini-3-flash-a",
    tokens: {
      input: 28_501,
      output: 113,
      cache: { input: 24_471, output: 0 },
      total: 28_614,
    },
  });
});

test("loadAntigravityRows aggregates conversation databases", async (t) => {
  const workspace = createTempWorkspace("antigravity");
  const originalAntigravityHome = process.env.ANTIGRAVITY_HOME;
  const conversationsDir = join(workspace, "conversations");
  const databasePath = join(conversationsDir, "conversation.db");

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });

    if (originalAntigravityHome === undefined) {
      delete process.env.ANTIGRAVITY_HOME;
    } else {
      process.env.ANTIGRAVITY_HOME = originalAntigravityHome;
    }
  });

  process.env.ANTIGRAVITY_HOME = workspace;
  mkdirSync(conversationsDir, { recursive: true });
  createAntigravityDatabase(databasePath, [
    createAntigravityGenerationMetadata({
      seconds: 1_779_924_000,
      input: 4_030,
      output: 113,
      cacheRead: 24_471,
      model: "gemini-3-flash-a",
    }),
    createAntigravityGenerationMetadata({
      seconds: 1_780_010_400,
      input: 1_000,
      output: 50,
      cacheRead: 0,
      model: "gemini-3-flash-a",
    }),
    createAntigravityGenerationMetadata({
      seconds: 1_778_371_200,
      input: 999,
      output: 1,
      cacheRead: 0,
      model: "gemini-old",
    }),
  ]);

  const summary = await loadAntigravityRows(
    new Date("2026-05-27T00:00:00.000Z"),
    new Date("2026-05-29T23:59:59.999Z"),
  );

  assert.equal(summary.provider, "agy");
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
        date: "2026-05-27",
        input: 28_501,
        output: 113,
        cache: { input: 24_471, output: 0 },
        total: 28_614,
        models: [["gemini-3-flash-a", 28_614]],
      },
      {
        date: "2026-05-28",
        input: 1_000,
        output: 50,
        cache: { input: 0, output: 0 },
        total: 1_050,
        models: [["gemini-3-flash-a", 1_050]],
      },
    ],
  );
  assert.equal(summary.insights?.mostUsedModel?.name, "gemini-3-flash-a");
});
