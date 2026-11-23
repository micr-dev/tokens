import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { UsageSummary } from "../interfaces";
import {
  type DailyTotalsByDate,
  type DailyTokenTotals,
  type ModelTokenTotals,
  addDailyTokenTotals,
  addModelTokenTotals,
  createUsageSummary,
  getRecentWindowStart,
  listFilesRecursive,
  normalizeModelName,
} from "./utils";
import { isSqliteLockedError, withSqliteSnapshot } from "./sqlite";

const ANTIGRAVITY_HOME_ENV = "ANTIGRAVITY_HOME";
const GEMINI_HOME_ENV = "GEMINI_HOME";
const PROTOBUF_WIRE_VARINT = 0;
const PROTOBUF_WIRE_FIXED64 = 1;
const PROTOBUF_WIRE_LENGTH_DELIMITED = 2;
const PROTOBUF_WIRE_FIXED32 = 5;
const MAX_PROTO_RECURSION_DEPTH = 12;
const MAX_TEXTUAL_CHILD_BYTES = 512;
const MIN_USAGE_TOTAL = 1;

interface AntigravityStoredUsage extends AntigravityGenerationUsage {
  index: number;
}

interface ProtoField {
  number: number;
  wireType: number;
  value?: bigint | Buffer;
  children?: ProtoField[];
}

interface ProtoMessage {
  fields: ProtoField[];
}

interface AntigravityGenerationUsage {
  timestamp: Date | null;
  modelName?: string;
  tokens: DailyTokenTotals;
}

function getAntigravityBaseDir() {
  const configuredHome = process.env[ANTIGRAVITY_HOME_ENV]?.trim();

  if (configuredHome) {
    return resolve(configuredHome);
  }

  const geminiHome = process.env[GEMINI_HOME_ENV]?.trim()
    ? resolve(process.env[GEMINI_HOME_ENV]!)
    : join(homedir(), ".gemini");

  return join(geminiHome, "antigravity-cli");
}

async function getAntigravityDatabaseFiles() {
  const roots = [join(getAntigravityBaseDir(), "conversations")];
  const accountsDir = join(
    homedir(),
    ".t3",
    "userdata",
    "providers",
    "antigravity",
  );
  if (existsSync(accountsDir)) {
    for (const account of readdirSync(accountsDir, { withFileTypes: true })) {
      if (account.isDirectory())
        roots.push(
          join(accountsDir, account.name, "antigravity-acp", "conversations"),
        );
    }
  }

  // Read newer copies first, then deduplicate response indices across copies.
  // An older copy can still contain responses missing from a newer snapshot.
  const conversations = new Map<string, string[]>();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const path of await listFilesRecursive(root, ".db")) {
      const id = basename(path);
      const copies = conversations.get(id) ?? [];
      copies.push(path);
      conversations.set(id, copies);
    }
  }
  const updatedAt = (path: string) =>
    Math.max(
      statSync(path).mtimeMs,
      existsSync(`${path}-wal`) ? statSync(`${path}-wal`).mtimeMs : 0,
    );
  return [...conversations.values()].flatMap((copies) =>
    copies.length > 1
      ? copies.sort((a, b) => updatedAt(b) - updatedAt(a))
      : copies,
  );
}

function readVarint(buffer: Buffer, offset: number) {
  let value = 0n;
  let shift = 0n;
  let cursor = offset;

  while (cursor < buffer.length) {
    const byte = buffer[cursor];

    value |= BigInt(byte & 0x7f) << shift;
    cursor += 1;

    if ((byte & 0x80) === 0) {
      return { value, nextOffset: cursor };
    }

    shift += 7n;

    if (shift > 63n) {
      return null;
    }
  }

  return null;
}

function isLikelyText(buffer: Buffer) {
  if (buffer.length === 0) {
    return false;
  }

  let printable = 0;

  for (const byte of buffer) {
    if (
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte < 127)
    ) {
      printable += 1;
    }
  }

  return printable / buffer.length > 0.85;
}

