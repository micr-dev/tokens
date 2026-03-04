import type { DailyUsage } from "ccusage/data-loader";
import type { ProviderData } from "./interfaces";
import {
  getProviderInsights,
  getRecentWindowStart,
  normalizeModelName,
  type DailyTokenTotals,
} from "./utils";

interface ClaudeTokenEntry {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

function toCompactDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}${m}${d}`;
}

function getClaudeTokenTotals({
  inputTokens,
  outputTokens,
  cacheCreationTokens,
  cacheReadTokens,
}: ClaudeTokenEntry): DailyTokenTotals {
  return {
    inputTokens: inputTokens + cacheReadTokens,
    outputTokens: outputTokens + cacheCreationTokens,
    cacheTokens: cacheCreationTokens + cacheReadTokens,
    totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
  };
}

function toDailyRows(daily: DailyUsage[]) {
  return daily
    .map((entry) => ({
      date: entry.date,
      ...getClaudeTokenTotals(entry),
    }))
    .filter((row) => row.totalTokens > 0);
}

export async function loadClaudeRows(
  startDate: Date,
  endDate: Date,
  timezone: string,
): Promise<ProviderData> {
  process.env.LOG_LEVEL ??= "0";
  const { loadDailyUsageData } = await import("ccusage/data-loader");

  const usage = await loadDailyUsageData({
    since: toCompactDate(startDate),
    until: toCompactDate(endDate),
    timezone,
    mode: "display",
    offline: true,
  });

  const daily = toDailyRows(usage).filter((row) => {
    const rowDate = new Date(row.date);
    return rowDate >= startDate && rowDate <= endDate;
  });
  const recentStart = getRecentWindowStart(endDate, 30);
  const modelTotals = new Map<string, number>();
  const recentModelTotals = new Map<string, number>();

  for (const day of usage) {
    const dayDate = new Date(day.date);
    if (dayDate < startDate || dayDate > endDate) {
      continue;
    }

    for (const model of day.modelBreakdowns) {
      const tokens = getClaudeTokenTotals(model).totalTokens;
      
      if (tokens <= 0) {
        continue;
      }

      const modelName = normalizeModelName(model.modelName);
      modelTotals.set(modelName, (modelTotals.get(modelName) ?? 0) + tokens);
      if (dayDate >= recentStart) {
        recentModelTotals.set(modelName, (recentModelTotals.get(modelName) ?? 0) + tokens);
      }
    }
  }

  return {
    daily,
    insights: getProviderInsights(modelTotals, recentModelTotals),
  };
}
