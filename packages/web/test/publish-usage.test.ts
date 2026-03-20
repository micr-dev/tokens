import assert from "node:assert/strict";
import test from "node:test";
import { mergePublishedUsagePayloads } from "../scripts/publish-usage";

test("mergePublishedUsagePayloads preserves hosted providers and applies canonical web order", () => {
  const merged = mergePublishedUsagePayloads({
    currentPayload: {
      version: "2026-03-03",
      start: "2025-03-20",
      end: "2026-03-20",
      providers: [
        {
          provider: "codex",
          daily: [
            {
              date: "2026-03-20",
              input: 7,
              output: 3,
              cache: { input: 0, output: 0 },
              total: 10,
              breakdown: [],
            },
          ],
        },
        {
          provider: "gemini",
          daily: [
            {
              date: "2026-03-20",
              input: 3,
              output: 2,
              cache: { input: 0, output: 0 },
              total: 5,
              breakdown: [],
            },
          ],
        },
      ],
    },
    hostedPayload: {
      version: "2026-03-03",
      start: "2025-03-20",
      end: "2026-03-20",
      updatedAt: "2026-03-19T00:00:00.000Z",
      providers: [
        {
          provider: "claude",
          daily: [
            {
              date: "2026-03-19",
              input: 8,
              output: 4,
              cache: { input: 0, output: 0 },
              total: 12,
              breakdown: [],
            },
          ],
          insights: {
            streaks: {
              longest: 1,
              current: 1,
            },
          },
        },
        {
          provider: "opencode",
          daily: [
            {
              date: "2026-03-19",
              input: 4,
              output: 2,
              cache: { input: 0, output: 0 },
              total: 6,
              breakdown: [],
            },
          ],
          insights: {
            streaks: {
              longest: 1,
              current: 1,
            },
          },
        },
      ],
    },
    importedPayload: null,
    t3Summary: {
      provider: "t3",
      daily: [
        {
          date: "2026-03-18",
          input: 1,
          output: 1,
          cache: { input: 0, output: 0 },
          total: 2,
          breakdown: [],
        },
      ],
      insights: {
        streaks: {
          longest: 1,
          current: 0,
        },
      },
    },
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
  });

  assert.deepEqual(
    merged.providers.map((provider) => provider.provider),
    ["codex", "opencode", "gemini", "claude", "t3"],
  );
  assert.equal(merged.providers[0].daily[0]?.total, 10);
  assert.equal(merged.providers[1].daily[0]?.total, 6);
  assert.equal(merged.providers[2].daily[0]?.total, 5);
  assert.equal(merged.providers[3].daily[0]?.total, 12);
});
