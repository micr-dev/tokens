import assert from "node:assert/strict";
import test from "node:test";
import {
  JSON_EXPORT_VERSION,
  mergeJsonExportsToPublishedUsage,
  type PublishedUsagePayload,
} from "../src/lib/export";

function payload(
  provider: "claude" | "codex",
  daily: Array<{
    date: string;
    input: number;
    output: number;
    total: number;
    model: string;
  }>,
) {
  return {
    version: JSON_EXPORT_VERSION,
    start: "2026-03-10",
    end: "2026-03-15",
    providers: [
      {
        provider,
        daily: daily.map((row) => ({
          date: row.date,
          input: row.input,
          output: row.output,
          cache: { input: 0, output: 0 },
          total: row.total,
          breakdown: [
            {
              name: row.model,
              tokens: {
                input: row.input,
                output: row.output,
                cache: { input: 0, output: 0 },
                total: row.total,
              },
            },
          ],
        })),
        insights: {
          streaks: { current: 999, longest: 999 },
        },
      },
    ],
  };
}

function byProvider(payload: PublishedUsagePayload) {
  return new Map(payload.providers.map((provider) => [provider.provider, provider]));
}

test("mergeJsonExportsToPublishedUsage merges overlapping days and models per provider", () => {
  const merged = mergeJsonExportsToPublishedUsage([
    payload("claude", [
      {
        date: "2026-03-14",
        input: 10,
        output: 5,
        total: 15,
        model: "claude-sonnet",
      },
      {
        date: "2026-03-15",
        input: 7,
        output: 3,
        total: 10,
        model: "claude-sonnet",
      },
    ]),
    payload("codex", [
      {
        date: "2026-03-14",
        input: 2,
        output: 8,
        total: 10,
        model: "gpt-5",
      },
    ]),
  ]);
  const providers = byProvider(merged);
  const claude = providers.get("claude");
  const codex = providers.get("codex");
  const claudeRows = new Map(claude?.daily.map((row) => [row.date, row]));
  const codexRows = new Map(codex?.daily.map((row) => [row.date, row]));
  const claudeMarch14 = claudeRows.get("2026-03-14");
  const claudeMarch15 = claudeRows.get("2026-03-15");
  const codexMarch14 = codexRows.get("2026-03-14");

  assert.equal(merged.start, "2026-03-10");
  assert.equal(merged.end, "2026-03-15");
  assert.equal(merged.providers.length, 2);
  assert.equal(claudeMarch14?.total, 15);
  assert.equal(claudeMarch14?.input, 10);
  assert.equal(claudeMarch14?.output, 5);
  assert.deepEqual(
    claudeMarch14?.breakdown.map((model) => [model.name, model.tokens.total]),
    [["claude-sonnet", 15]],
  );
  assert.equal(claudeMarch15?.total, 10);
  assert.equal(codexMarch14?.total, 10);
  assert.equal(claude?.insights?.streaks.current, 2);
  assert.equal(claude?.insights?.streaks.longest, 2);
  assert.equal(claude?.insights?.mostUsedModel?.name, "claude-sonnet");
  assert.equal(codex?.insights?.mostUsedModel?.name, "gpt-5");
});

test("mergeJsonExportsToPublishedUsage rejects unsupported versions", () => {
  assert.throws(
    () =>
      mergeJsonExportsToPublishedUsage([
        {
          ...payload("claude", []),
          version: "2025-01-01",
        },
      ]),
    /Unsupported import version/,
  );
});

test("mergeJsonExportsToPublishedUsage rejects merged all-provider imports", () => {
  assert.throws(
    () =>
      mergeJsonExportsToPublishedUsage([
        {
          version: JSON_EXPORT_VERSION,
          start: "2026-03-10",
          end: "2026-03-15",
          providers: [
            {
              provider: "all",
              daily: [],
              insights: {
                streaks: { current: 0, longest: 0 },
              },
            },
          ],
        },
      ]),
    /without --all/,
  );
});
