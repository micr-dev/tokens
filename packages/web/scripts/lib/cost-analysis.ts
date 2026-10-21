import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PublishedUsagePayload } from "../../../cli/src/lib/export";
import { getProviderTitle } from "../../lib/analytics";
import {
  MODEL_PRICE_ALIASES,
  MODEL_PRICES_PER_MILLION,
  resolveModelPrice,
  type ModelPricePerMillion,
} from "../../lib/model-prices";
import type {
  ProviderId,
  PublishedCostHarness,
  PublishedCostModel,
  PublishedCostModelWarning,
  PublishedCostMonthlyRow,
  PublishedCostPayload,
} from "../../lib/types";

const COST_PAYLOAD_VERSION = "2026-10-21";
const COST_SOURCE =
  "tokens.micr.dev published daily usage, priced per model with packages/web/lib/model-prices.ts";
export const COST_COVERAGE_NOTE =
  "API-price equivalent for this token usage. Most or all of these tokens were used through subscription plans rather than metered API billing.";
// Day totals that no model breakdown accounts for cannot be priced, but they
// still count toward harness tokens, so they surface as their own warning row.
const UNATTRIBUTED_MODEL_NAME = "unattributed";

type UsageProvider = PublishedUsagePayload["providers"][number];
type UsageDay = UsageProvider["daily"][number];
type TokenTotals = UsageDay["breakdown"][number]["tokens"];

interface ModelAccumulator {
  model: PublishedCostModel;
  monthly: Map<string, PublishedCostMonthlyRow>;
  priced: boolean;
}

// Loaders disagree on where cache tokens live, so split them per harness:
// - omp reports input/output without cache reads/writes
//   (total = input + output + cache.input + cache.output);
// - cursor folds cache writes into input ("Input (w/ Cache Write)");
// - every other loader folds cache reads into input and cache writes into output.
// Clamping keeps the rare row whose cache exceeds its bucket from going negative.
function splitBillableTokens(provider: string, tokens: TokenTotals) {
  const cacheRead = tokens.cache.input;
  const cacheWrite = tokens.cache.output;

  if (provider === "omp") {
    return {
      input: tokens.input,
      cacheRead,
      cacheWrite,
      output: tokens.output,
    };
  }

  if (provider === "cursor") {
    return {
      input: Math.max(tokens.input - cacheRead - cacheWrite, 0),
      cacheRead,
      cacheWrite,
      output: tokens.output,
    };
  }

  return {
    input: Math.max(tokens.input - cacheRead, 0),
    cacheRead,
    cacheWrite,
    output: Math.max(tokens.output - cacheWrite, 0),
  };
}

export function priceModelTokens(
  provider: string,
  tokens: TokenTotals,
  price: ModelPricePerMillion,
) {
  const billable = splitBillableTokens(provider, tokens);

  return (
    (billable.input * price.input +
      billable.cacheRead * price.cachedInput +
      billable.cacheWrite * (price.cacheWrite ?? price.input) +
      billable.output * price.output) /
    1_000_000
  );
}

function getMonthlyRow(
  rows: Map<string, PublishedCostMonthlyRow>,
  month: string,
) {
  const row = rows.get(month) ?? {
    month,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };

  rows.set(month, row);

  return row;
}

function addUsage(
  row: PublishedCostMonthlyRow,
  tokens: TokenTotals,
  costUsd: number,
) {
  row.inputTokens += tokens.input;
  row.outputTokens += tokens.output;
  row.cacheReadTokens += tokens.cache.input;
  row.totalTokens += tokens.total;
  row.costUsd = (row.costUsd ?? 0) + costUsd;
}

function sortMonthly(rows: Map<string, PublishedCostMonthlyRow>) {
  return [...rows.values()].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
}

function addModelUsage({
  models,
  name,
  month,
  tokens,
  costUsd,
  priced,
}: {
  models: Map<string, ModelAccumulator>;
  name: string;
  month: string;
  tokens: TokenTotals;
  costUsd: number;
  priced: boolean;
}) {
  const accumulator = models.get(name) ?? {
    model: {
      name,
      totalCostUsd: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      monthsActive: 0,
      monthly: [],
    },
    monthly: new Map<string, PublishedCostMonthlyRow>(),
    priced,
  };
  addUsage(getMonthlyRow(accumulator.monthly, month), tokens, costUsd);
  accumulator.model.totalCostUsd += costUsd;
  accumulator.model.totalTokens += tokens.total;
  accumulator.model.inputTokens += tokens.input;
  accumulator.model.outputTokens += tokens.output;
  accumulator.model.cacheReadTokens += tokens.cache.input;
  models.set(name, accumulator);
}

