import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";
import { heatmapThemes, renderUsageHeatmapsSvg } from "../../cli/src/graph";
import {
  createJsonExportPayload,
  mergeJsonExportsToPublishedUsage,
  toJsonUsageSummary,
  type PublishedUsagePayload,
} from "../../cli/src/lib/export";
import { mergeUsageSummaries } from "../../cli/src/lib/utils";
import { providerIds, aggregateUsage } from "../../cli/src/providers";
import type {
  PublishedCostHarness,
  PublishedCostModel,
  PublishedCostMonthlyRow,
  PublishedCostPayload,
} from "../lib/types";
import type {
  JsonExportPayload,
  JsonUsageSummary,
  UsageSummary,
} from "../../cli/src/interfaces";
import { syncPublishedArtifactsToGitBackupRepo } from "./lib/git-backup";
import { loadT3PublishedSummary } from "./lib/t3-chat";

const DEFAULT_IMPORT_PATH = ".slopmeter-data/imports/windows-history.json";
const DEFAULT_T3_IMPORT_PATH = ".local/share/slopmeter/t3-chat-export.json";
const DEFAULT_OPENCODE_RECOVERY_IMPORT_PATH =
  ".local/share/opencode/recovery/t3-chat-export-opencode-recovered.json";
const DEFAULT_OPENCODE_DAILY_RECOVERY_IMPORT_PATH =
  ".local/share/opencode/recovery/opencode-daily-recovered.json";
const DEFAULT_COST_ANALYSIS_IMPORT_PATH = "token-usage-analysis.json";
const DEFAULT_LOCAL_OUTPUT_PATH = ".slopmeter-data/published/daily-usage.json";
const DEFAULT_LOCAL_COST_OUTPUT_PATH =
  ".slopmeter-data/published/cost-analysis.json";
const DEFAULT_LOCAL_SVG_OUTPUT_PATH =
  ".slopmeter-data/published/heatmap-last-year.svg";
const DEFAULT_LOCAL_HISTORY_DIR = ".slopmeter-data/history";
const DEFAULT_BUNDLED_MODULE_OUTPUT_PATH =
  "packages/web/lib/published-data.generated.ts";
const DEFAULT_BLOB_PATH = "slopmeter/daily-usage.json";
const DEFAULT_SVG_BLOB_PATH = "slopmeter/heatmap-last-year.svg";
const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CLAUDE_EXCLUDED_DATES = new Set(["2026-03-10", "2026-03-17"]);
const COST_COVERAGE_NOTE =
  "API-price equivalent for this token usage. Most or all of these tokens were used through subscription plans rather than metered API billing.";
const CCUSAGE_BACKED_COST_HARNESSES = [
  { id: "codex", label: "Codex" },
  { id: "droid", label: "Droid" },
  { id: "hermes", label: "Hermes Agent" },
  { id: "pi", label: "Pi Coding Agent" },
] as const;
const MODEL_ESTIMATED_COST_HARNESSES = new Set(["pi"]);
export const WEB_PROVIDER_ORDER = [
  "codex",
  "opencode",
  "agy",
  "pi",
  "droid",
  "hermes",
  "claude",
  "cursor",
  "helios",
  "t3",
] as const;

