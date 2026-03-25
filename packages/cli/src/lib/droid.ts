import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { UsageSummary } from "../interfaces";
import {
  type DailyTotalsByDate,
  type ModelTokenTotals,
  addDailyTokenTotals,
  addModelTokenTotals,
  createUsageSummary,
  getRecentWindowStart,
  listFilesRecursive,
  normalizeModelName,
} from "./utils";

interface DroidTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  thinkingTokens?: number;
}

interface DroidSettings {
  model?: string;
  providerLockTimestamp?: string;
  tokenUsage?: DroidTokenUsage;
}

function getDroidHomeDir() {
  return resolve(homedir(), ".factory");
}

function getDroidTimestamp(settings: DroidSettings) {
  const rawTimestamp = settings.providerLockTimestamp;

  if (!rawTimestamp?.trim()) {
    return null;
  }

  const timestamp = new Date(rawTimestamp);

  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function toPositiveInteger(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.round(value) : 0;
}

export async function loadDroidRows(
  start: Date,
  end: Date,
): Promise<UsageSummary> {
  const sessionsRoot = join(getDroidHomeDir(), "sessions");
  const totals: DailyTotalsByDate = new Map();
  const modelTotals = new Map<string, ModelTokenTotals>();
  const recentModelTotals = new Map<string, ModelTokenTotals>();

  if (!existsSync(sessionsRoot)) {
    return createUsageSummary(
      "droid",
      totals,
      modelTotals,
      recentModelTotals,
      end,
    );
  }

  const files = await listFilesRecursive(sessionsRoot, ".settings.json");
  const recentStart = getRecentWindowStart(end, 30);

  for (const file of files) {
    let settings: DroidSettings;

    try {
      settings = JSON.parse(readFileSync(file, "utf8")) as DroidSettings;
    } catch {
      continue;
    }

    const timestamp = getDroidTimestamp(settings);

    if (!timestamp || timestamp < start || timestamp > end) {
      continue;
    }

    const usage = settings.tokenUsage;

    if (!usage) {
      continue;
    }

    const cacheRead = toPositiveInteger(usage.cacheReadTokens);
    const cacheCreation = toPositiveInteger(usage.cacheCreationTokens);
    const input = toPositiveInteger(usage.inputTokens) + cacheRead;
    const output =
      toPositiveInteger(usage.outputTokens) +
      cacheCreation +
      toPositiveInteger(usage.thinkingTokens);
    const total = input + output;

    if (total <= 0) {
      continue;
    }

    const normalizedModelName = settings.model?.trim()
      ? normalizeModelName(settings.model)
      : undefined;
    const tokenTotals = {
      input,
      output,
      cache: { input: cacheRead, output: cacheCreation },
      total,
    };

    addDailyTokenTotals(
      totals,
      timestamp,
      tokenTotals,
      normalizedModelName,
    );

    if (!normalizedModelName) {
      continue;
    }

    addModelTokenTotals(modelTotals, normalizedModelName, tokenTotals);

    if (timestamp >= recentStart) {
      addModelTokenTotals(
        recentModelTotals,
        normalizedModelName,
        tokenTotals,
      );
    }
  }

  return createUsageSummary(
    "droid",
    totals,
    modelTotals,
    recentModelTotals,
    end,
  );
}
