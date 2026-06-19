import assert from "node:assert/strict";
import test from "node:test";
import { buildCostAnalytics, getProviderDetailTheme } from "../lib/analytics";
import type { PublishedCostPayload, PublishedUsagePayload } from "../lib/types";
import { normalizePublishedSvgMarkup } from "../lib/usage";

function assertAlmostEqual(actual: number | undefined, expected: number) {
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) < 0.000001,
    `expected ${actual} to be almost ${expected}`,
  );
}

test("normalizePublishedSvgMarkup replaces merged provider lists with All Providers", () => {
  const input =
    '<svg><text x="0" y="0">TOTAL USAGE FROM</text><text x="0" y="14">Claude Code, Codex, Hermes Agent, Helios</text><text x="120" y="0">TOTAL INPUT</text></svg>';

  assert.equal(
    normalizePublishedSvgMarkup(input),
    '<svg><text x="0" y="0">TOTAL USAGE FROM</text><text x="0" y="14">All Providers</text><text x="120" y="0">TOTAL INPUT</text></svg>',
  );
});

test("normalizePublishedSvgMarkup preserves dark heatmap colors and applies reference fonts", () => {
  const input =
    '<svg><rect fill="#171717"></rect><rect fill="#262626"></rect><rect fill="#bbf7d0"></rect><text font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">Jun</text></svg>';

  assert.equal(
    normalizePublishedSvgMarkup(input),
    '<svg><rect fill="#171717"></rect><rect fill="#262626"></rect><rect fill="#bbf7d0"></rect><text font-family="helveticaNeue, Helvetica Neue">Jun</text></svg>',
  );
});

test("getProviderDetailTheme keeps Hermes aligned with the heatmap palette", () => {
  assert.deepEqual(getProviderDetailTheme("hermes"), {
    accent: "#ffc107",
    accentSoft: "#fffde7",
  });
});

test("getProviderDetailTheme exposes Droid red-orange colors for details cards", () => {
  assert.deepEqual(getProviderDetailTheme("droid"), {
    accent: "#d46922",
    accentSoft: "#fff7ed",
  });
});

test("getProviderDetailTheme exposes legacy Gemini CLI colors for details cards", () => {
  assert.deepEqual(getProviderDetailTheme("gemini"), {
    accent: "#a3a3a3",
    accentSoft: "#202020",
  });
});

