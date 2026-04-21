import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalytics } from "../lib/analytics";
import type { PublishedUsagePayload } from "../lib/types";

function createTokens(total: number) {
  return {
    input: total,
    output: 0,
    cache: {
      input: 0,
      output: 0,
    },
    total,
  };
}

function readHslLightness(color: string) {
  const match = color.match(/(\d+(?:\.\d+)?)%\)$/);

  return match ? Number.parseFloat(match[1]) : Number.NaN;
}

const detailsPayload: PublishedUsagePayload = {
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
    {
      provider: "opencode",
      insights: {
        mostUsedModel: {
          name: "qwen-3",
          tokens: {
            input: 22,
            output: 8,
            cache: { input: 10, output: 0 },
            total: 30,
          },
        },
        recentMostUsedModel: {
          name: "qwen-3",
          tokens: {
            input: 22,
            output: 8,
            cache: { input: 10, output: 0 },
            total: 30,
          },
        },
        streaks: {
          longest: 3,
          current: 2,
        },
      },
      daily: [
        {
          date: "2026-01-03",
          input: 20,
          output: 10,
          cache: { input: 8, output: 0 },
          total: 30,
          breakdown: [
            {
              name: "qwen-3",
              tokens: {
                input: 20,
                output: 10,
                cache: { input: 8, output: 0 },
                total: 30,
              },
            },
          ],
        },
        {
          date: "2026-01-11",
          input: 2,
          output: 1,
          cache: { input: 2, output: 0 },
          total: 3,
          breakdown: [
            {
              name: "qwen-3-mini",
              tokens: {
                input: 2,
                output: 1,
                cache: { input: 2, output: 0 },
                total: 3,
              },
            },
          ],
        },
      ],
    },
  ],
};

const modelsPayload: PublishedUsagePayload = {
  version: "2026-03-03",
  start: "2022-01-05",
  end: "2026-03-25",
  updatedAt: "2026-03-25T00:00:00.000Z",
  providers: [
    {
      provider: "codex",
      insights: {
        streaks: {
          longest: 4,
          current: 2,
        },
      },
      daily: [
        {
          date: "2022-01-05",
          input: 60,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 60,
          breakdown: [{ name: "gpt-4.1", tokens: createTokens(60) }],
        },
        {
          date: "2024-06-10",
          input: 30,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 30,
          breakdown: [{ name: "gpt-5.1", tokens: createTokens(30) }],
        },
        {
          date: "2025-04-01",
          input: 70,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 70,
          breakdown: [{ name: "gpt-5.3-codex", tokens: createTokens(70) }],
        },
        {
          date: "2026-02-20",
          input: 120,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 120,
          breakdown: [{ name: "gpt-5.4", tokens: createTokens(120) }],
        },
        {
          date: "2026-03-18",
          input: 120,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 120,
          breakdown: [
            { name: "gpt-5.4", tokens: createTokens(90) },
            { name: "gpt-5.3-codex", tokens: createTokens(30) },
          ],
        },
        {
          date: "2026-03-24",
          input: 20,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 20,
          breakdown: [{ name: "gpt-5.2-codex", tokens: createTokens(20) }],
        },
        {
          date: "2026-03-25",
          input: 150,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 150,
          breakdown: [
            { name: "gpt-5.4", tokens: createTokens(110) },
            { name: "gpt-5.3-codex", tokens: createTokens(40) },
          ],
        },
      ],
    },
    {
      provider: "opencode",
      insights: {
        streaks: {
          longest: 3,
          current: 1,
        },
      },
      daily: [
        {
          date: "2025-11-03",
          input: 50,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 50,
          breakdown: [{ name: "glm-4.6", tokens: createTokens(50) }],
        },
        {
          date: "2026-02-26",
          input: 80,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 80,
          breakdown: [{ name: "glm-4.7", tokens: createTokens(80) }],
        },
        {
          date: "2026-03-19",
          input: 90,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 90,
          breakdown: [
            { name: "glm-4.7", tokens: createTokens(70) },
            { name: "glm-5", tokens: createTokens(20) },
          ],
        },
        {
          date: "2026-03-25",
          input: 60,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 60,
          breakdown: [{ name: "glm-5", tokens: createTokens(60) }],
        },
      ],
    },
    {
      provider: "claude",
      insights: {
        streaks: {
          longest: 2,
          current: 2,
        },
      },
      daily: [
        {
          date: "2026-03-21",
          input: 45,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 45,
          breakdown: [{ name: "claude-4.5-opus", tokens: createTokens(45) }],
        },
        {
          date: "2026-03-25",
          input: 25,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 25,
          breakdown: [{ name: "claude-sonnet-4.5", tokens: createTokens(25) }],
        },
      ],
    },
    {
      provider: "gemini",
      insights: {
        streaks: {
          longest: 2,
          current: 2,
        },
      },
      daily: [
        {
          date: "2026-03-24",
          input: 40,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 40,
          breakdown: [{ name: "gemini-2.5-pro", tokens: createTokens(40) }],
        },
        {
          date: "2026-03-25",
          input: 30,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 30,
          breakdown: [{ name: "gemini-3-pro", tokens: createTokens(30) }],
        },
      ],
    },
    {
      provider: "pi",
      insights: {
        streaks: {
          longest: 1,
          current: 1,
        },
      },
      daily: [
        {
          date: "2026-03-25",
          input: 2,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 2,
          breakdown: [{ name: "grok-v4", tokens: createTokens(2) }],
        },
      ],
    },
    {
      provider: "hermes",
      insights: {
        streaks: {
          longest: 1,
          current: 1,
        },
      },
      daily: [
        {
          date: "2026-03-25",
          input: 1,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 1,
          breakdown: [
            { name: "sherlock-think-alpha", tokens: createTokens(1) },
            {
              name: "antigravity-claude-opus-4-5-thinking",
              tokens: createTokens(13),
            },
          ],
        },
      ],
    },
  ],
};

