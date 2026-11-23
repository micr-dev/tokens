import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
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

function createAntigravityDatabase(
  databasePath: string,
  generations: Array<{
    seconds: number;
    input: number;
    output: number;
    cacheRead: number;
    model: string;
    omitUsageFieldSix?: boolean;
  }>,
) {
  const database = new Database(databasePath);

  try {
    database.exec(`
      CREATE TABLE steps (idx integer PRIMARY KEY, step_type integer, metadata blob);
      CREATE TABLE gen_metadata (
        idx integer PRIMARY KEY,
        data blob,
        size integer NOT NULL DEFAULT 0
      );
    `);

    const insert = database.prepare(
      "INSERT INTO gen_metadata (idx, data, size) VALUES (?, ?, ?)",
    );

    generations.forEach(
      (
        { seconds, input, output, cacheRead, model, omitUsageFieldSix },
        index,
      ) => {
        const generation = fieldMessage(1, [fieldString(19, model)]);
        insert.run(index, generation, generation.length);
        const step = Buffer.concat([
          fieldMessage(1, [fieldVarint(1, seconds)]),
          fieldMessage(9, [
            fieldVarint(2, input),
            fieldVarint(3, output),
            fieldVarint(5, cacheRead),
            ...(omitUsageFieldSix ? [] : [fieldVarint(6, 24)]),
          ]),
          fieldMessage(20, [fieldVarint(3, index)]),
        ]);
        database
          .prepare("INSERT INTO steps VALUES (?, 15, ?)")
          .run(index, step);
        // Tool/error steps can repeat the preceding usage and must not be counted.
        database
          .prepare("INSERT INTO steps VALUES (?, 23, ?)")
          .run(index + 100, step);
      },
    );
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

  assert.deepEqual(
    usage && {
      date: usage.timestamp?.toISOString(),
      modelName: usage.modelName,
      tokens: usage.tokens,
    },
    {
      date: "2026-05-27T23:20:00.000Z",
      modelName: "gemini-3-flash-a",
      tokens: {
        input: 28_501,
        output: 113,
        cache: { input: 24_471, output: 0 },
        total: 28_614,
      },
    },
  );
});

test("parseAntigravityGenerationMetadata ignores timestamp-less placeholders", () => {
  const metadata = fieldMessage(1, [
    fieldMessage(4, [
      fieldVarint(2, 1),
      fieldVarint(3, 0),
      fieldVarint(5, 0),
      fieldVarint(6, 24),
    ]),
    fieldString(19, "gemini-3-flash-agent"),
  ]);

  assert.equal(parseAntigravityGenerationMetadata(metadata), null);
});

test("loadAntigravityRows aggregates conversation databases", async (t) => {
  const workspace = createTempWorkspace("antigravity");
  const originalAntigravityHome = process.env.ANTIGRAVITY_HOME;
  const originalHome = process.env.HOME;
  const conversationsDir = join(workspace, "conversations");
  const databasePath = join(conversationsDir, "conversation.db");

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;

    if (originalAntigravityHome === undefined) {
      delete process.env.ANTIGRAVITY_HOME;
    } else {
      process.env.ANTIGRAVITY_HOME = originalAntigravityHome;
    }
  });

  process.env.ANTIGRAVITY_HOME = workspace;
  process.env.HOME = workspace;
  mkdirSync(conversationsDir, { recursive: true });
  createAntigravityDatabase(databasePath, [
    {
      seconds: 1_779_924_000,
      input: 4_030,
      output: 113,
      cacheRead: 24_471,
      model: "gemini-3-flash-a",
    },
    {
      seconds: 1_780_010_400,
      input: 1_000,
      output: 50,
      cacheRead: 0,
      model: "gemini-3-flash-a",
    },
    {
      seconds: 1_778_371_200,
      input: 999,
      output: 1,
      cacheRead: 0,
      model: "gemini-old",
    },
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

test("loadAntigravityRows includes T3 ACP conversations without duplicates", async (t) => {
  const home = createTempWorkspace("antigravity-acp");
  const original = {
    home: process.env.HOME,
    agy: process.env.ANTIGRAVITY_HOME,
    gemini: process.env.GEMINI_HOME,
  };
  t.after(() => {
    for (const [key, value] of [
      ["HOME", original.home],
      ["ANTIGRAVITY_HOME", original.agy],
      ["GEMINI_HOME", original.gemini],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  });
  process.env.HOME = home;
  process.env.ANTIGRAVITY_HOME = join(home, "custom-native");
  delete process.env.GEMINI_HOME;
  const native = join(home, "custom-native", "conversations");
  const acp = join(
    home,
    ".t3",
    "userdata",
    "providers",
    "antigravity",
    "account",
    "antigravity-acp",
    "conversations",
  );
  mkdirSync(native, { recursive: true });
  mkdirSync(acp, { recursive: true });
  const entry = {
    seconds: 1_779_924_000,
    input: 100,
    output: 10,
    cacheRead: 20,
    model: "gemini-test",
  };
  createAntigravityDatabase(join(native, "shared.db"), [entry, entry]);
  createAntigravityDatabase(join(acp, "shared.db"), [entry]);
  utimesSync(join(native, "shared.db"), new Date(0), new Date(0));
  createAntigravityDatabase(join(acp, "new.db"), [
    { ...entry, omitUsageFieldSix: true },
    { ...entry, input: 0, output: 2, cacheRead: 30, omitUsageFieldSix: true },
  ]);
  const summary = await loadAntigravityRows(
    new Date("2026-05-27T00:00:00Z"),
    new Date("2026-05-29T00:00:00Z"),
  );
  assert.equal(summary.daily[0]?.total, 422);
});

test("loadAntigravityRows fails on a corrupt conversation instead of exporting partial totals", async (t) => {
  const home = createTempWorkspace("antigravity-corrupt");
  const original = process.env.ANTIGRAVITY_HOME;
  const originalHome = process.env.HOME;
  t.after(() => {
    if (original === undefined) delete process.env.ANTIGRAVITY_HOME;
    else process.env.ANTIGRAVITY_HOME = original;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
  });
  process.env.ANTIGRAVITY_HOME = home;
  process.env.HOME = home;
  const dir = join(home, "conversations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "bad.db"), "not a sqlite database");
  await assert.rejects(
    loadAntigravityRows(new Date("2026-01-01"), new Date("2027-01-01")),
    /Could not read Antigravity conversation/,
  );
});
