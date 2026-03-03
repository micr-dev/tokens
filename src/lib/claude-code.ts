import type { DailyUsage } from "ccusage/data-loader";
import type { ProviderData } from "./interfaces";
import {
  createDailyTokenTotals,
  getProviderInsights,
  getRecentWindowStart,
  normalizeModelName,
  type DailyTokenTotals,
} from "./utils";

function isoDateToCompact(value: string) {
  return value.replaceAll("-", "");
}

function getClaudeTokenTotals(entry: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}): DailyTokenTotals {
  return createDailyTokenTotals(
    entry.inputTokens,
    entry.outputTokens,
    entry.cacheCreationTokens + entry.cacheReadTokens,
  );
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
  startDate: string,
  endDate: string,
  timezone: string,
): Promise<ProviderData> {
  process.env.LOG_LEVEL ??= "0";
  const { loadDailyUsageData } = await import("ccusage/data-loader");

  const usage = await loadDailyUsageData({
    since: isoDateToCompact(startDate),
    until: isoDateToCompact(endDate),
    timezone,
    mode: "display",
    offline: true,
  });

  const daily = toDailyRows(usage).filter((row) => row.date >= startDate && row.date <= endDate);
  const recentStart = getRecentWindowStart(endDate, 30);
  const modelTotals = new Map<string, number>();
  const recentModelTotals = new Map<string, number>();

  for (const day of usage) {
    if (day.date < startDate || day.date > endDate) {
      continue;
    }

    for (const model of day.modelBreakdowns) {
      const tokens = getClaudeTokenTotals(model).totalTokens;
      if (tokens <= 0) {
        continue;
      }

      const modelName = normalizeModelName(model.modelName);
      modelTotals.set(modelName, (modelTotals.get(modelName) ?? 0) + tokens);
      if (day.date >= recentStart) {
        recentModelTotals.set(modelName, (recentModelTotals.get(modelName) ?? 0) + tokens);
      }
    }
  }

  return {
    daily,
    insights: getProviderInsights(modelTotals, recentModelTotals),
  };
}
