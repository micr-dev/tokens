import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CliDailyRow } from "./interfaces";

export function formatLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type DailyTokenTotals = Omit<CliDailyRow, "date">;

export function createDailyTokenTotals(inputTokens: number, outputTokens: number, cacheTokens: number) {
  return {
    inputTokens,
    outputTokens,
    cacheTokens,
    totalTokens: inputTokens + outputTokens + cacheTokens,
  };
}

export function addDailyTokenTotals(
  totals: Map<string, DailyTokenTotals>,
  date: string,
  tokenTotals: DailyTokenTotals,
) {
  const existing = totals.get(date);
  if (!existing) {
    totals.set(date, tokenTotals);
    return;
  }

  totals.set(date, {
    inputTokens: existing.inputTokens + tokenTotals.inputTokens,
    outputTokens: existing.outputTokens + tokenTotals.outputTokens,
    cacheTokens: existing.cacheTokens + tokenTotals.cacheTokens,
    totalTokens: existing.totalTokens + tokenTotals.totalTokens,
  });
}

export function totalsToRows(totals: Map<string, DailyTokenTotals>) {
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tokenTotals]) => ({ date, ...tokenTotals }));
}

export async function listFilesRecursive(rootDir: string, extension: string) {
  const files: string[] = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && fullPath.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

export function getRecentWindowStart(endDate: string, days = 30) {
  const end = new Date(`${endDate}T00:00:00`);
  end.setDate(end.getDate() - (days - 1));
  return formatLocalDate(end);
}

export function normalizeModelName(modelName: string) {
  return modelName.replace(/-\d{8}$/, "");
}

export function getTopModel(modelTotals: Map<string, number>) {
  let bestModel: string | undefined;
  let bestTokens = 0;

  for (const [modelName, totalTokens] of modelTotals) {
    if (totalTokens > bestTokens) {
      bestModel = modelName;
      bestTokens = totalTokens;
    }
  }

  if (!bestModel || bestTokens <= 0) {
    return undefined;
  }

  return { modelName: bestModel, totalTokens: bestTokens };
}

export function getProviderInsights(modelTotals: Map<string, number>, recentModelTotals: Map<string, number>) {
  const mostUsedModel = getTopModel(modelTotals);
  const recentMostUsedModel = getTopModel(recentModelTotals);

  if (!mostUsedModel && !recentMostUsedModel) {
    return undefined;
  }

  return { mostUsedModel, recentMostUsedModel };
}