function getDateWindow() {
  const start = new Date();

  start.setHours(0, 0, 0, 0);
  start.setFullYear(start.getFullYear() - 1);

  const end = new Date();

  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function readImportedPayload(importPath: string) {
  if (!existsSync(importPath)) {
    return null;
  }

  return JSON.parse(readFileSync(importPath, "utf8")) as ReturnType<
    typeof createJsonExportPayload
  >;
}

async function readHostedPayload() {
  const dataUrl = process.env.SLOPMETER_WEB_DATA_URL?.trim();

  if (!dataUrl) {
    return null;
  }

  const response = await fetch(dataUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PublishedUsagePayload;
}

function readExistingPublishedPayload(localOutputPath: string) {
  if (!existsSync(localOutputPath)) {
    return null;
  }

  return JSON.parse(
    readFileSync(localOutputPath, "utf8"),
  ) as PublishedUsagePayload;
}

function readJsonFile(pathValue: string) {
  return JSON.parse(readFileSync(pathValue, "utf8")) as unknown;
}

function resolveRepoPath(pathValue: string) {
  return resolve(REPO_ROOT, pathValue);
}

function resolveHomePath(pathValue: string) {
  return resolve(homedir(), pathValue);
}

function readCostAnalysisPayload(importPath: string) {
  if (!existsSync(importPath)) {
    return null;
  }

  return normalizeCostAnalysisPayload(readJsonFile(importPath));
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireString(value: unknown, fieldName: string) {
  const normalized = stringOrNull(value);

  if (!normalized) {
    throw new Error(`Cost analysis is missing ${fieldName}.`);
  }

  return normalized;
}

function asRecord(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Cost analysis ${fieldName} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`Cost analysis ${fieldName} must be an array.`);
  }

  return value;
}

function normalizeCostMonthlyRow(value: unknown): PublishedCostMonthlyRow {
  const row = asRecord(value, "monthly row");

  return {
    month: requireString(row.month, "monthly row month"),
    inputTokens: numberOrZero(row.input_tokens),
    outputTokens: numberOrZero(row.output_tokens),
    cacheReadTokens: numberOrZero(row.cache_read_tokens),
    totalTokens: numberOrZero(row.total_tokens),
    activeDays: numberOrZero(row.active_days),
    costUsd: numberOrNull(row.cost_usd),
  };
}

function normalizeCostHarness(
  key: string,
  value: unknown,
): PublishedCostHarness {
  const harness = asRecord(value, `provider ${key}`);
  const totals = asRecord(harness.totals, `provider ${key} totals`);
  const dateRange =
    harness.date_range && typeof harness.date_range === "object"
      ? (harness.date_range as Record<string, unknown>)
      : {};

  return {
    id: key,
    label: stringOrNull(harness.label) ?? key,
    activeDays: numberOrZero(harness.active_days),
    firstDate: stringOrNull(dateRange.first),
    lastDate: stringOrNull(dateRange.last),
    totalCostUsd: numberOrNull(harness.total_cost_usd),
    totalTokens: numberOrZero(totals.total_tokens),
    inputTokens: numberOrZero(totals.input_tokens),
    outputTokens: numberOrZero(totals.output_tokens),
    cacheReadTokens: numberOrZero(totals.cache_read_tokens),
    monthly: asArray(harness.monthly, `provider ${key} monthly`).map(
      normalizeCostMonthlyRow,
    ),
  };
}

function normalizeCostModel(value: unknown): PublishedCostModel {
  const model = asRecord(value, "model cost summary row");

  return {
    name: requireString(model.model, "model name"),
    totalCostUsd: numberOrZero(model.cost_usd),
    totalTokens: numberOrZero(model.total_tokens),
    inputTokens: numberOrZero(model.total_input),
    outputTokens: numberOrZero(model.total_output),
    cacheReadTokens: numberOrZero(model.total_cache_read),
    monthsActive: numberOrZero(model.months_active),
  };
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getCcusageCost(value: Record<string, unknown>) {
  return (
    numberOrNull(value.totalCost) ??
    numberOrNull(value.costUSD) ??
    numberOrNull(value.costUsd) ??
    numberOrNull(value.total_cost_usd) ??
    0
  );
}

function getCcusageNumber(value: Record<string, unknown>, key: string) {
  return numberOrZero(value[key]);
}

function runCcusageJson({
  harnessId,
  command,
  since,
  until,
}: {
  harnessId: string;
  command: "daily" | "monthly";
  since: string;
  until: string;
}) {
  const result = spawnSync(
    "ccusage",
    [harnessId, command, "--json", "--offline", "--since", since, "--until", until],
    {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      `ccusage ${harnessId} ${command} failed: ${
        result.stderr.trim() || result.stdout.trim() || "unknown error"
      }`,
    );
  }

  return asRecord(JSON.parse(result.stdout) as unknown, `ccusage ${harnessId}`);
}

function rowsFromCcusagePayload(
  payload: Record<string, unknown>,
  key: "daily" | "monthly",
) {
  return asArray(payload[key], `ccusage ${key}`).map((row) =>
    asRecord(row, `ccusage ${key} row`),
  );
}

function getCcusageModelsUsed(row: Record<string, unknown>) {
  const modelsUsed = row.modelsUsed;

  if (Array.isArray(modelsUsed)) {
    return modelsUsed
      .filter((model): model is string => typeof model === "string")
      .sort((left, right) => left.localeCompare(right));
  }

  const models = row.models;

  if (models && typeof models === "object" && !Array.isArray(models)) {
    return Object.keys(models).sort((left, right) => left.localeCompare(right));
  }

  return [];
}

function activeDaysByMonth(dailyRows: Record<string, unknown>[]) {
  const counts = new Map<string, number>();

  for (const row of dailyRows) {
    const date = requireString(row.date, "ccusage daily date");
    const month = date.slice(0, 7);

    counts.set(month, (counts.get(month) ?? 0) + 1);
  }

  return counts;
}

function toCostMonthlyRow(
  row: Record<string, unknown>,
  monthlyActiveDays: Map<string, number>,
) {
  const month = requireString(row.month, "ccusage monthly month");

  return {
    month,
    input_tokens: getCcusageNumber(row, "inputTokens"),
    output_tokens: getCcusageNumber(row, "outputTokens"),
    cache_read_tokens: getCcusageNumber(row, "cacheReadTokens"),
    total_tokens: getCcusageNumber(row, "totalTokens"),
    active_days: monthlyActiveDays.get(month) ?? 0,
    models_used: getCcusageModelsUsed(row),
    cost_usd: getCcusageCost(row),
  };
}

function toSourceCostMonthlyRow(row: PublishedCostMonthlyRow) {
  return {
    month: row.month,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    cache_read_tokens: row.cacheReadTokens,
    total_tokens: row.totalTokens,
    active_days: row.activeDays ?? 0,
    cost_usd: row.costUsd,
  };
}

function buildCcusageCostHarness({
  id,
  label,
  since,
  until,
}: {
  id: string;
  label: string;
  since: string;
  until: string;
}) {
  const dailyPayload = runCcusageJson({
    harnessId: id,
    command: "daily",
    since,
    until,
  });
  const monthlyPayload = runCcusageJson({
    harnessId: id,
    command: "monthly",
    since,
    until,
  });
  const dailyRows = rowsFromCcusagePayload(dailyPayload, "daily");
  const monthlyRows = rowsFromCcusagePayload(monthlyPayload, "monthly");
  const totals = asRecord(dailyPayload.totals, `ccusage ${id} totals`);
  const dates = dailyRows
    .map((row) => requireString(row.date, "ccusage daily date"))
    .sort((left, right) => left.localeCompare(right));

  if (dates.length === 0) {
    throw new Error(`ccusage ${id} returned no daily rows.`);
  }

  const monthlyActiveDays = activeDaysByMonth(dailyRows);

  return {
    label,
    active_days: dates.length,
    date_range: {
      first: dates[0],
      last: dates[dates.length - 1],
    },
    totals: {
      input_tokens: getCcusageNumber(totals, "inputTokens"),
      output_tokens: getCcusageNumber(totals, "outputTokens"),
      cache_read_tokens: getCcusageNumber(totals, "cacheReadTokens"),
      total_tokens: getCcusageNumber(totals, "totalTokens"),
    },
    total_cost_usd: getCcusageCost(totals),
    monthly: monthlyRows.map((row) =>
      toCostMonthlyRow(row, monthlyActiveDays),
    ),
  };
}

function buildCostMonthlyTotals(
  providers: Record<string, ReturnType<typeof buildCcusageCostHarness> | unknown>,
) {
  const monthly = new Map<
    string,
    {
      month: string;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      total_tokens: number;
      active_days: number;
      cost_usd: number;
      cost_note: string;
    }
  >();

  for (const provider of Object.values(providers)) {
    const record = asRecord(provider, "cost provider");

    for (const row of asArray(record.monthly, "cost provider monthly")) {
      const monthlyRow = asRecord(row, "cost provider monthly row");
      const month = requireString(monthlyRow.month, "monthly row month");
      const current =
        monthly.get(month) ??
        {
          month,
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          total_tokens: 0,
          active_days: 0,
          cost_usd: 0,
          cost_note:
            "cost_usd includes live ccusage-backed harnesses plus preserved recovered history where available",
        };

      current.input_tokens += numberOrZero(monthlyRow.input_tokens);
      current.output_tokens += numberOrZero(monthlyRow.output_tokens);
      current.cache_read_tokens += numberOrZero(monthlyRow.cache_read_tokens);
      current.total_tokens += numberOrZero(monthlyRow.total_tokens);
      current.active_days += numberOrZero(monthlyRow.active_days);
      current.cost_usd += numberOrZero(monthlyRow.cost_usd);
      monthly.set(month, current);
    }
  }

  return [...monthly.values()].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
}

function buildCostSourceCoverage(
  harnesses: PublishedCostHarness[],
  refreshedHarnessIds: Set<string>,
  modelEstimatedHarnessIds: Set<string>,
) {
  return harnesses.map((harness) => ({
    harness: harness.id,
    source: modelEstimatedHarnessIds.has(harness.id)
      ? ("model-estimated" as const)
      : refreshedHarnessIds.has(harness.id)
        ? ("live-ccusage" as const)
        : ("preserved-import" as const),
    expectedMonths: harness.monthly.map((row) => row.month),
    generatedMonths: harness.monthly.map((row) => row.month),
    missingMonths: [],
    firstDate: harness.firstDate,
    lastDate: harness.lastDate,
  }));
}

function buildCostValidation(
  harnesses: PublishedCostHarness[],
  refreshedHarnessIds: Set<string>,
  modelEstimatedHarnessIds: Set<string>,
) {
  return harnesses.map((harness) => ({
    harness: harness.id,
    status: modelEstimatedHarnessIds.has(harness.id)
      ? ("estimated" as const)
      : refreshedHarnessIds.has(harness.id)
        ? ("ok" as const)
        : ("preserved" as const),
    computedUsd: harness.totalCostUsd,
    sourceUsd: harness.totalCostUsd,
    deltaUsd: 0,
    note: modelEstimatedHarnessIds.has(harness.id)
      ? "estimated from published model token breakdown because local ccusage does not cover all displayed harness history"
      : refreshedHarnessIds.has(harness.id)
        ? "refreshed from local ccusage during publish"
        : "preserved from imported or recovered history; local ccusage is not a completeness oracle for this harness",
  }));
}

function buildMissingModelCostWarnings(models: PublishedCostModel[]) {
  return models
    .filter((model) => model.totalTokens > 0 && model.totalCostUsd <= 0)
    .map((model) => ({
      model: model.name,
      totalTokens: model.totalTokens,
      status: "missing-cost" as const,
    }));
}

function canonicalCostModelName(value: string) {
  const normalized = value.trim().toLowerCase();
  const prefixes = [
    "cliproxyapi/",
    "google/",
    "anthropic/",
    "openai/",
    "xai/",
    "moonshot/",
    "minimax/",
    "deepseek/",
    "alibaba/",
    "nvidia/",
    "z-ai/",
    "[pi] ",
  ];

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length);
    }
  }

  return normalized;
}

