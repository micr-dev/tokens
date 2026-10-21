import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCostAnalytics,
  getProviderDetailTheme,
  getProviderTitle,
} from "../lib/analytics";
import type { PublishedUsagePayload } from "../lib/types";
import { normalizePublishedSvgMarkup } from "../lib/usage";
import { buildPublishedCostPayload } from "../scripts/lib/cost-analysis";

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

test("NanoClaw has a separate title and turquoise detail theme", () => {
  assert.equal(getProviderTitle("nanoclaw"), "NanoClaw");
  assert.deepEqual(getProviderDetailTheme("nanoclaw"), {
    accent: "#22d3ee",
    accentSoft: "#083344",
  });
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

test("buildCostAnalytics shows exact per-model costs that sum to harness spend", () => {
  const day = (date: string, name: string, input: number) => ({
    date,
    input,
    output: 100_000,
    cache: { input: input / 2, output: 0 },
    total: input + 100_000,
    breakdown: [
      {
        name,
        tokens: {
          input,
          output: 100_000,
          cache: { input: input / 2, output: 0 },
          total: input + 100_000,
        },
      },
    ],
  });
  const usagePayload: PublishedUsagePayload = {
    version: "2026-03-03",
    start: "2026-05-01",
    end: "2026-06-30",
    updatedAt: "2026-06-30T00:00:00.000Z",
    providers: [
      {
        provider: "codex",
        daily: [
          day("2026-05-01", "gpt-5.4", 1_000_000),
          day("2026-06-01", "kimi-k2.5-free", 1_000_000),
        ],
      },
      {
        provider: "hermes",
        daily: [day("2026-06-01", "cliproxyapi/gpt-5.4", 2_000_000)],
      },
    ],
  };
  const costPayload = buildPublishedCostPayload(usagePayload);
  const analytics = buildCostAnalytics(costPayload);
  const gpt = analytics?.models.find((model) => model.label === "gpt-5.4");
  const kimi = analytics?.models.find((model) => model.label === "kimi-k2.5");
  // gpt-5.4: $2.50 uncached, $0.25 cached, $15 output per million tokens.
  const gptMay = (500_000 * 2.5 + 500_000 * 0.25 + 100_000 * 15) / 1_000_000;
  const gptJune =
    (1_000_000 * 2.5 + 1_000_000 * 0.25 + 100_000 * 15) / 1_000_000;

  assertAlmostEqual(gpt?.totalCostUsd ?? undefined, gptMay + gptJune);
  assert.deepEqual(
    gpt?.monthly.map((row) => row.month),
    ["2026-05", "2026-06"],
  );
  assertAlmostEqual(gpt?.monthly[0]?.costUsd, gptMay);
  // A $0 free model must not absorb a share of the harness's paid spend.
  assert.equal(kimi?.totalCostUsd, 0);
  assertAlmostEqual(analytics?.modelTotalCostUsd, gptMay + gptJune);
  // Harness spend is rounded to cents; the exact sum sits on a half-cent here.
  assert.ok(
    Math.abs((analytics?.harnessTotalCostUsd ?? 0) - (gptMay + gptJune)) <=
      0.005 + 1e-9,
  );
  assert.deepEqual(analytics?.monthKeys, ["2026-05", "2026-06"]);
  assert.equal(analytics?.topHarness?.label, "Hermes Agent");
});