test("buildAnalytics preserves provider detail cards and adds daily series", () => {
  const analytics = buildAnalytics(detailsPayload);
  const [codex] = analytics.providers;

  assert.equal(codex?.provider, "codex");
  assert.equal(codex?.total, 30);
  assert.equal(codex?.cacheTotal, 6);
  assert.equal(codex?.cacheShare, 20);
  assert.equal(codex?.share, 30 / 63);
  assert.equal(codex?.daily.length, 2);
  assert.deepEqual(codex?.topDay, {
    date: "2026-01-03",
    total: 15,
  });
  assert.deepEqual(codex?.topMonth, {
    label: "2026-01",
    total: 30,
  });
  assert.deepEqual(codex?.monthly, [{ label: "2026-01", value: 30 }]);
  assert.equal(codex?.weekdays.find((day) => day.label === "Sat")?.value, 30);
  assert.equal(codex?.weekdays.find((day) => day.label === "Fri")?.value, 0);
  assert.deepEqual(codex?.topModels, [
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

test("buildAnalytics derives major vendor rows and period buckets for the models tab", () => {
  const analytics = buildAnalytics(modelsPayload);
  const openai = analytics.vendors.find((vendor) => vendor.vendor === "openai");
  const zAi = analytics.vendors.find((vendor) => vendor.vendor === "z-ai");
  const anthropic = analytics.vendors.find(
    (vendor) => vendor.vendor === "anthropic",
  );

  assert.deepEqual(
    analytics.vendors.map((vendor) => vendor.name),
    ["OpenAI", "Z.AI", "Anthropic", "Google"],
  );

  assert.equal(openai?.total, 570);
  assert.equal(zAi?.total, 280);
  assert.equal(anthropic?.total, 83);
  assert.ok(!analytics.vendors.some((vendor) => vendor.name === "Other"));
  assert.equal(openai?.scales.year.length, 5);
  assert.equal(openai?.scales.month.length, 12);
  assert.equal(openai?.scales.week.length, 221);
  assert.equal(openai?.scales.day.length, 1541);
  assert.deepEqual(
    openai?.scales.year.map((bucket) => bucket.total),
    [60, 0, 30, 70, 410],
  );
  assert.equal(openai?.scales.week[0]?.key, "2022-01-03");
  assert.equal(openai?.scales.week.at(-1)?.key, "2026-03-23");
  assert.equal(openai?.scales.day[0]?.key, "2022-01-05");
  assert.equal(openai?.scales.day.at(-1)?.key, "2026-03-25");
  assert.equal(openai?.scales.month.at(-1)?.total, 290);
  assert.equal(openai?.scales.week.at(-1)?.total, 170);
  assert.equal(openai?.scales.day.at(-1)?.total, 150);
  assert.deepEqual(openai?.scales.day.at(-1)?.segments, [
    {
      name: "gpt-5.4",
      total: 110,
      color: openai?.modelColors[0]?.color ?? "",
    },
    {
      name: "gpt-5.3-codex",
      total: 40,
      color: openai?.modelColors[1]?.color ?? "",
    },
  ]);
});

test("buildAnalytics uses the preferred vendor row order for the models tab", () => {
  const payload = {
    version: "1",
    start: "2026-04-01",
    end: "2026-04-01",
    updatedAt: "2026-04-01T00:00:00.000Z",
    providers: [
      {
        provider: "codex",
        insights: {
          streaks: {
            longest: 1,
            current: 1,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 100,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 100,
            breakdown: [{ name: "gpt-5.4", tokens: createTokens(100) }],
          },
        ],
      },
      {
        provider: "opencode",
        insights: {
          streaks: {
            longest: 1,
            current: 1,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 40,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 40,
            breakdown: [{ name: "z-ai/glm-5", tokens: createTokens(40) }],
          },
        ],
      },
      {
        provider: "claude",
        insights: {
          streaks: {
            longest: 1,
            current: 1,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 30,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 30,
            breakdown: [
              { name: "claude-4.5-opus", tokens: createTokens(30) },
            ],
          },
        ],
      },
      {
        provider: "gemini",
        insights: {
          streaks: {
            longest: 1,
            current: 1,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 90,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 90,
            breakdown: [
              { name: "gemini-3-pro", tokens: createTokens(90) },
            ],
          },
        ],
      },
    ],
  } satisfies PublishedUsagePayload;

  const analytics = buildAnalytics(payload);

  assert.deepEqual(
    analytics.vendors.map((vendor) => vendor.name),
    ["OpenAI", "Z.AI", "Anthropic", "Google"],
  );
});

test("buildAnalytics assigns stable non-repeating model colors per vendor row", () => {
  const first = buildAnalytics(modelsPayload);
  const second = buildAnalytics(modelsPayload);
  const openaiFirst = first.vendors.find(
    (vendor) => vendor.vendor === "openai",
  );
  const openaiSecond = second.vendors.find(
    (vendor) => vendor.vendor === "openai",
  );

  assert.ok(openaiFirst);
  assert.ok(openaiSecond);
  assert.deepEqual(openaiFirst?.modelColors, openaiSecond?.modelColors);
  assert.equal(
    new Set(openaiFirst?.modelColors.map((model) => model.color)).size,
    openaiFirst?.modelColors.length,
  );
});

test("buildAnalytics groups aliased vendor model names together", () => {
  const payload = {
    version: "1",
    start: "2026-04-01",
    end: "2026-04-03",
    updatedAt: "2026-04-03T00:00:00.000Z",
    providers: [
      {
        provider: "codex",
        insights: {
          mostUsedModel: {
            name: "cliproxyapi/gpt-5.4",
            tokens: createTokens(12),
          },
          recentMostUsedModel: {
            name: "cliproxyapi/gpt-5.4",
            tokens: createTokens(12),
          },
          streaks: {
            longest: 2,
            current: 2,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 10,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 10,
            breakdown: [{ name: "gpt-5.4", tokens: createTokens(10) }],
          },
        {
          date: "2026-04-02",
          input: 12,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 12,
          breakdown: [
              { name: "cliproxyapi/gpt-5.4", tokens: createTokens(12) },
          ],
        },
        {
          date: "2026-04-03",
          input: 8,
          output: 0,
          cache: { input: 0, output: 0 },
          total: 8,
          breakdown: [
            {
              name: "custom:gpt-5.4-[CLIProxy]-24",
              tokens: createTokens(8),
            },
          ],
        },
      ],
    },
      {
        provider: "opencode",
        insights: {
          streaks: {
            longest: 2,
            current: 2,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 20,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 20,
            breakdown: [{ name: "glm-4.7", tokens: createTokens(20) }],
          },
          {
            date: "2026-04-02",
            input: 30,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 30,
            breakdown: [{ name: "glm-4.7-free", tokens: createTokens(30) }],
          },
        ],
      },
    ],
  } satisfies PublishedUsagePayload;

  const analytics = buildAnalytics(payload);
  const openai = analytics.vendors.find((vendor) => vendor.vendor === "openai");
  const zAi = analytics.vendors.find((vendor) => vendor.vendor === "z-ai");
  const codex = analytics.providers.find(
    (provider) => provider.provider === "codex",
  );

  assert.deepEqual(openai?.topModels, [
    {
      name: "gpt-5.4",
      total: 30,
      share: 1,
    },
  ]);
  assert.deepEqual(zAi?.topModels, [
    {
      name: "glm-4.7",
      total: 50,
      share: 1,
    },
  ]);
  assert.deepEqual(openai?.scales.day.at(-1)?.segments, [
    {
      name: "gpt-5.4",
      total: 8,
      color: openai?.modelColors[0]?.color ?? "",
    },
  ]);
  assert.equal(codex?.mostUsedModel?.name, "gpt-5.4");
  assert.equal(codex?.recentMostUsedModel?.name, "gpt-5.4");
});

test("buildAnalytics strips vendor prefixes from provider insight model labels", () => {
  const payload = {
    version: "1",
    start: "2026-04-01",
    end: "2026-04-02",
    updatedAt: "2026-04-02T00:00:00.000Z",
    providers: [
      {
        provider: "opencode",
        insights: {
          mostUsedModel: {
            name: "openai/gpt-5.3-codex",
            tokens: createTokens(90),
          },
          recentMostUsedModel: {
            name: "anthropic/claude-haiku-4.5",
            tokens: createTokens(70),
          },
          streaks: {
            longest: 2,
            current: 2,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 90,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 90,
            breakdown: [
              { name: "openai/gpt-5.3-codex", tokens: createTokens(90) },
            ],
          },
          {
            date: "2026-04-02",
            input: 70,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 70,
            breakdown: [
              { name: "anthropic/claude-haiku-4.5", tokens: createTokens(70) },
            ],
          },
        ],
      },
    ],
  } satisfies PublishedUsagePayload;

  const analytics = buildAnalytics(payload);
  const opencode = analytics.providers.find(
    (provider) => provider.provider === "opencode",
  );

  assert.equal(opencode?.mostUsedModel?.name, "gpt-5.3-codex");
  assert.equal(opencode?.recentMostUsedModel?.name, "claude-haiku-4.5");
  assert.deepEqual(opencode?.topModels, [
    {
      name: "gpt-5.3-codex",
      total: 90,
      share: 90 / 160,
    },
    {
      name: "claude-haiku-4.5",
      total: 70,
      share: 70 / 160,
    },
  ]);
});

test("buildAnalytics merges Kimi K2 vendor aliases into shared model bars", () => {
  const payload = {
    version: "1",
    start: "2026-04-01",
    end: "2026-04-04",
    updatedAt: "2026-04-04T00:00:00.000Z",
    providers: [
      {
        provider: "opencode",
        insights: {
          streaks: {
            longest: 4,
            current: 4,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 20,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 20,
            breakdown: [{ name: "kimi-k2", tokens: createTokens(20) }],
          },
          {
            date: "2026-04-02",
            input: 30,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 30,
            breakdown: [
              { name: "kimi-k2-thinking", tokens: createTokens(30) },
            ],
          },
          {
            date: "2026-04-03",
            input: 40,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 40,
            breakdown: [{ name: "kimi-k2-0905", tokens: createTokens(40) }],
          },
          {
            date: "2026-04-04",
            input: 50,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 50,
            breakdown: [
              { name: "kimi-k2.5", tokens: createTokens(35) },
              { name: "kimi-k2.5-free", tokens: createTokens(15) },
            ],
          },
        ],
      },
    ],
  } satisfies PublishedUsagePayload;

  const analytics = buildAnalytics(payload);
  const moonshot = analytics.vendors.find(
    (vendor) => vendor.vendor === "moonshot",
  );

  assert.deepEqual(moonshot?.topModels, [
    {
      name: "kimi-k2",
      total: 90,
      share: 90 / 140,
    },
    {
      name: "kimi-k2.5",
      total: 50,
      share: 50 / 140,
    },
  ]);
  assert.deepEqual(moonshot?.modelColors.map((model) => model.name), [
    "kimi-k2.5",
    "kimi-k2",
  ]);
  assert.ok(
    readHslLightness(moonshot?.modelColors[0]?.color ?? "") <
      readHslLightness(moonshot?.modelColors[1]?.color ?? ""),
  );
  assert.deepEqual(moonshot?.scales.day.map((bucket) => bucket.segments), [
    [
      {
        name: "kimi-k2",
        total: 20,
        color: moonshot?.modelColors[1]?.color ?? "",
      },
    ],
    [
      {
        name: "kimi-k2",
        total: 30,
        color: moonshot?.modelColors[1]?.color ?? "",
      },
    ],
    [
      {
        name: "kimi-k2",
        total: 40,
        color: moonshot?.modelColors[1]?.color ?? "",
      },
    ],
    [
      {
        name: "kimi-k2.5",
        total: 50,
        color: moonshot?.modelColors[0]?.color ?? "",
      },
    ],
  ]);
});

test("buildAnalytics merges the current dataset's obvious vendor alias wrappers", () => {
  const payload = {
    version: "1",
    start: "2026-04-01",
    end: "2026-04-02",
    updatedAt: "2026-04-02T00:00:00.000Z",
    providers: [
      {
        provider: "hermes",
        insights: {
          streaks: {
            longest: 2,
            current: 2,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 10,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 10,
            breakdown: [
              {
                name: "antigravity-claude-opus-4-5-thinking",
                tokens: createTokens(10),
              },
            ],
          },
          {
            date: "2026-04-02",
            input: 20,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 20,
            breakdown: [
              { name: "claude-opus-4.5", tokens: createTokens(20) },
            ],
          },
        ],
      },
      {
        provider: "gemini",
        insights: {
          streaks: {
            longest: 2,
            current: 2,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 30,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 30,
            breakdown: [
              { name: "star-gemini-3-flash", tokens: createTokens(30) },
            ],
          },
          {
            date: "2026-04-02",
            input: 40,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 40,
            breakdown: [
              {
                name: "gemini-3-flash-thinking",
                tokens: createTokens(40),
              },
            ],
          },
        ],
      },
      {
        provider: "opencode",
        insights: {
          streaks: {
            longest: 2,
            current: 2,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 50,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 50,
            breakdown: [
              { name: "glm-4.6-thinking", tokens: createTokens(50) },
            ],
          },
          {
            date: "2026-04-02",
            input: 60,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 60,
            breakdown: [
              { name: "deepseek-r1-openrouter", tokens: createTokens(60) },
              { name: "minimax-m2.7:cloud", tokens: createTokens(70) },
            ],
          },
        ],
      },
      {
        provider: "codex",
        insights: {
          streaks: {
            longest: 2,
            current: 2,
          },
        },
        daily: [
          {
            date: "2026-04-01",
            input: 80,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 80,
            breakdown: [
              { name: "gpt-5.1-thinking", tokens: createTokens(80) },
            ],
          },
          {
            date: "2026-04-02",
            input: 90,
            output: 0,
            cache: { input: 0, output: 0 },
            total: 90,
            breakdown: [
              { name: "gpt-5.1", tokens: createTokens(90) },
            ],
          },
        ],
      },
    ],
  } satisfies PublishedUsagePayload;

  const analytics = buildAnalytics(payload);
  const anthropic = analytics.vendors.find(
    (vendor) => vendor.vendor === "anthropic",
  );
  const google = analytics.vendors.find((vendor) => vendor.vendor === "google");
  const zAi = analytics.vendors.find((vendor) => vendor.vendor === "z-ai");
  const deepseek = analytics.vendors.find(
    (vendor) => vendor.vendor === "deepseek",
  );
  const minimax = analytics.vendors.find(
    (vendor) => vendor.vendor === "minimax",
  );
  const openai = analytics.vendors.find((vendor) => vendor.vendor === "openai");

  assert.deepEqual(anthropic?.topModels, [
    {
      name: "claude-4.5-opus",
      total: 30,
      share: 1,
    },
  ]);
  assert.deepEqual(google?.topModels, [
    {
      name: "gemini-3-flash",
      total: 70,
      share: 1,
    },
  ]);
  assert.deepEqual(zAi?.topModels, [
    {
      name: "glm-4.6",
      total: 50,
      share: 1,
    },
  ]);
  assert.deepEqual(deepseek?.topModels, [
    {
      name: "deepseek-r1",
      total: 60,
      share: 1,
    },
  ]);
  assert.deepEqual(minimax?.topModels, [
    {
      name: "minimax-m2.7",
      total: 70,
      share: 1,
    },
  ]);
  assert.deepEqual(openai?.topModels, [
    {
      name: "gpt-5.1",
      total: 170,
      share: 1,
    },
  ]);
});

test("buildAnalytics returns both provider and vendor analytics", () => {
  const analytics = buildAnalytics(detailsPayload);

  assert.deepEqual(Object.keys(analytics), ["providers", "vendors"]);
  assert.equal(analytics.providers.length, 2);
  assert.equal(analytics.vendors.length, 2);
});