function buildModelCostRates(models: PublishedCostModel[]) {
  const rates = new Map<string, number>();

  for (const model of models) {
    if (model.totalCostUsd <= 0 || model.totalTokens <= 0) {
      continue;
    }

    rates.set(
      canonicalCostModelName(model.name),
      model.totalCostUsd / model.totalTokens,
    );
  }

  return rates;
}

function buildModelEstimatedHarness({
  harness,
  usageProvider,
  modelCostRates,
}: {
  harness: PublishedCostHarness;
  usageProvider: PublishedUsagePayload["providers"][number];
  modelCostRates: Map<string, number>;
}): PublishedCostHarness | null {
  const monthly = new Map<
    string,
    {
      month: string;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      totalTokens: number;
      activeDays: number;
      costUsd: number;
    }
  >();
  let totalCostUsd = 0;

  for (const day of usageProvider.daily) {
    const month = day.date.slice(0, 7);
    const current =
      monthly.get(month) ??
      {
        month,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        activeDays: 0,
        costUsd: 0,
      };
    let dayCostUsd = 0;

    for (const model of day.breakdown) {
      const rate = modelCostRates.get(canonicalCostModelName(model.name));

      if (!rate) {
        continue;
      }

      dayCostUsd += model.tokens.total * rate;
    }

    current.inputTokens += day.input;
    current.outputTokens += day.output;
    current.cacheReadTokens += day.cache.input;
    current.totalTokens += day.total;
    current.activeDays += 1;
    current.costUsd += dayCostUsd;
    totalCostUsd += dayCostUsd;
    monthly.set(month, current);
  }

  if (usageProvider.daily.length === 0 || totalCostUsd <= 0) {
    return null;
  }

  const sortedDaily = [...usageProvider.daily].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const monthlyRows = [...monthly.values()].sort((left, right) =>
    left.month.localeCompare(right.month),
  );

  return {
    ...harness,
    activeDays: usageProvider.daily.length,
    firstDate: sortedDaily[0]?.date ?? harness.firstDate,
    lastDate: sortedDaily[sortedDaily.length - 1]?.date ?? harness.lastDate,
    totalCostUsd,
    totalTokens: monthlyRows.reduce((sum, row) => sum + row.totalTokens, 0),
    inputTokens: monthlyRows.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: monthlyRows.reduce((sum, row) => sum + row.outputTokens, 0),
    cacheReadTokens: monthlyRows.reduce(
      (sum, row) => sum + row.cacheReadTokens,
      0,
    ),
    monthly: monthlyRows,
  };
}

