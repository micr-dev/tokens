import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonotoneAreaPath,
  buildMonotoneLinePath,
  getBurnAxisTicks,
} from "../app/burn-chart";
import { findUsageViewBySegment, usageViewSlugs } from "../app/views";
import {
  buildDailyBurn,
  buildProviderAnalytics,
  buildModelBurnSeries,
  buildSeriesBurn,
  getModelFamily,
} from "../lib/analytics";
import type { PublishedUsagePayload } from "../lib/types";

type PublishedProvider = PublishedUsagePayload["providers"][number];

function createDay(date: string, total: number, cacheInput = 0) {
  const tokens = {
    input: total - cacheInput,
    output: 0,
    cache: { input: cacheInput, output: 0 },
    total,
  };

  return {
    date,
    input: tokens.input,
    output: tokens.output,
    cache: tokens.cache,
    total,
    breakdown: [{ name: "gpt-5.4", tokens }],
  };
}

function createProvider(
  provider: PublishedProvider["provider"],
  daily: PublishedProvider["daily"],
): PublishedProvider {
  return {
    provider,
    insights: { streaks: { longest: 4, current: 2 } },
    daily,
  };
}

test("buildDailyBurn fills the range ending on the latest day and stacks providers by range total", () => {
  const providers = [
    createProvider("claude", [
      createDay("2026-01-01", 900),
      createDay("2026-01-09", 10),
    ]),
    createProvider("codex", [
      createDay("2026-01-08", 40, 10),
      createDay("2026-01-10", 60),
    ]),
    createProvider("omp", [createDay("2025-12-01", 5000)]),
  ].map(buildProviderAnalytics);

  const burn = buildDailyBurn(providers, 3);

  assert.deepEqual(burn.dates, ["2026-01-08", "2026-01-09", "2026-01-10"]);
  assert.deepEqual(
    burn.layers.map((layer) => [layer.provider, layer.values]),
    [
      ["codex", [40, 0, 60]],
      ["claude", [0, 10, 0]],
    ],
  );
  assert.deepEqual(burn.totals, [40, 10, 60]);
  assert.equal(burn.total, 110);
  assert.equal(burn.activeDays, 3);
  assert.deepEqual(burn.peak, { date: "2026-01-10", total: 60 });

  const [codex] = burn.layers;

  assert.equal(codex.title, "Codex");
  assert.equal(codex.accent, "#4f46e5");
  assert.equal(codex.activeDays, 2);
  assert.equal(codex.cache, 10);
  assert.deepEqual(codex.peak, { date: "2026-01-10", total: 60 });
  assert.equal(codex.currentStreak, 2);
  assert.equal(codex.longestStreak, 4);
});

test("buildDailyBurn crosses month boundaries and returns an empty burn without usage", () => {
  const providers = [
    createProvider("codex", [createDay("2026-03-01", 7)]),
  ].map(buildProviderAnalytics);

  assert.deepEqual(buildDailyBurn(providers, 3).dates, [
    "2026-02-27",
    "2026-02-28",
    "2026-03-01",
  ]);
  assert.deepEqual(buildDailyBurn([], 30), {
    dates: [],
    totals: [],
    total: 0,
    activeDays: 0,
    peak: null,
    layers: [],
  });
});

test("getBurnAxisTicks rounds the axis up to a nice step that covers the peak", () => {
  assert.deepEqual(getBurnAxisTicks(0), [0]);
  assert.deepEqual(getBurnAxisTicks(100), [0, 25, 50, 75, 100]);
  assert.deepEqual(getBurnAxisTicks(730_000_000), [
    0, 200_000_000, 400_000_000, 600_000_000, 800_000_000,
  ]);
  assert.deepEqual(getBurnAxisTicks(1_800_000_000), [
    0, 500_000_000, 1_000_000_000, 1_500_000_000, 2_000_000_000,
  ]);
});

