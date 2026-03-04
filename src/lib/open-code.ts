import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  addDailyTokenTotals,
  type DailyTokenTotals,
  getProviderInsights,
  getRecentWindowStart,
  listFilesRecursive,
  normalizeModelName,
  totalsToRows,
} from "./utils";

interface OpenCodeTokenCache {
  read?: number;
  write?: number;
}

interface OpenCodeTokens {
  input?: number;
  output?: number;
  cache?: OpenCodeTokenCache;
}

interface OpenCodeMessage {
  id: string;
  providerID?: string;
  modelID?: string;
  time: { created?: number };
  tokens?: OpenCodeTokens;
}

function sumOpenCodeTokens(tokens?: OpenCodeTokens) {
  if (!tokens) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      totalTokens: 0,
    };
  }

  const inputTokens = (tokens?.input ?? 0) + (tokens?.cache?.read ?? 0);
  const outputTokens = (tokens?.output ?? 0) + (tokens?.cache?.write ?? 0);
  const cacheTokens = (tokens?.cache?.read ?? 0) + (tokens?.cache?.write ?? 0);

  return {
    inputTokens,
    outputTokens,
    cacheTokens,
    totalTokens: inputTokens + outputTokens + cacheTokens,
  };
}

async function parseOpenCodeFile(filePath: string) {
  const content = await readFile(filePath, "utf8");

  return JSON.parse(content) as OpenCodeMessage;
}

async function parseOpenCodeFiles() {
  const baseDir = process.env.OPENCODE_DATA_DIR?.trim()
    ? resolve(process.env.OPENCODE_DATA_DIR)
    : join(homedir(), ".local", "share", "opencode");

  const messagesDir = join(baseDir, "storage", "message");

  const files = await listFilesRecursive(messagesDir, ".json");

  return Promise.all(files.map((file) => parseOpenCodeFile(file)));
}

export async function loadOpenCodeRows(start: Date, end: Date) {
  const messages = await parseOpenCodeFiles();
  const totals = new Map<string, DailyTokenTotals>();
  const dedupe = new Set<string>();
  const recentStart = getRecentWindowStart(end, 30);
  const modelTotals = new Map<string, number>();
  const recentModelTotals = new Map<string, number>();

  for (const message of messages) {
    if (!message.providerID || !message.modelID) {
      continue;
    }

    if (dedupe.has(message.id)) {
      continue;
    }

    dedupe.add(message.id);

    const tokenTotals = sumOpenCodeTokens(message.tokens);

    if (tokenTotals.totalTokens <= 0) {
      continue;
    }

    const date = new Date(message.time.created ?? Date.now());

    if (date < start || date > end) {
      continue;
    }

    addDailyTokenTotals(totals, date, tokenTotals);

    const modelName = normalizeModelName(message.modelID);

    modelTotals.set(modelName, (modelTotals.get(modelName) ?? 0) + tokenTotals.totalTokens);
    
    if (date >= recentStart) {
      recentModelTotals.set(modelName, (recentModelTotals.get(modelName) ?? 0) + tokenTotals.totalTokens);
    }
  }

  return {
    daily: totalsToRows(totals),
    insights: getProviderInsights(modelTotals, recentModelTotals),
  };
}