test("buildCostAnalytics partitions canonical harness spend by provider/model", () => {
  const usagePayload: PublishedUsagePayload = {
    version: "2026-03-03",
    start: "2026-05-01",
    end: "2026-06-30",
    updatedAt: "2026-06-30T00:00:00.000Z",
    providers: [
      {
        provider: "codex",
        daily: [
          {
            date: "2026-05-01",
            input: 10,
            output: 2,
            cache: { input: 3, output: 0 },
            total: 12,
            breakdown: [
              {
                name: "gpt-5.4",
                tokens: {
                  input: 10,
                  output: 2,
                  cache: { input: 3, output: 0 },
                  total: 12,
                },
              },
            ],
          },
          {
            date: "2026-06-01",
            input: 20,
            output: 5,
            cache: { input: 8, output: 0 },
            total: 25,
            breakdown: [
              {
                name: "gpt-5.4",
                tokens: {
                  input: 20,
                  output: 5,
                  cache: { input: 8, output: 0 },
                  total: 25,
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const costPayload: PublishedCostPayload = {
    version: "2026-06-19",
    generatedAt: "2026-06-19T00:00:00.000Z",
    source: "test",
    dateRange: { start: "2026-05-01", end: "2026-06-30" },
    grandTotalTokens: 37,
    harnessTotalCostUsd: 10,
    modelTotalCostUsd: 12,
    coverageNote: "test coverage note",
    harnesses: [
      {
        id: "codex",
        label: "Codex",
        activeDays: 2,
        firstDate: "2026-05-01",
        lastDate: "2026-06-01",
        totalCostUsd: 10,
        totalTokens: 37,
        inputTokens: 30,
        outputTokens: 7,
        cacheReadTokens: 11,
        monthly: [
          {
            month: "2026-05",
            inputTokens: 10,
            outputTokens: 2,
            cacheReadTokens: 3,
            totalTokens: 12,
            activeDays: 1,
            costUsd: 4,
          },
          {
            month: "2026-06",
            inputTokens: 20,
            outputTokens: 5,
            cacheReadTokens: 8,
            totalTokens: 25,
            activeDays: 1,
            costUsd: 7,
          },
        ],
      },
    ],
    models: [
      {
        name: "gpt-5.4",
        totalCostUsd: 12,
        totalTokens: 37,
        inputTokens: 30,
        outputTokens: 7,
        cacheReadTokens: 11,
        monthsActive: 2,
      },
    ],
    monthlyTotals: [
      {
        month: "2026-05",
        inputTokens: 10,
        outputTokens: 2,
        cacheReadTokens: 3,
        totalTokens: 12,
        activeDays: 1,
        costUsd: 4,
      },
      {
        month: "2026-06",
        inputTokens: 20,
        outputTokens: 5,
        cacheReadTokens: 8,
        totalTokens: 25,
        activeDays: 1,
        costUsd: 7,
      },
    ],
  };

  const analytics = buildCostAnalytics({ costPayload, usagePayload });

  assert.equal(analytics?.harnessTotalCostUsd, 10);
  assertAlmostEqual(analytics?.modelTotalCostUsd, 10);
  assert.deepEqual(analytics?.monthKeys, ["2026-05", "2026-06"]);
  assert.equal(analytics?.topHarness?.label, "Codex");
  assert.equal(analytics?.models[0]?.monthly.length, 2);
  assertAlmostEqual(analytics?.models[0]?.monthly[0]?.costUsd, 40 / 11);
  assertAlmostEqual(analytics?.models[0]?.monthly[1]?.costUsd, 70 / 11);
});

test("buildCostAnalytics allocates harness spend to missing-cost recent models", () => {
  const usagePayload: PublishedUsagePayload = {
    version: "2026-03-03",
    start: "2026-06-01",
    end: "2026-06-30",
    updatedAt: "2026-06-30T00:00:00.000Z",
    providers: [
      {
        provider: "codex",
        daily: [
          {
            date: "2026-06-01",
            input: 80,
            output: 20,
            cache: { input: 40, output: 0 },
            total: 100,
            breakdown: [
              {
                name: "gpt-5.5",
                tokens: {
                  input: 80,
                  output: 20,
                  cache: { input: 40, output: 0 },
                  total: 100,
                },
              },
            ],
          },
        ],
      },
    ],
  };
  const costPayload: PublishedCostPayload = {
    version: "2026-06-19",
    generatedAt: "2026-06-19T00:00:00.000Z",
    source: "test",
    dateRange: { start: "2026-06-01", end: "2026-06-30" },
    grandTotalTokens: 100,
    harnessTotalCostUsd: 9,
    modelTotalCostUsd: 0,
    coverageNote: "test coverage note",
    harnesses: [
      {
        id: "codex",
        label: "Codex",
        activeDays: 1,
        firstDate: "2026-06-01",
        lastDate: "2026-06-01",
        totalCostUsd: 9,
        totalTokens: 100,
        inputTokens: 80,
        outputTokens: 20,
        cacheReadTokens: 40,
        monthly: [
          {
            month: "2026-06",
            inputTokens: 80,
            outputTokens: 20,
            cacheReadTokens: 40,
            totalTokens: 100,
            activeDays: 1,
            costUsd: 9,
          },
        ],
      },
    ],
    models: [
      {
        name: "gpt-5.5",
        totalCostUsd: 0,
        totalTokens: 100,
        inputTokens: 80,
        outputTokens: 20,
        cacheReadTokens: 40,
        monthsActive: 1,
      },
    ],
    monthlyTotals: [
      {
        month: "2026-06",
        inputTokens: 80,
        outputTokens: 20,
        cacheReadTokens: 40,
        totalTokens: 100,
        activeDays: 1,
        costUsd: 9,
      },
    ],
  };

  const analytics = buildCostAnalytics({ costPayload, usagePayload });
  const model = analytics?.models[0];

  assert.equal(model?.label, "gpt-5.5");
  assert.equal(model?.totalCostUsd, 9);
  assert.deepEqual(model?.monthly, [
    {
      month: "2026-06",
      costUsd: 9,
      totalTokens: 100,
    },
  ]);
  assert.equal(analytics?.modelTotalCostUsd, 9);
});
