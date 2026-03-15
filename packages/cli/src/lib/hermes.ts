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
  normalizeModelName,
} from "./utils";
import { isSqliteLockedError, withSqliteSnapshot } from "./sqlite";

const HERMES_HOME_ENV = "HERMES_HOME";

interface HermesSessionRow {
  session_id: string;
  session_model: string | null;
  started_at: number | null;
  ended_at: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  message_timestamp: number | null;
  message_token_count: number | null;
}

interface HermesAssistantMessage {
  timestamp: Date | null;
  outputTokens: number;
}

interface HermesSessionAggregate {
  startedAt: Date | null;
  endedAt: Date | null;
  inputTokens: number;
  outputTokens: number;
  modelName?: string;
  messages: HermesAssistantMessage[];
}

function getHermesDbPath() {
  const home = process.env[HERMES_HOME_ENV]?.trim()
    ? resolve(process.env[HERMES_HOME_ENV]!)
    : join(homedir(), ".hermes");

  return join(home, "state.db");
}

function asNonEmptyString(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function toPositiveInteger(value: number | null | undefined) {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return 0;
  }

  return Math.round(value);
}

function parseStoredTimestamp(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 100_000_000_000 ? value : value * 1000);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);

    if (Number.isFinite(numeric)) {
      return new Date(
        numeric > 100_000_000_000 ? numeric : numeric * 1000,
      );
    }

    const parsed = new Date(trimmed);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function allocateInputs(totalInputTokens: number, weights: number[]) {
  if (totalInputTokens <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return weights.map(() => 0);
  }

  const allocations = weights.map((weight, index) => {
    const exact = (totalInputTokens * weight) / totalWeight;
    const floor = Math.floor(exact);

    return {
      index,
      floor,
      remainder: exact - floor,
    };
  });
  let remaining =
    totalInputTokens - allocations.reduce((sum, entry) => sum + entry.floor, 0);

  allocations.sort(
    (left, right) =>
      right.remainder - left.remainder || left.index - right.index,
  );

  for (let index = 0; index < allocations.length && remaining > 0; index += 1) {
    allocations[index].floor += 1;
    remaining -= 1;
  }

  return allocations
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.floor);
}

function addHermesTokenTotals(
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

function addHermesSession(
  session: HermesSessionAggregate,
  start: Date,
  end: Date,
  recentStart: Date,
  totals: DailyTotalsByDate,
  modelTotals: Map<string, ModelTokenTotals>,
  recentModelTotals: Map<string, ModelTokenTotals>,
) {
  const weightedMessages = session.messages.filter(
    (message) =>
      message.timestamp && !Number.isNaN(message.timestamp.getTime()) && message.outputTokens > 0,
  );

  if (weightedMessages.length > 0) {
    const allocations = allocateInputs(
      session.inputTokens,
      weightedMessages.map((message) => message.outputTokens),
    );

    weightedMessages.forEach((message, index) => {
      const timestamp = message.timestamp!;

      if (timestamp < start || timestamp > end) {
        return;
      }

      const inputTokens = allocations[index] ?? 0;
      const outputTokens = message.outputTokens;
      const tokenTotals = {
        input: inputTokens,
        output: outputTokens,
        cache: { input: 0, output: 0 },
        total: inputTokens + outputTokens,
      } satisfies DailyTokenTotals;

      addHermesTokenTotals(
        totals,
        modelTotals,
        recentModelTotals,
        recentStart,
        timestamp,
        tokenTotals,
        session.modelName,
      );
    });

    return;
  }

  const fallbackTimestamp = session.endedAt ?? session.startedAt;
  const total = session.inputTokens + session.outputTokens;

  if (
    !fallbackTimestamp ||
    Number.isNaN(fallbackTimestamp.getTime()) ||
    fallbackTimestamp < start ||
    fallbackTimestamp > end ||
    total <= 0
  ) {
    return;
  }

  addHermesTokenTotals(
    totals,
    modelTotals,
    recentModelTotals,
    recentStart,
    fallbackTimestamp,
    {
      input: session.inputTokens,
      output: session.outputTokens,
      cache: { input: 0, output: 0 },
      total,
    },
    session.modelName,
  );
}

function loadHermesSessionsFromDatabase(databasePath: string) {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    const query = database.prepare(`
      SELECT
        s.id AS session_id,
        s.model AS session_model,
        s.started_at AS started_at,
        s.ended_at AS ended_at,
        s.input_tokens AS input_tokens,
        s.output_tokens AS output_tokens,
        m.timestamp AS message_timestamp,
        m.token_count AS message_token_count
      FROM sessions AS s
      LEFT JOIN messages AS m
        ON m.session_id = s.id
       AND m.role = 'assistant'
      ORDER BY s.started_at ASC, m.timestamp ASC, m.id ASC
    `);
    const sessions = new Map<string, HermesSessionAggregate>();

    for (const row of query.iterate() as Iterable<HermesSessionRow>) {
      const existing = sessions.get(row.session_id);

      if (!existing) {
        sessions.set(row.session_id, {
          startedAt: parseStoredTimestamp(row.started_at),
          endedAt: parseStoredTimestamp(row.ended_at),
          inputTokens: toPositiveInteger(row.input_tokens),
          outputTokens: toPositiveInteger(row.output_tokens),
          modelName: asNonEmptyString(row.session_model)
            ? normalizeModelName(row.session_model!)
            : undefined,
          messages:
            row.message_timestamp !== null
              ? [
                  {
                    timestamp: parseStoredTimestamp(row.message_timestamp),
                    outputTokens: toPositiveInteger(row.message_token_count),
                  },
                ]
              : [],
        });

        continue;
      }

      if (row.message_timestamp !== null) {
        existing.messages.push({
          timestamp: parseStoredTimestamp(row.message_timestamp),
          outputTokens: toPositiveInteger(row.message_token_count),
        });
      }
    }

    return [...sessions.values()];
  } finally {
    database.close();
  }
}

async function readHermesSessions(databasePath: string) {
  try {
    return loadHermesSessionsFromDatabase(databasePath);
  } catch (error) {
    if (!isSqliteLockedError(error)) {
      throw error;
    }

    return await withSqliteSnapshot(databasePath, "hermes", async (snapshotPath) =>
      loadHermesSessionsFromDatabase(snapshotPath),
    );
  }
}

export async function loadHermesRows(
  start: Date,
  end: Date,
): Promise<UsageSummary> {
  const databasePath = getHermesDbPath();
  const totals: DailyTotalsByDate = new Map();
  const modelTotals = new Map<string, ModelTokenTotals>();
  const recentModelTotals = new Map<string, ModelTokenTotals>();

  if (!existsSync(databasePath)) {
    return createUsageSummary(
      "hermes",
      totals,
      modelTotals,
      recentModelTotals,
      end,
    );
  }

  const recentStart = getRecentWindowStart(end, 30);
  const sessions = await readHermesSessions(databasePath);

  for (const session of sessions) {
    addHermesSession(
      session,
      start,
      end,
      recentStart,
      totals,
      modelTotals,
      recentModelTotals,
    );
  }

  return createUsageSummary(
    "hermes",
    totals,
    modelTotals,
    recentModelTotals,
    end,
  );
}