function refreshCostPayloadFromCcusage(
  payload: PublishedCostPayload,
  usagePayload?: PublishedUsagePayload,
) {
  const providerEntries = new Map(
    payload.harnesses.map((harness) => [harness.id, harness]),
  );
  const until = todayDateKey();
  const refreshedHarnessIds = new Set<string>();
  const modelEstimatedHarnessIds = new Set<string>();

  const currentMonth = todayDateKey().slice(0, 7);

  for (const harness of CCUSAGE_BACKED_COST_HARNESSES) {
    const current = providerEntries.get(harness.id);
    const since = current?.firstDate ?? payload.dateRange.start;
    const refreshed = buildCcusageCostHarness({
      id: harness.id,
      label: current?.label ?? harness.label,
      since,
      until,
    });

    const normalized = normalizeCostHarness(harness.id, refreshed);

    // Preserve completed months that ccusage can no longer see (e.g. session
    // files deleted from disk). For completed months (before the current
    // month), keep the pre-existing entry when its cost is higher — ccusage
    // seeing fewer sessions means the live refresh under-counts.
    if (current?.monthly?.length) {
      const refreshedMonths = new Map(
        normalized.monthly.map((m) => [m.month, m]),
      );
      const mergedMonthly = [...normalized.monthly];
      for (const prevMonth of current.monthly) {
        if (prevMonth.month >= currentMonth) continue; // never preserve current month
        const refreshedMonth = refreshedMonths.get(prevMonth.month);
        if (!refreshedMonth) {
          // Month entirely missing from ccusage — preserve from history
          mergedMonthly.push(prevMonth);
        } else if (
          (prevMonth.costUsd ?? 0) > (refreshedMonth.costUsd ?? 0)
        ) {
          // ccusage under-counted this month — use the higher preserved value
          const idx = mergedMonthly.findIndex(
            (m) => m.month === prevMonth.month,
          );
          mergedMonthly[idx] = prevMonth;
        }
      }
      mergedMonthly.sort((a, b) => a.month.localeCompare(b.month));
      normalized.monthly = mergedMonthly;
      normalized.activeDays = mergedMonthly.reduce(
        (sum, m) => sum + (m.activeDays ?? 0),
        0,
      );
      normalized.totalCostUsd = mergedMonthly.reduce(
        (sum, m) => sum + (m.costUsd ?? 0),
        0,
      );
      normalized.totalTokens = mergedMonthly.reduce(
        (sum, m) => sum + m.totalTokens,
        0,
      );
      normalized.inputTokens = mergedMonthly.reduce(
        (sum, m) => sum + m.inputTokens,
        0,
      );
      normalized.outputTokens = mergedMonthly.reduce(
        (sum, m) => sum + m.outputTokens,
        0,
      );
      normalized.cacheReadTokens = mergedMonthly.reduce(
        (sum, m) => sum + m.cacheReadTokens,
        0,
      );
    }

    providerEntries.set(harness.id, normalized);
    refreshedHarnessIds.add(harness.id);
  }

  if (usagePayload) {
    const modelCostRates = buildModelCostRates(payload.models);

    for (const harnessId of MODEL_ESTIMATED_COST_HARNESSES) {
      const harness = providerEntries.get(harnessId);
      const usageProvider = usagePayload.providers.find(
        (provider) => provider.provider === harnessId,
      );

      if (!harness || !usageProvider) {
        continue;
      }

      const estimated = buildModelEstimatedHarness({
        harness,
        usageProvider,
        modelCostRates,
      });

      if (!estimated || estimated.totalCostUsd === null) {
        continue;
      }

      if (estimated.totalCostUsd <= (harness.totalCostUsd ?? 0)) {
        continue;
      }

      providerEntries.set(harnessId, estimated);
      refreshedHarnessIds.delete(harnessId);
      modelEstimatedHarnessIds.add(harnessId);
    }
  }

  const harnesses = payload.harnesses.map((harness) =>
    providerEntries.get(harness.id) ?? harness,
  );
  const firstDate =
    harnesses
      .flatMap((harness) => (harness.firstDate ? [harness.firstDate] : []))
      .sort((left, right) => left.localeCompare(right))[0] ??
    payload.dateRange.start;
  const lastDate =
    harnesses
      .flatMap((harness) => (harness.lastDate ? [harness.lastDate] : []))
      .sort((left, right) => right.localeCompare(left))[0] ??
    payload.dateRange.end;
  const harnessTotalCostUsd = harnesses.reduce(
    (sum, harness) => sum + (harness.totalCostUsd ?? 0),
    0,
  );
  const providerSourceRows = Object.fromEntries(
    harnesses.map((harness) => [
      harness.id,
      {
        label: harness.label,
        active_days: harness.activeDays,
        date_range: {
          first: harness.firstDate,
          last: harness.lastDate,
        },
        totals: {
          input_tokens: harness.inputTokens,
          output_tokens: harness.outputTokens,
          cache_read_tokens: harness.cacheReadTokens,
          total_tokens: harness.totalTokens,
        },
        total_cost_usd: harness.totalCostUsd,
        monthly: harness.monthly.map(toSourceCostMonthlyRow),
      },
    ]),
  );

  return {
    ...payload,
    generatedAt: new Date().toISOString(),
    source:
      "tokens.micr.dev recovered history + live ccusage-backed harness refresh (offline pricing)",
    dateRange: {
      start: firstDate,
      end: lastDate,
    },
    grandTotalTokens: harnesses.reduce(
      (sum, harness) => sum + harness.totalTokens,
      0,
    ),
    harnessTotalCostUsd: Math.round(harnessTotalCostUsd * 100) / 100,
    modelTotalCostUsd: Math.round(harnessTotalCostUsd * 100) / 100,
    harnesses,
    monthlyTotals: buildCostMonthlyTotals(providerSourceRows).map(
      normalizeCostMonthlyRow,
    ),
    sourceCoverage: buildCostSourceCoverage(
      harnesses,
      refreshedHarnessIds,
      modelEstimatedHarnessIds,
    ),
    validation: buildCostValidation(
      harnesses,
      refreshedHarnessIds,
      modelEstimatedHarnessIds,
    ),
    modelWarnings: buildMissingModelCostWarnings(payload.models),
  };
}

