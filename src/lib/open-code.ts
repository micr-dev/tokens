import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  addDailyTokenTotals,
  createDailyTokenTotals,
  type DailyTokenTotals,
  formatLocalDate,
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
  const inputTokens = tokens?.input ?? 0;
  const outputTokens = tokens?.output ?? 0;
  const cacheTokens = (tokens?.cache?.read ?? 0) + (tokens?.cache?.write ?? 0);
  return createDailyTokenTotals(inputTokens, outputTokens, cacheTokens);
}

export async function loadOpenCodeRows(startDate: string, endDate: string) {
  const openCodeBaseDir = process.env.OPENCODE_DATA_DIR?.trim()
    ? resolve(process.env.OPENCODE_DATA_DIR)
    : join(homedir(), ".local", "share", "opencode");
  const messagesDir = join(openCodeBaseDir, "storage", "message");
  const files = await listFilesRecursive(messagesDir, ".json");
  const totals = new Map<string, DailyTokenTotals>();
  const dedupe = new Set<string>();
  const recentStart = getRecentWindowStart(endDate, 30);
  const modelTotals = new Map<string, number>();
  const recentModelTotals = new Map<string, number>();

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    const message = JSON.parse(content) as OpenCodeMessage;

    if (!message.providerID || !message.modelID) {
      continue;
    }

    if (dedupe.has(message.id)) {
      continue;
    }

    dedupe.add(message.id);

    const tokenTotals = sumOpenCodeTokens(message.tokens);
    const { totalTokens } = tokenTotals;

    if (totalTokens <= 0) {
      continue;
    }

    const createdAt = message.time.created ?? Date.now();
    const date = formatLocalDate(new Date(createdAt));
    if (date < startDate || date > endDate) {
      continue;
    }

    addDailyTokenTotals(totals, date, tokenTotals);
    const modelName = normalizeModelName(message.modelID);
    modelTotals.set(modelName, (modelTotals.get(modelName) ?? 0) + totalTokens);
    if (date >= recentStart) {
      recentModelTotals.set(modelName, (recentModelTotals.get(modelName) ?? 0) + totalTokens);
    }
  }

  return {
    daily: totalsToRows(totals),
    insights: getProviderInsights(modelTotals, recentModelTotals),
  };
}
