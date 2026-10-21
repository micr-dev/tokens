import assert from "node:assert/strict";
import test from "node:test";
import type { PublishedUsagePayload } from "../../cli/src/lib/export";
import {
  normalizeModelPriceName,
  priceModelUsage,
  type ModelPricer,
} from "../lib/model-prices";
import { buildPublishedCostPayload } from "../scripts/lib/cost-analysis";

// Fixed per-million test prices, so these tests check the bucket split and
// aggregation independently of the price database.
const prices: Record<
  string,
  { input: number; cachedInput: number; cacheWrite?: number; output: number }
> = {
  "gpt-test": { input: 2, cachedInput: 0.5, output: 10 },
  "claude-opus-9-5": {
    input: 4,
    cachedInput: 0.4,
    cacheWrite: 5,
    output: 20,
  },
};
const pricer: ModelPricer = (modelName, _date, tokens) => {
  const price = prices[normalizeModelPriceName(modelName)];

  return price
    ? (tokens.input * price.input +
        tokens.cacheRead * price.cachedInput +
        tokens.cacheWrite * (price.cacheWrite ?? price.input) +
        tokens.output * price.output) /
        1_000_000
    : null;
};

function assertAlmostEqual(
  actual: number | null | undefined,
  expected: number,
) {
  assert.ok(
    typeof actual === "number" && Math.abs(actual - expected) < 1e-9,
    `expected ${actual} to be almost ${expected}`,
  );
}

function usagePayload(
  providers: PublishedUsagePayload["providers"],
): PublishedUsagePayload {
  return {
    version: "2026-03-03",
    start: "2026-05-01",
    end: "2026-06-30",
    updatedAt: "2026-06-30T12:00:00.000Z",
    providers,
  };
}

test("buildPublishedCostPayload bills cached input at the cached price and the rest at the input price", () => {
  const payload = buildPublishedCostPayload(
    usagePayload([
      {
        provider: "codex",
        daily: [
          {
            date: "2026-06-01",
            input: 1_000_000,
            output: 100_000,
            cache: { input: 800_000, output: 0 },
            total: 1_100_000,
            breakdown: [
              {
                name: "gpt-test",
                tokens: {
                  input: 1_000_000,
                  output: 100_000,
                  cache: { input: 800_000, output: 0 },
                  total: 1_100_000,
                },
              },
            ],
          },
        ],
      },
    ]),
    pricer,
  );

  // 200k uncached * $2 + 800k cached * $0.5 + 100k output * $10, per million.
  assertAlmostEqual(payload.harnesses[0]?.totalCostUsd, 0.4 + 0.4 + 1);
  assert.equal(payload.harnessTotalCostUsd, 1.8);
  assert.deepEqual(payload.modelWarnings, []);
});

test("buildPublishedCostPayload prices cache writes and reads omp's exclusive cache layout", () => {
  const payload = buildPublishedCostPayload(
    usagePayload([
      {
        provider: "claude",
        daily: [
          {
            date: "2026-06-01",
            // Claude folds cache reads into input and cache writes into output.
            input: 1_000_000,
            output: 300_000,
            cache: { input: 900_000, output: 200_000 },
            total: 1_300_000,
            breakdown: [
              {
                name: "anthropic/claude-opus-9.5-thinking",
                tokens: {
                  input: 1_000_000,
                  output: 300_000,
                  cache: { input: 900_000, output: 200_000 },
                  total: 1_300_000,
                },
              },
            ],
          },
        ],
      },
      {
        provider: "omp",
        daily: [
          {
            date: "2026-06-01",
            // omp keeps the same usage outside input/output.
            input: 100_000,
            output: 100_000,
            cache: { input: 900_000, output: 200_000 },
            total: 1_300_000,
            breakdown: [
              {
                name: "claude-opus-9-5",
                tokens: {
                  input: 100_000,
                  output: 100_000,
                  cache: { input: 900_000, output: 200_000 },
                  total: 1_300_000,
                },
              },
            ],
          },
        ],
      },
    ]),
    pricer,
  );
  // 100k uncached * $4 + 900k cached * $0.4 + 200k writes * $5 + 100k output * $20.
  const expected = 0.4 + 0.36 + 1 + 2;

  assertAlmostEqual(payload.harnesses[0]?.totalCostUsd, expected);
  assertAlmostEqual(payload.harnesses[1]?.totalCostUsd, expected);
});