export function normalizeCostAnalysisPayload(
  value: unknown,
): PublishedCostPayload {
  const payload = asRecord(value, "payload");
  const dateRange = asRecord(payload.date_range, "date_range");
  const providers = asRecord(payload.providers, "providers");
  const modelCostSummary = asArray(
    payload.model_cost_summary ?? payload.model_summary,
    "model_cost_summary",
  );
  const harnesses = Object.entries(providers).map(([key, provider]) =>
    normalizeCostHarness(key, provider),
  );
  const models = modelCostSummary.map(normalizeCostModel);
  // The imported model summary is a rate source and diagnostic input. The
  // published model subtotal must stay tied to canonical harness spend.
  const harnessTotalCostUsd = numberOrZero(payload.grand_total_cost_usd);

  return {
    version: "2026-06-19",
    generatedAt: requireString(payload.generated_at, "generated_at"),
    source: requireString(payload.source, "source"),
    dateRange: {
      start: requireString(dateRange.start, "date_range.start"),
      end: requireString(dateRange.end, "date_range.end"),
    },
    grandTotalTokens: numberOrZero(payload.grand_total_tokens),
    harnessTotalCostUsd,
    modelTotalCostUsd: Math.round(harnessTotalCostUsd * 100) / 100,
    coverageNote: COST_COVERAGE_NOTE,
    harnesses,
    models,
    monthlyTotals: asArray(payload.monthly_totals, "monthly_totals").map(
      normalizeCostMonthlyRow,
    ),
  };
}