function parseProtoMessage(buffer: Buffer, depth = 0): ProtoMessage | null {
  if (depth > MAX_PROTO_RECURSION_DEPTH) {
    return null;
  }

  const fields: ProtoField[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);

    if (!tag) {
      return null;
    }

    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 0x07n);

    if (fieldNumber <= 0) {
      return null;
    }

    offset = tag.nextOffset;

    if (wireType === PROTOBUF_WIRE_VARINT) {
      const value = readVarint(buffer, offset);

      if (!value) {
        return null;
      }

      fields.push({ number: fieldNumber, wireType, value: value.value });
      offset = value.nextOffset;
      continue;
    }

    if (wireType === PROTOBUF_WIRE_LENGTH_DELIMITED) {
      const length = readVarint(buffer, offset);

      if (!length) {
        return null;
      }

      const byteLength = Number(length.value);

      if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
        return null;
      }

      offset = length.nextOffset;

      if (offset + byteLength > buffer.length) {
        return null;
      }

      const value = buffer.subarray(offset, offset + byteLength);
      const children =
        value.length <= MAX_TEXTUAL_CHILD_BYTES || !isLikelyText(value)
          ? (parseProtoMessage(value, depth + 1)?.fields ?? undefined)
          : undefined;

      fields.push({
        number: fieldNumber,
        wireType,
        value,
        children,
      });
      offset += byteLength;
      continue;
    }

    if (wireType === PROTOBUF_WIRE_FIXED32) {
      if (offset + 4 > buffer.length) {
        return null;
      }

      fields.push({
        number: fieldNumber,
        wireType,
        value: BigInt(buffer.readUInt32LE(offset)),
      });
      offset += 4;
      continue;
    }

    if (wireType === PROTOBUF_WIRE_FIXED64) {
      if (offset + 8 > buffer.length) {
        return null;
      }

      fields.push({
        number: fieldNumber,
        wireType,
        value: buffer.readBigUInt64LE(offset),
      });
      offset += 8;
      continue;
    }

    return null;
  }

  return { fields };
}

function toSafeNumber(value: bigint | Buffer | undefined) {
  if (typeof value !== "bigint" || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }

  return Number(value);
}

function numberValuesByField(fields: ProtoField[]) {
  const values = new Map<number, number[]>();

  for (const field of fields) {
    const value = toSafeNumber(field.value);

    if (value === null) {
      continue;
    }

    const current = values.get(field.number) ?? [];

    current.push(value);
    values.set(field.number, current);
  }

  return values;
}

function walkMessages(
  message: ProtoMessage,
  visit: (fields: ProtoField[]) => void,
) {
  visit(message.fields);

  for (const field of message.fields) {
    if (!field.children) {
      continue;
    }

    walkMessages({ fields: field.children }, visit);
  }
}

function findTimestamp(message: ProtoMessage) {
  const candidates: Date[] = [];

  walkMessages(message, (fields) => {
    const values = numberValuesByField(fields);
    const seconds = values.get(1)?.[0];
    const nanos = values.get(2)?.[0] ?? 0;

    if (
      seconds === undefined ||
      seconds < 1_700_000_000 ||
      seconds > 2_100_000_000 ||
      nanos < 0 ||
      nanos >= 1_000_000_000
    ) {
      return;
    }

    candidates.push(new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)));
  });

  return candidates[0] ?? null;
}