test("monotone burn curves never overshoot the neighbouring days", () => {
  const points = [
    { x: 0, y: 100 },
    { x: 10, y: 0 },
    { x: 20, y: 100 },
    { x: 30, y: 100 },
    { x: 40, y: 50 },
  ];
  const path = buildMonotoneLinePath(points);
  const curves = path.split(" C").slice(1);

  assert.ok(path.startsWith("M0 100"));
  assert.equal(curves.length, points.length - 1);

  curves.forEach((curve, index) => {
    const ys = curve
      .split(" ")
      .filter((_, position) => position % 2 === 1)
      .map(Number);
    const low = Math.min(points[index].y, points[index + 1].y);
    const high = Math.max(points[index].y, points[index + 1].y);

    for (const y of ys) {
      assert.ok(y >= low && y <= high, `segment ${index} control y ${y}`);
    }
  });
  assert.equal(
    buildMonotoneAreaPath(points, 240),
    `M0 240 L${path.slice(1)} L40 240 Z`,
  );
});

test("tab routes map the root page to Harnesses and only known slugs to tabs", () => {
  assert.deepEqual(usageViewSlugs, ["models", "cost", "details"]);
  assert.equal(findUsageViewBySegment(null)?.id, "heatmap");
  assert.equal(findUsageViewBySegment("details")?.label, "Details");
  assert.equal(findUsageViewBySegment("unknown"), null);
  assert.equal(findUsageViewBySegment("/_not-found"), null);
});

test("model burn merges aliases across harnesses and families without losing unknown or unattributed usage", () => {
  const namedDay = (date: string, total: number, model: string) => {
    const day = createDay(date, total, 10);
    day.breakdown[0].name = model;
    return day;
  };
  const missing = createDay("2026-01-04", 20);
  missing.breakdown = [];
  const payload: PublishedUsagePayload = {
    version: "1",
    start: "2026-01-01",
    end: "2026-01-04",
    updatedAt: "2026-01-04",
    providers: [
      createProvider("codex", [
        namedDay("2026-01-01", 100, "cliproxyapi/gpt-5.4"),
        namedDay("2026-01-02", 40, "gpt-5.4"),
        missing,
      ]),
      createProvider("omp", [
        namedDay("2026-01-01", 50, "gpt-5.4"),
        namedDay("2026-01-03", 60, "gpt-5.5"),
        namedDay("2026-01-04", 30, "novel-model"),
      ]),
    ],
  };
  const models = buildModelBurnSeries(payload);
  const burn = buildSeriesBurn(models, 4);
  assert.deepEqual(burn.totals, [150, 40, 60, 50]);
  assert.equal(
    burn.total,
    buildDailyBurn(payload.providers.map(buildProviderAnalytics), 4).total,
  );
  const gpt = burn.layers.find((row) => row.title === "gpt-5.4")!;
  assert.deepEqual(gpt.values, [150, 40, 0, 0]);
  assert.equal(gpt.cache, 30);
  assert.equal(gpt.input, 160);
  assert.equal(gpt.activeDays, 2);
  assert.equal(gpt.longestStreak, 2);
  assert.equal(gpt.currentStreak, 0);
  assert.equal(
    burn.layers.find((row) => row.title === "Unattributed")?.total,
    20,
  );
  assert.equal(
    burn.layers.find((row) => row.title === "novel-model")?.total,
    30,
  );
  const family = buildSeriesBurn(buildModelBurnSeries(payload, "family"), 4);
  assert.deepEqual(family.totals, burn.totals);
  assert.deepEqual(
    family.layers.find((row) => row.title === "OpenAI")?.values,
    [150, 40, 60, 0],
  );
  assert.equal(
    family.layers.find((row) => row.title === "OpenAI")?.longestStreak,
    3,
  );
  assert.deepEqual(buildSeriesBurn(models, 2).totals, [60, 50]);
  assert.deepEqual(buildSeriesBurn(models, 2, "2026-01-06").totals, [0, 0]);
  assert.deepEqual(buildModelBurnSeries({ ...payload, providers: [] }), []);
  assert.equal(getModelFamily("anthropic/claude-opus-4-6"), "Anthropic");
  assert.equal(getModelFamily("gemini-3-pro-preview"), "Google");
  assert.equal(getModelFamily("o3"), "OpenAI");
  assert.equal(getModelFamily("new-model"), "new-model");
});