export function writePublishedCostArtifact({
  sourcePath,
  outputPath,
  usagePayload,
}: {
  sourcePath: string;
  outputPath: string;
  usagePayload?: PublishedUsagePayload;
}) {
  const payload = readCostAnalysisPayload(sourcePath);

  if (!payload) {
    throw new Error(`Cost analysis source not found: ${sourcePath}`);
  }
  const refreshedPayload = refreshCostPayloadFromCcusage(payload, usagePayload);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify(refreshedPayload, null, 2)}\n`,
    "utf8",
  );

  return refreshedPayload;
}

function formatBackupTimestamp(value: Date) {
  return value.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

export function buildPublishedBackupPaths(historyDir: string, updatedAt: Date) {
  const snapshotDir = resolve(historyDir, formatBackupTimestamp(updatedAt));

  return {
    snapshotDir,
    jsonPath: resolve(snapshotDir, "daily-usage.json"),
    svgPath: resolve(snapshotDir, "heatmap-last-year.svg"),
  };
}

export function writePublishedBackupArtifacts({
  historyDir,
  payload,
  svg,
  updatedAt,
}: {
  historyDir: string;
  payload: PublishedUsagePayload;
  svg: string;
  updatedAt: Date;
}) {
  const paths = buildPublishedBackupPaths(historyDir, updatedAt);

  mkdirSync(paths.snapshotDir, { recursive: true });
  writeFileSync(
    paths.jsonPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(paths.svgPath, svg, "utf8");

  return paths;
}

// Keep the published dataset in the web bundle so production serves the recovered snapshot directly.
export function buildBundledPublishedDataModule(
  payload: PublishedUsagePayload,
  svg: string,
  costPayload: PublishedCostPayload | null = null,
) {
  return [
    'import type { PublishedCostPayload, PublishedUsagePayload } from "./types";',
    "",
    "export const publishedUsagePayload: PublishedUsagePayload = " +
      JSON.stringify(payload, null, 2) +
      ";",
    "",
    "export const publishedCostPayload: PublishedCostPayload | null = " +
      JSON.stringify(costPayload, null, 2) +
      ";",
    "",
    "export const publishedSvgMarkup = " + JSON.stringify(svg) + ";",
    "",
  ].join("\n");
}

export function writeBundledPublishedArtifacts({
  modulePath,
  payload,
  svg,
  costPayload = null,
}: {
  modulePath: string;
  payload: PublishedUsagePayload;
  svg: string;
  costPayload?: PublishedCostPayload | null;
}) {
  mkdirSync(dirname(modulePath), { recursive: true });
  writeFileSync(
    modulePath,
    buildBundledPublishedDataModule(payload, svg, costPayload),
    "utf8",
  );
}

function collectProviderDateKeys(payloads: JsonExportPayload[]) {
  const keys = new Set<string>();

  for (const payload of payloads) {
    for (const provider of payload.providers) {
      for (const row of provider.daily) {
        keys.add(`${provider.provider}:${row.date}`);
      }
    }
  }

  return keys;
}

function filterPayloadByProviderDateKeys(
  payload: JsonExportPayload,
  excludedProviderDates: Set<string>,
): JsonExportPayload | null {
  const providers: JsonExportPayload["providers"] = [];

  for (const provider of payload.providers) {
    const daily = provider.daily.filter(
      (row) => !excludedProviderDates.has(`${provider.provider}:${row.date}`),
    );

    if (daily.length === 0) {
      continue;
    }

    providers.push({
      ...provider,
      daily,
    });
  }

  if (providers.length === 0) {
    return null;
  }

  return {
    ...payload,
    providers,
  };
}

function filterImportableProviders(
  payload: JsonExportPayload,
): JsonExportPayload {
  return {
    ...payload,
    providers: payload.providers.filter(
      (provider) => provider.provider !== "all" && provider.provider !== "t3",
    ),
  };
}

function buildCanonicalPayloadInputs({
  currentPayload,
  importedPayload,
  opencodeDailyRecoveryPayload,
  hostedPayload,
}: {
  currentPayload: JsonExportPayload;
  importedPayload: JsonExportPayload | null;
  opencodeDailyRecoveryPayload: JsonExportPayload | null;
  hostedPayload: PublishedUsagePayload | null;
}) {
  const freshPayloads = [
    opencodeDailyRecoveryPayload,
    importedPayload,
    currentPayload,
  ]
    .filter((payload): payload is JsonExportPayload => payload !== null)
    .map((payload) => filterImportableProviders(payload));
  const freshProviderDates = collectProviderDateKeys(freshPayloads);
  const filteredHostedPayload = hostedPayload
    ? filterPayloadByProviderDateKeys(
        filterImportableProviders(toJsonExportPayload(hostedPayload)),
        freshProviderDates,
      )
    : null;

  return [filteredHostedPayload, ...freshPayloads].filter(
    (payload): payload is JsonExportPayload => payload !== null,
  );
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00`);
}

function toUsageSummary(
  provider: PublishedUsagePayload["providers"][number],
): UsageSummary {
  return {
    provider: provider.provider,
    insights: provider.insights,
    daily: provider.daily.map((row) => ({
      date: parseDateOnly(row.date),
      input: row.input,
      output: row.output,
      cache: row.cache,
      total: row.total,
      displayValue: row.displayValue,
      breakdown: row.breakdown,
    })),
  };
}

function toJsonExportPayload(
  payload: PublishedUsagePayload,
): JsonExportPayload {
  return {
    version: payload.version,
    start: payload.start,
    end: payload.end,
    providers: payload.providers.filter(
      (provider) => provider.provider !== "t3",
    ),
  };
}

function getMergedSectionTitle(providers: UsageSummary[]) {
  return providers
    .map((provider) => heatmapThemes[provider.provider].title)
    .join(" / ");
}

function sanitizePublishedProvider(
  provider: PublishedUsagePayload["providers"][number],
  endDate: Date,
) {
  if (provider.provider !== "claude") {
    return provider;
  }

  const daily = provider.daily.filter(
    (row) => !CLAUDE_EXCLUDED_DATES.has(row.date),
  );

  if (daily.length === provider.daily.length) {
    return provider;
  }

  return toJsonUsageSummary(
    mergeUsageSummaries(
      provider.provider,
      [
        toUsageSummary({
          ...provider,
          daily,
        }),
      ],
      endDate,
    ),
  );
}

function sanitizePublishedPayload(payload: PublishedUsagePayload) {
  const endDate = parseDateOnly(payload.end);
  const sanitizedProviders = payload.providers.map((provider) =>
    sanitizePublishedProvider(provider, endDate),
  );
  const continuityProviders = foldGeminiIntoAntigravityProvider(
    sanitizedProviders,
    endDate,
  );

  return {
    ...payload,
    providers: sortPublishedProviders(continuityProviders),
  };
}

function foldGeminiIntoAntigravityProvider(
  providers: PublishedUsagePayload["providers"],
  endDate: Date,
) {
  const agySources = providers.filter(
    (provider) => provider.provider === "agy" || provider.provider === "gemini",
  );

  if (agySources.length <= 1) {
    // Already folded (single "agy", no raw "gemini") or nothing to fold.
    return providers;
  }

  const antigravitySummary = toJsonUsageSummary(
    mergeUsageSummaries("agy", agySources.map(toUsageSummary), endDate),
  );

  return [
    ...providers.filter(
      (provider) =>
        provider.provider !== "agy" && provider.provider !== "gemini",
    ),
    antigravitySummary,
  ];
}

