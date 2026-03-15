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

test("renderUsageHeatmapsSvg adds native hover titles for active cells", () => {
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

  assert.match(svg, /<title>Codex\nMar 15, 2026\nTotal: 15\nInput: 10\nOutput: 5\nCache input: 2\nCache output: 1\nTop model: gpt-5 \(15\)<\/title>/);
});