test("buildPublishedCostPayload reports unpriced models and unattributed day tokens as missing-cost", () => {
  const payload = buildPublishedCostPayload(
    usagePayload([
      {
        provider: "hermes",
        daily: [
          {
            date: "2026-06-02",
            input: 900,
            output: 100,
            cache: { input: 0, output: 0 },
            total: 1_000,
            breakdown: [
              {
                name: "mystery-model",
                tokens: {
                  input: 600,
                  output: 100,
                  cache: { input: 0, output: 0 },
                  total: 700,
                },
              },
            ],
          },
        ],
      },
    ]),
    pricer,
  );

  assert.equal(payload.harnessTotalCostUsd, 0);
  assert.equal(payload.harnesses[0]?.totalTokens, 1_000);
  assert.deepEqual(payload.modelWarnings, [
    { model: "mystery-model", totalTokens: 700, status: "missing-cost" },
    { model: "unattributed", totalTokens: 300, status: "missing-cost" },
  ]);
});

test("buildPublishedCostPayload keeps harness and model totals equal across months", () => {
  const day = (date: string, name: string, input: number) => ({
    date,
    input,
    output: 1_000,
    cache: { input: input / 2, output: 0 },
    total: input + 1_000,
    breakdown: [
      {
        name,
        tokens: {
          input,
          output: 1_000,
          cache: { input: input / 2, output: 0 },
          total: input + 1_000,
        },
      },
    ],
  });
  const payload = buildPublishedCostPayload(
    usagePayload([
      {
        provider: "codex",
        daily: [
          day("2026-05-30", "gpt-test", 30_000),
          day("2026-06-01", "gpt-test", 10_000),
        ],
      },
      {
        provider: "opencode",
        daily: [day("2026-06-01", "cliproxyapi/gpt-test", 50_000)],
      },
    ]),
    pricer,
  );
  const harnessSum = payload.harnesses.reduce(
    (sum, harness) => sum + (harness.totalCostUsd ?? 0),
    0,
  );
  const modelSum = payload.models.reduce(
    (sum, model) => sum + model.totalCostUsd,
    0,
  );
  const modelMonthlySum = payload.models
    .flatMap((model) => model.monthly)
    .reduce((sum, row) => sum + (row.costUsd ?? 0), 0);

  assertAlmostEqual(modelSum, harnessSum);
  assertAlmostEqual(modelMonthlySum, harnessSum);
  assert.equal(payload.harnessTotalCostUsd, payload.modelTotalCostUsd);
  assert.deepEqual(
    payload.monthlyTotals.map((row) => row.month),
    ["2026-05", "2026-06"],
  );
  assert.deepEqual(payload.dateRange, {
    start: "2026-05-30",
    end: "2026-06-01",
  });
  assert.equal(payload.generatedAt, "2026-06-30T12:00:00.000Z");
});

test("priceModelUsage bills a whole day at the standard rate, not the long-context tier", () => {
  // 100k uncached * $5 + 900k cached * $0.5 on GPT-5.5. Priced as one request
  // this would cross the 272K long-context threshold and double.
  assertAlmostEqual(
    priceModelUsage("gpt-5.5", "2026-10-15", {
      input: 100_000,
      cacheRead: 900_000,
      cacheWrite: 0,
      output: 0,
    }),
    0.95,
  );
});

test("priceModelUsage maps naming variants without guessing unknown models", () => {
  const tokens = { input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0 };

  assertAlmostEqual(
    priceModelUsage("cliproxyapi/gpt-5.4", "2026-10-15", tokens),
    2.5,
  );
  assert.equal(
    priceModelUsage("claude-opus-4.5", "2026-10-15", tokens),
    priceModelUsage("claude-opus-4-5-thinking", "2026-10-15", tokens),
  );
  assert.equal(priceModelUsage("kimi-k2.5-free", "2026-10-15", tokens), 0);
  assert.equal(priceModelUsage("mystery-model", "2026-10-15", tokens), null);
});