// Pure: the same usage payload and price table always produce the same artifact.
export function buildPublishedCostPayload(
  usagePayload: PublishedUsagePayload,
  prices: Record<string, ModelPricePerMillion> = MODEL_PRICES_PER_MILLION,
  aliases: Record<string, string> = MODEL_PRICE_ALIASES,
): PublishedCostPayload {
  const harnesses: PublishedCostHarness[] = [];
  const models = new Map<string, ModelAccumulator>();
  const monthlyTotals = new Map<string, PublishedCostMonthlyRow>();
  const activeDates: string[] = [];
  let totalCostUsd = 0;
  let grandTotalTokens = 0;

  for (const provider of usagePayload.providers) {
    const days = provider.daily
      .filter((day) => day.total > 0)
      .sort((left, right) => left.date.localeCompare(right.date));

    if (days.length === 0) {
      continue;
    }

    const monthly = new Map<string, PublishedCostMonthlyRow>();
    let harnessCostUsd = 0;

    for (const day of days) {
      const month = day.date.slice(0, 7);
      let dayCostUsd = 0;
      let attributedTokens = 0;

      for (const breakdown of day.breakdown) {
        const price = resolveModelPrice(breakdown.name, prices, aliases);
        const costUsd = price
          ? priceModelTokens(provider.provider, breakdown.tokens, price)
          : 0;

        attributedTokens += breakdown.tokens.total;
        dayCostUsd += costUsd;
        addModelUsage({
          models,
          name: breakdown.name,
          month,
          tokens: breakdown.tokens,
          costUsd,
          priced: price !== null,
        });
      }

      if (day.total > attributedTokens) {
        addModelUsage({
          models,
          name: UNATTRIBUTED_MODEL_NAME,
          month,
          tokens: {
            input: 0,
            output: 0,
            cache: { input: 0, output: 0 },
            total: day.total - attributedTokens,
          },
          costUsd: 0,
          priced: false,
        });
      }

      for (const row of [
        getMonthlyRow(monthly, month),
        getMonthlyRow(monthlyTotals, month),
      ]) {
        addUsage(row, day, dayCostUsd);
        row.activeDays = (row.activeDays ?? 0) + 1;
      }

      harnessCostUsd += dayCostUsd;
      grandTotalTokens += day.total;
      activeDates.push(day.date);
    }

    const monthlyRows = sortMonthly(monthly);

    totalCostUsd += harnessCostUsd;
    harnesses.push({
      id: provider.provider,
      // The CLI provider union also contains "all", which has no web title.
      label:
        getProviderTitle(provider.provider as ProviderId) ?? provider.provider,
      activeDays: days.length,
      firstDate: days[0]?.date ?? null,
      lastDate: days[days.length - 1]?.date ?? null,
      totalCostUsd: harnessCostUsd,
      totalTokens: monthlyRows.reduce((sum, row) => sum + row.totalTokens, 0),
      inputTokens: monthlyRows.reduce((sum, row) => sum + row.inputTokens, 0),
      outputTokens: monthlyRows.reduce((sum, row) => sum + row.outputTokens, 0),
      cacheReadTokens: monthlyRows.reduce(
        (sum, row) => sum + row.cacheReadTokens,
        0,
      ),
      monthly: monthlyRows,
    });
  }

  const modelRows = [...models.values()].map(({ model, monthly }) => ({
    ...model,
    monthsActive: monthly.size,
    monthly: sortMonthly(monthly),
  }));
  const modelWarnings: PublishedCostModelWarning[] = [...models.values()]
    .filter(({ priced, model }) => !priced && model.totalTokens > 0)
    .map(({ model }) => ({
      model: model.name,
      totalTokens: model.totalTokens,
      status: "missing-cost" as const,
    }))
    .sort(
      (left, right) =>
        right.totalTokens - left.totalTokens ||
        left.model.localeCompare(right.model),
    );
  const sortedDates = activeDates.sort((left, right) =>
    left.localeCompare(right),
  );
  // Harness and model rows partition the same priced breakdown rows, so one
  // rounded total serves both top-line figures.
  const roundedTotalCostUsd = Math.round(totalCostUsd * 100) / 100;

  return {
    version: COST_PAYLOAD_VERSION,
    generatedAt: usagePayload.updatedAt,
    source: COST_SOURCE,
    dateRange: {
      start: sortedDates[0] ?? usagePayload.start,
      end: sortedDates[sortedDates.length - 1] ?? usagePayload.end,
    },
    grandTotalTokens,
    harnessTotalCostUsd: roundedTotalCostUsd,
    modelTotalCostUsd: roundedTotalCostUsd,
    coverageNote: COST_COVERAGE_NOTE,
    harnesses,
    models: modelRows.sort(
      (left, right) =>
        right.totalCostUsd - left.totalCostUsd ||
        right.totalTokens - left.totalTokens ||
        left.name.localeCompare(right.name),
    ),
    monthlyTotals: sortMonthly(monthlyTotals),
    modelWarnings,
  };
}

export function writePublishedCostArtifact({
  outputPath,
  usagePayload,
}: {
  outputPath: string;
  usagePayload: PublishedUsagePayload;
}) {
  const payload = buildPublishedCostPayload(usagePayload);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return payload;
}