function findUsageTokens(message: ProtoMessage) {
  const candidates: DailyTokenTotals[] = [];

  walkMessages(message, (fields) => {
    const values = numberValuesByField(fields);
    const inputTokens = values.get(2)?.[0] ?? 0;
    const outputTokens = values.get(3)?.[0] ?? 0;
    const cacheReadTokens = values.get(5)?.[0] ?? 0;

    // Antigravity embeds a ModelUsageStats-like protobuf. In observed records,
    // field 2 is input tokens, field 3 is total output tokens, and field 5 is
    // cache-read input tokens. Requiring field 6 filters out nearby timestamp
    // and config messages that happen to use fields 2 and 3 for other data.
    if (
      !values.has(6) ||
      inputTokens <= 0 ||
      outputTokens < 0 ||
      cacheReadTokens < 0
    ) {
      return;
    }

    const total = inputTokens + cacheReadTokens + outputTokens;

    if (total < MIN_USAGE_TOTAL) {
      return;
    }

    candidates.push({
      input: inputTokens + cacheReadTokens,
      output: outputTokens,
      cache: { input: cacheReadTokens, output: 0 },
      total,
    });
  });

  return candidates[0] ?? null;
}

// A response step's field 9 is its usage message. Unlike the older generic
// protobuf heuristic, this structural location does not require field 6.
function findStepUsageTokens(message: ProtoMessage): DailyTokenTotals | null {
  const fields = message.fields.find((field) => field.number === 9)?.children;
  if (!fields) return null;
  const values = numberValuesByField(fields);
  const input = values.get(2)?.[0] ?? 0;
  const output = values.get(3)?.[0] ?? 0;
  const cacheRead = values.get(5)?.[0] ?? 0;
  if (input + cacheRead + output <= 0) return null;
  return {
    input: input + cacheRead,
    output,
    cache: { input: cacheRead, output: 0 },
    total: input + cacheRead + output,
  };
}

function collectText(buffer: Buffer) {
  const text = buffer.toString("utf8");
  const strings: string[] = [];
  const matches = text.match(/[ -~]{3,}/g) ?? [];

  for (const match of matches) {
    strings.push(match);
  }

  return strings;
}

function getModelName(buffer: Buffer) {
  const strings = collectText(buffer);
  const rawModel = strings.find((value) => /gemini-[a-z0-9._-]+/i.test(value));
  const match = rawModel?.match(/gemini-[a-z0-9._-]+/i)?.[0];

  if (match) {
    return normalizeModelName(match);
  }

  const displayModel = strings.find((value) =>
    /^Gemini\s+/i.test(value.trim()),
  );

  if (displayModel) {
    return normalizeModelName(displayModel.trim());
  }

  // Antigravity also serves Claude and GPT models; their generations carry the
  // model id (e.g. "claude-opus-4-6-thinking") but no Gemini string, and were
  // counted in day totals without a model.
  const otherModel = strings
    .map((value) => value.match(/^(?:claude|gpt)-[a-z0-9._-]+$/i)?.[0])
    .find((value) => value !== undefined);

  return otherModel ? normalizeModelName(otherModel) : undefined;
}

export function parseAntigravityGenerationMetadata(
  data: Buffer,
): AntigravityGenerationUsage | null {
  const message = parseProtoMessage(data);

  if (!message) {
    return null;
  }

  const tokens = findUsageTokens(message);
  const timestamp = findTimestamp(message);

  if (!tokens || !timestamp) {
    return null;
  }

  return {
    timestamp,
    modelName: getModelName(data),
    tokens,
  };
}

