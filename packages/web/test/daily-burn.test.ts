import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMonotoneAreaPath,
  buildMonotoneLinePath,
  getBurnAxisTicks,
} from "../app/burn-chart";
import { findUsageViewBySegment, usageViewSlugs } from "../app/views";
import { buildDailyBurn, buildProviderAnalytics } from "../lib/analytics";
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