function renderPublishedSvg(payload: PublishedUsagePayload) {
  const providerSummaries = WEB_PROVIDER_ORDER.flatMap((providerId) => {
    const summary = payload.providers.find(
      (provider) => provider.provider === providerId,
    );

    return summary ? [toUsageSummary(summary)] : [];
  });
  const mergedSummary = mergeUsageSummaries(
    "all",
    providerSummaries,
    parseDateOnly(payload.end),
  );

  return renderUsageHeatmapsSvg({
    startDate: parseDateOnly(payload.start),
    endDate: parseDateOnly(payload.end),
    colorMode: "dark",
    sections: [
      {
        daily: mergedSummary.daily,
        insights: mergedSummary.insights,
        title: getMergedSectionTitle(providerSummaries),
        titleCaption: heatmapThemes.all.titleCaption,
        colors: heatmapThemes.all.colors,
      },
      ...providerSummaries.map((summary) => ({
        daily: summary.daily,
        insights: summary.insights,
        title: heatmapThemes[summary.provider].title,
        titleCaption: heatmapThemes[summary.provider].titleCaption,
        colors: heatmapThemes[summary.provider].colors,
      })),
    ],
  });
}

export function sortPublishedProviders(
  providers: PublishedUsagePayload["providers"],
) {
  const ordered = new Map(
    WEB_PROVIDER_ORDER.map((providerId, index) => [providerId, index]),
  );

  return [...providers].sort((left, right) => {
    const leftOrder =
      ordered.get(left.provider as (typeof WEB_PROVIDER_ORDER)[number]) ??
      Number.MAX_SAFE_INTEGER;
    const rightOrder =
      ordered.get(right.provider as (typeof WEB_PROVIDER_ORDER)[number]) ??
      Number.MAX_SAFE_INTEGER;

    return (
      leftOrder - rightOrder || left.provider.localeCompare(right.provider)
    );
  });
}

export function mergePublishedUsagePayloads({
  currentPayload,
  importedPayload,
  opencodeDailyRecoveryPayload,
  hostedPayload,
  t3Summary,
  updatedAt,
}: {
  currentPayload: JsonExportPayload;
  importedPayload: JsonExportPayload | null;
  opencodeDailyRecoveryPayload: JsonExportPayload | null;
  hostedPayload: PublishedUsagePayload | null;
  t3Summary: JsonUsageSummary | null;
  updatedAt?: Date;
}): PublishedUsagePayload {
  const payloadInputs = buildCanonicalPayloadInputs({
    currentPayload,
    importedPayload,
    opencodeDailyRecoveryPayload,
    hostedPayload,
  });
  const mergedPayload = mergeJsonExportsToPublishedUsage(
    payloadInputs,
    updatedAt,
  );

  if (t3Summary) {
    mergedPayload.providers = sortPublishedProviders([
      ...mergedPayload.providers,
      t3Summary,
    ]);
  } else {
    mergedPayload.providers = sortPublishedProviders(mergedPayload.providers);
  }

  return sanitizePublishedPayload(mergedPayload);
}

