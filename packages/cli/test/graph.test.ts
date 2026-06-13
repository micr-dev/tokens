import assert from "node:assert/strict";
import test from "node:test";
import { heatmapThemes, renderUsageHeatmapsSvg } from "../src/graph";

test("renderUsageHeatmapsSvg renders stacked provider sections", () => {
  const svg = renderUsageHeatmapsSvg({
    startDate: new Date("2026-03-14T00:00:00"),
    endDate: new Date("2026-03-15T00:00:00"),
    colorMode: "light",
    sections: [
      {
        daily: [
          {
            date: new Date("2026-03-15T00:00:00"),
            input: 10,
            output: 5,
            cache: { input: 2, output: 0 },
            total: 15,
            displayValue: 15,
            breakdown: [
              {
                name: "gpt-5",
                tokens: {
                  input: 10,
                  output: 5,
                  cache: { input: 2, output: 0 },
                  total: 15,
                },
              },
            ],
          },
        ],
        insights: {
          mostUsedModel: {
            name: "gpt-5",
            tokens: {
              input: 10,
              output: 5,
              cache: { input: 2, output: 0 },
              total: 15,
            },
          },
          streaks: { current: 1, longest: 1 },
        },
        title: heatmapThemes.codex.title,
        titleCaption: heatmapThemes.codex.titleCaption,
        colors: heatmapThemes.codex.colors,
      },
      {
        daily: [
          {
            date: new Date("2026-03-14T00:00:00"),
            input: 4,
            output: 6,
            cache: { input: 0, output: 0 },
            total: 10,
            displayValue: 10,
            breakdown: [
              {
                name: "glm-4.7",
                tokens: {
                  input: 4,
                  output: 6,
                  cache: { input: 0, output: 0 },
                  total: 10,
                },
              },
            ],
          },
        ],
        insights: {
          mostUsedModel: {
            name: "glm-4.7",
            tokens: {
              input: 4,
              output: 6,
              cache: { input: 0, output: 0 },
              total: 10,
            },
          },
          streaks: { current: 1, longest: 1 },
        },
        title: heatmapThemes.opencode.title,
        titleCaption: heatmapThemes.opencode.titleCaption,
        colors: heatmapThemes.opencode.colors,
      },
    ],
  });

  assert.match(svg, />Codex<\/text>/);
  assert.match(svg, />Open Code<\/text>/);
});

test("heatmapThemes includes Antigravity CLI provider theme", () => {
  assert.equal(heatmapThemes.agy.title, "Antigravity CLI");
  assert.equal(heatmapThemes.agy.titleCaption, undefined);
  assert.equal(heatmapThemes.agy.colors.light[3], "#ef4444");
});

test("dark heatmap themes increase usage with saturation instead of pale colors", () => {
  assert.deepEqual(heatmapThemes.all.colors.dark, [
    "#1c2b22",
    "#14532d",
    "#166534",
    "#16a34a",
    "#22c55e",
  ]);
  assert.equal(heatmapThemes.agy.colors.dark.at(-1), "#ef4444");
  assert.equal(heatmapThemes.codex.colors.dark.at(-1), "#6366f1");
  assert.equal(heatmapThemes.claude.colors.dark.at(-1), "#f97316");

  for (const theme of Object.values(heatmapThemes)) {
    assert.doesNotMatch(theme.colors.dark.join(","), /#(?:bbf7d0|c7d2fe|fdba74|fecaca|fafafa)/i);
  }
});

test("renderUsageHeatmapsSvg adds structured tooltip payloads for active cells", () => {
  const svg = renderUsageHeatmapsSvg({
    startDate: new Date("2026-03-15T00:00:00"),
    endDate: new Date("2026-03-15T00:00:00"),
    colorMode: "light",
    sections: [
      {
        daily: [
          {
            date: new Date("2026-03-15T00:00:00"),
            input: 10,
            output: 5,
            cache: { input: 2, output: 1 },
            total: 15,
            displayValue: 15,
            breakdown: [
              {
                name: "gpt-5",
                tokens: {
                  input: 10,
                  output: 5,
                  cache: { input: 2, output: 1 },
                  total: 15,
                },
              },
            ],
          },
        ],
        insights: {
          streaks: { current: 1, longest: 1 },
        },
        title: heatmapThemes.codex.title,
        titleCaption: heatmapThemes.codex.titleCaption,
        colors: heatmapThemes.codex.colors,
      },
    ],
  });

  assert.doesNotMatch(svg, /<title>/);
  assert.match(
    svg,
    /<desc>\{"provider":"Codex","date":"Mar 15, 2026","total":"15","input":"10","output":"5","cacheInput":"2","cacheOutput":"1","topModel":"gpt-5","topModelTokens":"15"\}<\/desc>/,
  );
});
