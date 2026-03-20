import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
  readJsonDocument,
} from "./utils";

const GEMINI_HOME_ENV = "GEMINI_HOME";

interface GeminiSessionTokens {
  input?: number;
  output?: number;
  cached?: number;
  total?: number;
}

interface GeminiSessionMessage {
  timestamp?: string;
  type?: string;
  tokens?: GeminiSessionTokens | null;
  model?: string;
}

interface GeminiSessionRecord {
  messages?: GeminiSessionMessage[];
}

function getGeminiBaseDir() {
  const configuredHome = process.env[GEMINI_HOME_ENV]?.trim();

  if (configuredHome) {
    return resolve(configuredHome);
  }

  return join(homedir(), ".gemini");
}

async function getGeminiSessionFiles() {
  const chatsRoot = join(getGeminiBaseDir(), "tmp");

  if (!existsSync(chatsRoot)) {
    return [];
  }

  const files = await listFilesRecursive(chatsRoot, ".json");

  return files.filter((file) => {
    const normalizedPath = file.replaceAll("\\", "/");

    return /\/chats\/session-[^/]+\.json$/.test(normalizedPath);
  });
}

function parseTimestamp(value?: string) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function createGeminiTokenTotals(tokens: GeminiSessionTokens) {
  const input = Math.max(0, Math.round(tokens.input ?? 0));
  const cacheInput = Math.max(0, Math.round(tokens.cached ?? 0));
  const candidateOutput = Math.max(0, Math.round(tokens.output ?? 0));
  const recordedTotal = Math.max(0, Math.round(tokens.total ?? 0));
  const total = Math.max(recordedTotal, input + candidateOutput);

  // Gemini records cached prompt tokens separately, while total token count can
  // include generation-side tokens beyond visible candidates (for example,
  // thinking/tool-use tokens). Keep total authoritative and map the remainder
  // into output so the rendered totals stay accurate.
  return {
    input,
    output: Math.max(total - input, 0),
    cache: { input: Math.min(cacheInput, input), output: 0 },
    total,
  } satisfies DailyTokenTotals;
}

function addGeminiTokenTotals(
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

function addGeminiSession(
  session: GeminiSessionRecord,
  start: Date,
  end: Date,
  recentStart: Date,
  totals: DailyTotalsByDate,
  modelTotals: Map<string, ModelTokenTotals>,
  recentModelTotals: Map<string, ModelTokenTotals>,
) {
  for (const message of session.messages ?? []) {
    if (message.type !== "gemini" || !message.tokens) {
      continue;
    }

    const timestamp = parseTimestamp(message.timestamp);

    if (!timestamp || timestamp < start || timestamp > end) {
      continue;
    }

    const tokenTotals = createGeminiTokenTotals(message.tokens);

    if (tokenTotals.total <= 0) {
      continue;
    }

    const normalizedModelName = message.model?.trim()
      ? normalizeModelName(message.model.trim())
      : undefined;

    addGeminiTokenTotals(
      totals,
      modelTotals,
      recentModelTotals,
      recentStart,
      timestamp,
      tokenTotals,
      normalizedModelName,
    );
  }
}

export async function loadGeminiRows(
  start: Date,
  end: Date,
): Promise<UsageSummary> {
  const files = await getGeminiSessionFiles();
  const totals: DailyTotalsByDate = new Map();
  const modelTotals = new Map<string, ModelTokenTotals>();
  const recentModelTotals = new Map<string, ModelTokenTotals>();
  const recentStart = getRecentWindowStart(end, 30);

  for (const file of files) {
    const session = await readJsonDocument<GeminiSessionRecord>(file);

    addGeminiSession(
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
    "gemini",
    totals,
    modelTotals,
    recentModelTotals,
    end,
  );
}