async function main() {
  const { start, end } = getDateWindow();
  const { rowsByProvider, warnings } = await aggregateUsage({ start, end });
  const currentProviders = providerIds.flatMap((provider) => {
    const summary = rowsByProvider[provider];

    return summary ? [summary] : [];
  });

  if (currentProviders.length === 0) {
    throw new Error("No local usage data found on this machine.");
  }

  for (const warning of warnings) {
    process.stderr.write(`${warning}\n`);
  }

  const importPath = resolve(
    process.env.SLOPMETER_WEB_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_IMPORT_PATH.trim()
      : resolveRepoPath(DEFAULT_IMPORT_PATH),
  );
  const t3ImportPath = resolve(
    process.env.SLOPMETER_WEB_T3_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_T3_IMPORT_PATH.trim()
      : resolveHomePath(DEFAULT_T3_IMPORT_PATH),
  );
  const opencodeRecoveryImportPath = resolve(
    process.env.SLOPMETER_WEB_OPENCODE_RECOVERY_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_OPENCODE_RECOVERY_IMPORT_PATH.trim()
      : resolveHomePath(DEFAULT_OPENCODE_RECOVERY_IMPORT_PATH),
  );
  const opencodeDailyRecoveryImportPath = resolve(
    process.env.SLOPMETER_WEB_OPENCODE_DAILY_RECOVERY_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_OPENCODE_DAILY_RECOVERY_IMPORT_PATH.trim()
      : resolveHomePath(DEFAULT_OPENCODE_DAILY_RECOVERY_IMPORT_PATH),
  );
  const costAnalysisImportPath = resolve(
    process.env.SLOPMETER_WEB_COST_ANALYSIS_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_COST_ANALYSIS_IMPORT_PATH.trim()
      : resolveHomePath(DEFAULT_COST_ANALYSIS_IMPORT_PATH),
  );
  const localOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_LOCAL_OUTPUT_PATH),
  );
  const localCostOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_COST_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_COST_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_LOCAL_COST_OUTPUT_PATH),
  );
  const localSvgOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_SVG_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_SVG_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_LOCAL_SVG_OUTPUT_PATH),
  );
  const localHistoryDir = resolve(
    process.env.SLOPMETER_WEB_LOCAL_HISTORY_DIR?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_HISTORY_DIR.trim()
      : resolveRepoPath(DEFAULT_LOCAL_HISTORY_DIR),
  );
  const localBundledModuleOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_BUNDLED_MODULE_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_BUNDLED_MODULE_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_BUNDLED_MODULE_OUTPUT_PATH),
  );
  const gitBackupRepoDir = process.env.SLOPMETER_WEB_GIT_BACKUP_REPO_DIR?.trim()
    ? resolve(process.env.SLOPMETER_WEB_GIT_BACKUP_REPO_DIR.trim())
    : null;
  const shouldPushGitBackup = process.env.SLOPMETER_WEB_GIT_BACKUP_PUSH === "1";
  const blobPath =
    process.env.SLOPMETER_WEB_BLOB_PATH?.trim() || DEFAULT_BLOB_PATH;
  const svgBlobPath =
    process.env.SLOPMETER_WEB_SVG_BLOB_PATH?.trim() || DEFAULT_SVG_BLOB_PATH;
  const currentPayload = createJsonExportPayload(start, end, currentProviders);
  const importedPayload = readImportedPayload(importPath);
  const opencodeDailyRecoveryPayload = readImportedPayload(
    opencodeDailyRecoveryImportPath,
  );
  const hostedPayload =
    (await readHostedPayload()) ??
    readExistingPublishedPayload(localOutputPath);
  const t3Summary = await loadT3PublishedSummary(t3ImportPath, start, end);
  const opencodeRecoverySummary = await loadT3PublishedSummary(
    opencodeRecoveryImportPath,
    start,
    end,
    "opencode",
  );
  const currentPayloadWithRecovery = opencodeRecoverySummary
    ? {
        ...currentPayload,
        providers: [...currentPayload.providers, opencodeRecoverySummary],
      }
    : currentPayload;
  const publishTimestamp = new Date();
  const mergedPayload = mergePublishedUsagePayloads({
    currentPayload: currentPayloadWithRecovery,
    importedPayload,
    opencodeDailyRecoveryPayload,
    hostedPayload,
    t3Summary,
    updatedAt: publishTimestamp,
  });
  const svg = renderPublishedSvg(mergedPayload);
  const costPayload = writePublishedCostArtifact({
    sourcePath: costAnalysisImportPath,
    outputPath: localCostOutputPath,
    usagePayload: mergedPayload,
  });

  mkdirSync(dirname(localOutputPath), { recursive: true });
  writeFileSync(
    localOutputPath,
    `${JSON.stringify(mergedPayload, null, 2)}\n`,
    "utf8",
  );
  mkdirSync(dirname(localSvgOutputPath), { recursive: true });
  writeFileSync(localSvgOutputPath, svg, "utf8");
  writeBundledPublishedArtifacts({
    modulePath: localBundledModuleOutputPath,
    payload: mergedPayload,
    svg,
    costPayload,
  });
  const backupPaths = writePublishedBackupArtifacts({
    historyDir: localHistoryDir,
    payload: mergedPayload,
    svg,
    updatedAt: publishTimestamp,
  });
  const gitBackup = gitBackupRepoDir
    ? syncPublishedArtifactsToGitBackupRepo({
        repoDir: gitBackupRepoDir,
        jsonSourcePath: backupPaths.jsonPath,
        svgSourcePath: backupPaths.svgPath,
        updatedAt: publishTimestamp,
        push: shouldPushGitBackup,
      })
    : {
        enabled: false,
        skipped: false,
        pushed: false,
        repoDir: null,
        commitHash: null,
        reason: null,
      };

  if (process.env.SLOPMETER_WEB_SKIP_BLOB_UPLOAD === "1") {
    process.stdout.write(
      `${JSON.stringify(
        {
          importPath: importedPayload ? importPath : null,
          t3ImportPath: t3Summary ? t3ImportPath : null,
          opencodeRecoveryImportPath: opencodeRecoverySummary
            ? opencodeRecoveryImportPath
            : null,
          opencodeDailyRecoveryImportPath: opencodeDailyRecoveryPayload
            ? opencodeDailyRecoveryImportPath
            : null,
          costAnalysisImportPath,
          localOutputPath,
          localCostOutputPath,
          localSvgOutputPath,
          localHistoryDir,
          localBundledModuleOutputPath,
          backupJsonPath: backupPaths.jsonPath,
          backupSvgPath: backupPaths.svgPath,
          gitBackup,
          blobPath: null,
          svgBlobPath: null,
          url: null,
          svgUrl: null,
        },
        null,
        2,
      )}\n`,
    );

    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required unless SLOPMETER_WEB_SKIP_BLOB_UPLOAD=1.",
    );
  }

  const upload = await put(blobPath, JSON.stringify(mergedPayload, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  const svgUpload = await put(svgBlobPath, svg, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "image/svg+xml",
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        importPath: importedPayload ? importPath : null,
        t3ImportPath: t3Summary ? t3ImportPath : null,
        opencodeRecoveryImportPath: opencodeRecoverySummary
          ? opencodeRecoveryImportPath
          : null,
        opencodeDailyRecoveryImportPath: opencodeDailyRecoveryPayload
          ? opencodeDailyRecoveryImportPath
          : null,
        costAnalysisImportPath,
        localOutputPath,
        localCostOutputPath,
        localSvgOutputPath,
        localHistoryDir,
        localBundledModuleOutputPath,
        backupJsonPath: backupPaths.jsonPath,
        backupSvgPath: backupPaths.svgPath,
        gitBackup,
        blobPath,
        svgBlobPath,
        url: upload.url,
        svgUrl: svgUpload.url,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