async function loadAntigravityGenerationsFromDatabase(
  databasePath: string,
  start: Date,
  end: Date,
) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath, { readOnly: true });

  try {
    // Model responses carry authoritative timestamps and usage in step metadata.
    // Generation metadata is indexed separately and is used only for the model name.
    // An empty database can be created before its schema is initialized.
    const tableCount = database
      .prepare(
        "SELECT count(*) AS count FROM sqlite_master WHERE type = 'table'",
      )
      .get() as { count: number };
    if (tableCount.count === 0) return [];
    const steps = database.prepare(`
      SELECT idx, metadata AS data FROM steps WHERE step_type = 15 AND metadata IS NOT NULL
      ORDER BY idx ASC
    `);
    const model = database.prepare(
      "SELECT data FROM gen_metadata WHERE idx = ?",
    );
    const usages: AntigravityStoredUsage[] = [];
    for (const { idx, data } of steps.iterate() as Iterable<{
      idx: number;
      data: Uint8Array;
    }>) {
      const message = parseProtoMessage(Buffer.from(data));
      if (!message) continue;
      const timestamp = findTimestamp(message);
      const tokens = findStepUsageTokens(message);
      if (!timestamp || timestamp < start || timestamp > end || !tokens)
        continue;
      const fields = message.fields;
      const reference = fields?.find((field) => field.number === 20)?.children;
      const generationIndex = reference
        ? (numberValuesByField(reference).get(3)?.[0] ?? 0)
        : null;
      const generation =
        generationIndex === null
          ? undefined
          : (model.get(generationIndex) as { data: Uint8Array } | undefined);
      const envelope =
        generation &&
        parseProtoMessage(
          Buffer.from(generation.data),
          MAX_PROTO_RECURSION_DEPTH,
        );
      const metadata = envelope?.fields.find(
        (field) => field.number === 1,
      )?.value;
      const modelField = Buffer.isBuffer(metadata)
        ? parseProtoMessage(metadata, MAX_PROTO_RECURSION_DEPTH)?.fields.find(
            (field) => field.number === 19,
          )?.value
        : undefined;
      usages.push({
        index: idx,
        timestamp,
        tokens,
        modelName: Buffer.isBuffer(modelField)
          ? normalizeModelName(modelField.toString("utf8"))
          : undefined,
      });
    }
    return usages;
  } finally {
    database.close();
  }
}

async function readAntigravityGenerations(
  databasePath: string,
  start: Date,
  end: Date,
) {
  try {
    return await loadAntigravityGenerationsFromDatabase(
      databasePath,
      start,
      end,
    );
  } catch (error) {
    if (!isSqliteLockedError(error)) {
      throw error;
    }

    return await withSqliteSnapshot(
      databasePath,
      "antigravity",
      async (snapshotPath) =>
        loadAntigravityGenerationsFromDatabase(snapshotPath, start, end),
    );
  }
}

function addAntigravityTokenTotals(
  totals: DailyTotalsByDate,
  modelTotals: Map<string, ModelTokenTotals>,
  recentModelTotals: Map<string, ModelTokenTotals>,
  recentStart: Date,
  timestamp: Date,
  tokenTotals: DailyTokenTotals,
  modelName?: string,
) {
  addDailyTokenTotals(totals, timestamp, tokenTotals, modelName);

  if (!modelName) {
    return;
  }

  addModelTokenTotals(modelTotals, modelName, tokenTotals);

  if (timestamp >= recentStart) {
    addModelTokenTotals(recentModelTotals, modelName, tokenTotals);
  }
}

export async function loadAntigravityRows(
  start: Date,
  end: Date,
): Promise<UsageSummary> {
  const files = await getAntigravityDatabaseFiles();
  const totals: DailyTotalsByDate = new Map();
  const modelTotals = new Map<string, ModelTokenTotals>();
  const recentModelTotals = new Map<string, ModelTokenTotals>();
  const recentStart = getRecentWindowStart(end, 30);
  const seenResponses = new Set<string>();

  for (const file of files) {
    let generations: AntigravityStoredUsage[];

    try {
      generations = await readAntigravityGenerations(file, start, end);
    } catch (error) {
      throw new Error(`Could not read Antigravity conversation ${file}`, {
        cause: error,
      });
    }

    for (const usage of generations) {
      if (!usage.timestamp) continue;
      const responseId = `${basename(file)}:${usage.index}`;
      if (seenResponses.has(responseId)) continue;
      seenResponses.add(responseId);

      addAntigravityTokenTotals(
        totals,
        modelTotals,
        recentModelTotals,
        recentStart,
        usage.timestamp,
        usage.tokens,
        usage.modelName,
      );
    }
  }

  return createUsageSummary("agy", totals, modelTotals, recentModelTotals, end);
}
