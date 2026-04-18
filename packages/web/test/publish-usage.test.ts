import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBundledPublishedDataModule,
  buildPublishedBackupPaths,
  mergePublishedUsagePayloads,
  writePublishedBackupArtifacts,
} from "../scripts/publish-usage";

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
        {
          provider: "droid",
          daily: [
            {
              date: "2026-03-19",
              input: 5,
              output: 2,
              cache: { input: 0, output: 0 },
              total: 7,
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
    opencodeDailyRecoveryPayload: null,
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
    ["codex", "opencode", "droid", "gemini", "claude", "t3"],
  );
  assert.equal(merged.providers[0].daily[0]?.total, 10);
  assert.equal(merged.providers[1].daily[0]?.total, 6);
  assert.equal(merged.providers[2].daily[0]?.total, 7);
  assert.equal(merged.providers[3].daily[0]?.total, 5);
  assert.equal(merged.providers[4].daily[0]?.total, 12);
});

test("mergePublishedUsagePayloads appends recovered OpenCode import into the opencode provider", () => {
  const merged = mergePublishedUsagePayloads({
    currentPayload: {
      version: "2026-03-03",
      start: "2026-02-15",
      end: "2026-03-20",
      providers: [
        {
          provider: "opencode",
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
          provider: "opencode",
          daily: [
            {
              date: "2026-02-15",
              input: 11,
              output: 4,
              cache: { input: 2, output: 0 },
              total: 15,
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
      ],
    },
    hostedPayload: null,
    importedPayload: null,
    opencodeDailyRecoveryPayload: null,
    t3Summary: null,
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
  });

  const opencode = merged.providers.find(
    (provider) => provider.provider === "opencode",
  );

  assert.deepEqual(
    opencode?.daily.map((row) => [row.date, row.total]),
    [
      ["2026-02-15", 15],
      ["2026-03-20", 10],
    ],
  );
});

test("mergePublishedUsagePayloads fills missing opencode dates from the daily recovery import", () => {
  const merged = mergePublishedUsagePayloads({
    currentPayload: {
      version: "2026-03-03",
      start: "2026-03-15",
      end: "2026-03-20",
      providers: [
        {
          provider: "opencode",
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
      ],
    },
    hostedPayload: {
      version: "2026-03-03",
      start: "2026-03-15",
      end: "2026-03-20",
      updatedAt: "2026-03-20T00:00:00.000Z",
      providers: [
        {
          provider: "opencode",
          daily: [
            {
              date: "2026-03-18",
              input: 2,
              output: 1,
              cache: { input: 0, output: 0 },
              total: 3,
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
    importedPayload: {
      version: "2026-03-03",
      start: "2026-03-15",
      end: "2026-03-20",
      providers: [
        {
          provider: "opencode",
          daily: [
            {
              date: "2026-03-18",
              input: 3,
              output: 1,
              cache: { input: 0, output: 0 },
              total: 4,
              breakdown: [],
            },
          ],
        },
      ],
    },
    opencodeDailyRecoveryPayload: {
      version: "2026-03-03",
      start: "2026-03-15",
      end: "2026-03-20",
      providers: [
        {
          provider: "opencode",
          daily: [
            {
              date: "2026-03-17",
              input: 11,
              output: 4,
              cache: { input: 0, output: 0 },
              total: 15,
              breakdown: [],
            },
            {
              date: "2026-03-18",
              input: 20,
              output: 5,
              cache: { input: 0, output: 0 },
              total: 25,
              breakdown: [],
            },
          ],
          insights: {
            streaks: {
              longest: 2,
              current: 0,
            },
          },
        },
      ],
    },
    t3Summary: null,
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
  });

  const opencode = merged.providers.find(
    (provider) => provider.provider === "opencode",
  );

  assert.deepEqual(
    opencode?.daily.map((row) => [row.date, row.total]),
    [
      ["2026-03-17", 15],
      ["2026-03-18", 25],
      ["2026-03-20", 10],
    ],
  );
});

test("mergePublishedUsagePayloads drops the known bad Claude dates and recomputes insights", () => {
  const merged = mergePublishedUsagePayloads({
    currentPayload: {
      version: "2026-03-03",
      start: "2026-03-10",
      end: "2026-03-20",
      providers: [
        {
          provider: "claude",
          daily: [
            {
              date: "2026-03-10",
              input: 30,
              output: 10,
              cache: { input: 0, output: 0 },
              total: 40,
              breakdown: [
                {
                  name: "claude-sonnet-4.5",
                  tokens: {
                    input: 30,
                    output: 10,
                    cache: { input: 0, output: 0 },
                    total: 40,
                  },
                },
              ],
            },
            {
              date: "2026-03-17",
              input: 20,
              output: 5,
              cache: { input: 0, output: 0 },
              total: 25,
              breakdown: [
                {
                  name: "claude-sonnet-4.5",
                  tokens: {
                    input: 20,
                    output: 5,
                    cache: { input: 0, output: 0 },
                    total: 25,
                  },
                },
              ],
            },
            {
              date: "2026-03-18",
              input: 4,
              output: 2,
              cache: { input: 0, output: 0 },
              total: 6,
              breakdown: [
                {
                  name: "claude-opus-4.5",
                  tokens: {
                    input: 4,
                    output: 2,
                    cache: { input: 0, output: 0 },
                    total: 6,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    hostedPayload: null,
    importedPayload: null,
    opencodeDailyRecoveryPayload: null,
    t3Summary: null,
    updatedAt: new Date("2026-03-20T00:00:00.000Z"),
  });

  const claude = merged.providers.find(
    (provider) => provider.provider === "claude",
  );

  assert.deepEqual(
    claude?.daily.map((row) => [row.date, row.total]),
    [["2026-03-18", 6]],
  );
  assert.equal(claude?.insights?.mostUsedModel?.name, "claude-opus-4.5");
  assert.equal(claude?.insights?.recentMostUsedModel?.name, "claude-opus-4.5");
  assert.deepEqual(claude?.insights?.streaks, {
    longest: 1,
    current: 0,
  });
});

test("mergePublishedUsagePayloads preserves canonical hosted rows over overlapping current rows", () => {
  const merged = mergePublishedUsagePayloads({
    currentPayload: {
      version: "2026-03-03",
      start: "2026-04-12",
      end: "2026-04-15",
      providers: [
        {
          provider: "codex",
          daily: [
            {
              date: "2026-04-13",
              input: 7,
              output: 3,
              cache: { input: 0, output: 0 },
              total: 10,
              breakdown: [],
            },
          ],
        },
      ],
    },
    hostedPayload: {
      version: "2026-03-03",
      start: "2026-04-12",
      end: "2026-04-15",
      updatedAt: "2026-04-15T00:00:00.000Z",
      providers: [
        {
          provider: "codex",
          daily: [
            {
              date: "2026-04-13",
              input: 70,
              output: 30,
              cache: { input: 0, output: 0 },
              total: 100,
              breakdown: [],
            },
            {
              date: "2026-04-12",
              input: 4,
              output: 2,
              cache: { input: 0, output: 0 },
              total: 6,
              breakdown: [],
            },
          ],
          insights: {
            streaks: {
              longest: 2,
              current: 2,
            },
          },
        },
      ],
    },
    importedPayload: null,
    opencodeDailyRecoveryPayload: null,
    t3Summary: null,
    updatedAt: new Date("2026-04-15T00:00:00.000Z"),
  });

  const codex = merged.providers.find(
    (provider) => provider.provider === "codex",
  );

  assert.deepEqual(
    codex?.daily.map((row) => [row.date, row.total]),
    [
      ["2026-04-12", 6],
      ["2026-04-13", 100],
    ],
  );
});

test("buildPublishedBackupPaths creates filesystem-safe snapshot paths", () => {
  const paths = buildPublishedBackupPaths(
    "/tmp/slopmeter-history",
    new Date("2026-04-15T21:30:45.123Z"),
  );

  assert.equal(
    paths.snapshotDir,
    "/tmp/slopmeter-history/2026-04-15T21-30-45-123Z",
  );
  assert.equal(
    paths.jsonPath,
    "/tmp/slopmeter-history/2026-04-15T21-30-45-123Z/daily-usage.json",
  );
  assert.equal(
    paths.svgPath,
    "/tmp/slopmeter-history/2026-04-15T21-30-45-123Z/heatmap-last-year.svg",
  );
});

test("writePublishedBackupArtifacts writes versioned json and svg snapshots", () => {
  const historyDir = mkdtempSync(join(tmpdir(), "slopmeter-history-"));
  const payload = mergePublishedUsagePayloads({
    currentPayload: {
      version: "2026-03-03",
      start: "2026-04-12",
      end: "2026-04-15",
      providers: [
        {
          provider: "codex",
          daily: [
            {
              date: "2026-04-13",
              input: 7,
              output: 3,
              cache: { input: 0, output: 0 },
              total: 10,
              breakdown: [],
            },
          ],
        },
      ],
    },
    hostedPayload: null,
    importedPayload: null,
    opencodeDailyRecoveryPayload: null,
    t3Summary: null,
    updatedAt: new Date("2026-04-15T00:00:00.000Z"),
  });
  const svg = "<svg>ok</svg>";

  const paths = writePublishedBackupArtifacts({
    historyDir,
    payload,
    svg,
    updatedAt: new Date("2026-04-15T21:30:45.123Z"),
  });

  assert.equal(existsSync(paths.jsonPath), true);
  assert.equal(existsSync(paths.svgPath), true);
  assert.match(readFileSync(paths.jsonPath, "utf8"), /"provider": "codex"/);
  assert.equal(readFileSync(paths.svgPath, "utf8"), svg);
});


test("buildBundledPublishedDataModule emits a typed module with payload and svg", () => {
  const payload = mergePublishedUsagePayloads({
    currentPayload: {
      version: "2026-03-03",
      start: "2026-04-12",
      end: "2026-04-15",
      providers: [
        {
          provider: "codex",
          daily: [
            {
              date: "2026-04-13",
              input: 7,
              output: 3,
              cache: { input: 0, output: 0 },
              total: 10,
              breakdown: [],
            },
          ],
        },
      ],
    },
    hostedPayload: null,
    importedPayload: null,
    opencodeDailyRecoveryPayload: null,
    t3Summary: null,
    updatedAt: new Date("2026-04-15T00:00:00.000Z"),
  });

  const moduleSource = buildBundledPublishedDataModule(payload, "<svg>ok</svg>");

  assert.match(moduleSource, /publishedUsagePayload/);
  assert.match(moduleSource, /publishedSvgMarkup/);
  assert.match(moduleSource, /<svg>ok<\/svg>/);
  assert.match(moduleSource, /"provider": "codex"/);
});
