import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
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

interface AntigravityGenerationRow {
  idx: number;
  data: Buffer;
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
  const conversationsRoot = join(getAntigravityBaseDir(), "conversations");

  if (!existsSync(conversationsRoot)) {
    return [];
  }

  return await listFilesRecursive(conversationsRoot, ".db");
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
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127)) {
      printable += 1;
    }
  }

  return printable / buffer.length > 0.85;
}

function parseProtoMessage(
  buffer: Buffer,
  depth = 0,
): ProtoMessage | null {
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

  const displayModel = strings.find((value) => /^Gemini\s+/i.test(value.trim()));

  return displayModel ? normalizeModelName(displayModel.trim()) : undefined;
}

export function parseAntigravityGenerationMetadata(
  data: Buffer,
): AntigravityGenerationUsage | null {
  const message = parseProtoMessage(data);

  if (!message) {
    return null;
  }

  const tokens = findUsageTokens(message);

  if (!tokens) {
    return null;
  }

  return {
    timestamp: findTimestamp(message),
    modelName: getModelName(data),
    tokens,
  };
}

function loadAntigravityGenerationsFromDatabase(databasePath: string) {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    const query = database.prepare(`
      SELECT idx, data
      FROM gen_metadata
      ORDER BY idx ASC
    `);

    return [...query.iterate() as Iterable<AntigravityGenerationRow>];
  } finally {
    database.close();
  }
}

async function readAntigravityGenerations(databasePath: string) {
  try {
    return loadAntigravityGenerationsFromDatabase(databasePath);
  } catch (error) {
    if (!isSqliteLockedError(error)) {
      throw error;
    }

    return await withSqliteSnapshot(
      databasePath,
      "antigravity",
      async (snapshotPath) => loadAntigravityGenerationsFromDatabase(snapshotPath),
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

  for (const file of files) {
    let generations: AntigravityGenerationRow[];

    try {
      generations = await readAntigravityGenerations(file);
    } catch {
      continue;
    }

    for (const generation of generations) {
      const usage = parseAntigravityGenerationMetadata(generation.data);

      if (
        !usage?.timestamp ||
        Number.isNaN(usage.timestamp.getTime()) ||
        usage.timestamp < start ||
        usage.timestamp > end ||
        usage.tokens.total <= 0
      ) {
        continue;
      }

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

  return createUsageSummary(
    "agy",
    totals,
    modelTotals,
    recentModelTotals,
    end,
  );
}