test("model family grouping maps creators and aliases to provider colors", () => {
  const modelNames = [
    "gpt-5.4",
    "anthropic/claude-4.5-opus",
    "gemini-3.1-pro-preview",
    "Gemini 3.5 Flash (High)",
    "glm5.3",
    "kimi-k2.5",
    "deepseek-v4-flash",
    "qwen3.8-27b",
    "grok-4.6",
    "minimax-m2.7",
    "nemotron-3",
    "muse-spark-1.3-contributor",
    "zen-muse-spark-1.2-contributor",
    "stealth/union-alpha",
    "zen-union-alpha",
    "mimo-v2.6-flash",
    "gemma4:31b",
    "sherlock-think-alpha",
    "duo-chat-opus-4-6",
    "duo-chat-gpt-5-2-codex",
    "big-pickle",
    "horizon-beta",
    "kiro-auto",
    "cursor-auto-[proxy]-0",
    "new-model",
  ];
  const total = modelNames.length * 10;
  const day = createDay("2026-01-01", total);
  day.breakdown = modelNames.map((name) => ({
    name,
    tokens: {
      input: 10,
      output: 0,
      cache: { input: 0, output: 0 },
      total: 10,
    },
  }));
  const payload: PublishedUsagePayload = {
    version: "1",
    start: day.date,
    end: day.date,
    updatedAt: day.date,
    providers: [createProvider("codex", [day])],
  };

  const families = buildModelBurnSeries(payload, "family");
  const familyByName = new Map(families.map((family) => [family.title, family]));
  assert.deepEqual(
    [...familyByName.keys()].sort(),
    [
      "Alibaba",
      "Anthropic",
      "DeepSeek",
      "Google",
      "Horizon Beta",
      "Kiro Auto",
      "Cursor Auto",
      "Meta",
      "MiniMax",
      "Moonshot",
      "NVIDIA",
      "OpenAI",
      "Big Pickle",
      "Unbiased (Pareto)",
      "Xiaomi",
      "xAI",
      "Z.AI",
      "new-model",
    ].sort(),
  );
  assert.equal(familyByName.get("Meta")?.daily[0]?.total, 20);
  assert.equal(familyByName.get("Unbiased (Pareto)")?.daily[0]?.total, 20);
  assert.equal(familyByName.get("Anthropic")?.daily[0]?.total, 20);
  assert.equal(familyByName.get("OpenAI")?.daily[0]?.total, 20);
  assert.equal(familyByName.get("xAI")?.daily[0]?.total, 20);
  assert.equal(familyByName.get("Google")?.daily[0]?.total, 30);
  assert.equal(familyByName.get("Anthropic")?.accent, "hsl(16 74% 58%)");
  assert.equal(familyByName.get("OpenAI")?.accent, "hsl(200 74% 58%)");
  assert.equal(familyByName.get("Meta")?.accent, "hsl(220 74% 58%)");
  assert.equal(
    familyByName.get("Unbiased (Pareto)")?.accent,
    "hsl(280 74% 58%)",
  );
  assert.equal(familyByName.get("Xiaomi")?.accent, "hsl(15 74% 58%)");
  assert.equal(familyByName.get("Horizon Beta")?.accent, "#a3a3a3");
  assert.equal(familyByName.get("Kiro Auto")?.accent, "#a3a3a3");
  assert.equal(familyByName.get("Cursor Auto")?.accent, "#a3a3a3");
  assert.equal(familyByName.get("new-model")?.accent, "#a3a3a3");
  const modelByName = new Map(
    buildModelBurnSeries(payload, "model").map((model) => [model.title, model]),
  );
  assert.equal(modelByName.get("claude-4.5-opus")?.accent, "hsl(16 74% 58%)");
  assert.equal(modelByName.get("gpt-5.4")?.accent, "hsl(200 74% 58%)");
  assert.equal(
    modelByName.get("gemini 3.5 flash (high)")?.accent,
    "hsl(138 74% 58%)",
  );
  assert.equal(getModelFamily("zen-muse-spark-1.3-contributor"), "Meta");
  assert.equal(getModelFamily("stealth/union-alpha"), "Unbiased (Pareto)");
  assert.equal(getModelFamily("unbiased/pareto"), "Unbiased (Pareto)");
  assert.equal(getModelFamily("mimo-v2.6-flash"), "Xiaomi");
  assert.equal(getModelFamily("xiaomi/mimo-v2.6-flash"), "Xiaomi");
  assert.equal(getModelFamily("glm5.3"), "Z.AI");
  assert.equal(getModelFamily("gemma4:31b"), "Google");
  assert.equal(getModelFamily("Gemini 3.5 Flash (High)"), "Google");
  assert.equal(getModelFamily("sherlock-think-alpha"), "xAI");
  assert.equal(getModelFamily("openrouter/sherlock-think-alpha"), "xAI");
});
