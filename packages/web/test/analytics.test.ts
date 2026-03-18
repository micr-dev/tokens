import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalytics } from "../lib/analytics";
import type { PublishedUsagePayload } from "../lib/types";

const payload: PublishedUsagePayload = {
  version: "2026-03-03",
  start: "2026-01-01",
  end: "2026-01-31",
  updatedAt: "2026-01-31T00:00:00.000Z",
  providers: [
    {
      provider: "codex",
      insights: {
        mostUsedModel: {
          name: "gpt-5.4",
          tokens: {
            input: 14,
            output: 16,
            cache: { input: 6, output: 0 },
            total: 30,
          },
        },
        recentMostUsedModel: {
          name: "gpt-5.4",
          tokens: {
            input: 14,
            output: 16,
            cache: { input: 6, output: 0 },
            total: 30,
          },
        },
        streaks: {
          longest: 2,
          current: 1,
        },
      },
      daily: [
        {
          date: "2026-01-03",
          input: 10,
          output: 5,
          cache: { input: 4, output: 0 },
          total: 15,
          breakdown: [
            {
              name: "gpt-5.4",
              tokens: {
                input: 10,
                output: 5,
                cache: { input: 4, output: 0 },
                total: 15,
              },
            },
          ],
        },
        {
          date: "2026-01-10",
          input: 4,
          output: 11,
          cache: { input: 2, output: 0 },
          total: 15,
          breakdown: [
            {
              name: "gpt-5.4",
              tokens: {
                input: 4,
                output: 11,
                cache: { input: 2, output: 0 },
                total: 15,
              },
            },
            {
              name: "gpt-5-mini",
              tokens: {
                input: 0,
                output: 0,
                cache: { input: 0, output: 0 },
                total: 3,
              },
            },
          ],
        },
      ],
    },
  ],
};

test("buildAnalytics derives provider totals, peaks, series, and model shares", () => {
  const [provider] = buildAnalytics(payload);

  assert.equal(provider.provider, "codex");
  assert.equal(provider.total, 30);
  assert.equal(provider.cacheTotal, 6);
  assert.equal(provider.cacheShare, 20);
  assert.equal(provider.activeDays, 2);
  assert.deepEqual(provider.topDay, {
    date: "2026-01-03",
    total: 15,
  });
  assert.deepEqual(provider.topMonth, {
    label: "2026-01",
    total: 30,
  });
  assert.deepEqual(
    provider.monthly,
    [{ label: "2026-01", value: 30 }],
  );
  assert.deepEqual(
    provider.weekdays.map((day) => day.label),
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  );
  assert.equal(provider.weekdays.find((day) => day.label === "Sat")?.value, 30);
  assert.deepEqual(provider.topModels, [
    {
      name: "gpt-5.4",
      total: 30,
      share: 1,
    },
    {
      name: "gpt-5-mini",
      total: 3,
      share: 0.1,
    },
  ]);
});
