import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { loadT3PublishedSummary } from "../lib/t3-chat";

function createTempWorkspace(label: string) {
  return mkdtempSync(join(tmpdir(), `slopmeter-${label}-`));
}

function ensureParent(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function writeJsonFile(path: string, value: unknown) {
  ensureParent(path);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("loadT3PublishedSummary extracts provider-specific token fields from a one-time export", async (t) => {
  const workspace = createTempWorkspace("t3");
  const exportPath = join(workspace, "t3-chat-export.json");

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  writeJsonFile(exportPath, {
    version: 1,
    threads: [],
    messages: [
      {
        role: "assistant",
        model: "claude-sonnet-20250219",
        created_at: "2026-03-14T10:00:00.000Z",
        providerMetadata: {
          anthropic: {
            usage: {
              input_tokens: 100,
              output_tokens: 40,
              cache_read_input_tokens: 10,
              cache_creation_input_tokens: 5,
            },
          },
        },
      },
      {
        role: "assistant",
        model: "kimi-k2-thinking",
        created_at: "2026-03-14T14:00:00.000Z",
        providerMetadata: {
          openrouter: {
            usage: {
              promptTokens: 50,
              completionTokens: 20,
              totalTokens: 70,
              promptTokensDetails: {
                cachedTokens: 8,
              },
            },
          },
        },
      },
      {
        role: "assistant",
        model: "gemini-3-flash-thinking",
        created_at: "2026-03-15T11:00:00.000Z",
        providerMetadata: {
          google: {
            usageMetadata: {
              promptTokenCount: 30,
              candidatesTokenCount: 10,
              thoughtsTokenCount: 15,
              totalTokenCount: 55,
            },
          },
        },
      },
      {
        role: "assistant",
        model: "gpt-5.2-instant",
        created_at: "2026-03-15T13:00:00.000Z",
        tokens: 25,
        providerMetadata: {
          openai: {
            cachedPromptTokens: 7,
          },
        },
      },
      {
        role: "user",
        model: "ignored-user-message",
        created_at: "2026-03-15T14:00:00.000Z",
        tokens: 999,
      },
    ],
  });

  const summary = await loadT3PublishedSummary(
    exportPath,
    new Date("2026-03-14T00:00:00.000Z"),
    new Date("2026-03-15T23:59:59.999Z"),
  );

  assert.equal(summary?.provider, "t3");
  assert.deepEqual(
    summary?.daily.map((day) => ({
      date: day.date,
      input: day.input,
      output: day.output,
      cache: day.cache,
      total: day.total,
      models: day.breakdown.map((model) => [model.name, model.tokens.total]),
    })),
    [
      {
        date: "2026-03-14",
        input: 160,
        output: 65,
        cache: { input: 18, output: 5 },
        total: 225,
        models: [
          ["claude-sonnet", 155],
          ["kimi-k2-thinking", 70],
        ],
      },
      {
        date: "2026-03-15",
        input: 37,
        output: 35,
        cache: { input: 7, output: 0 },
        total: 72,
        models: [
          ["gemini-3-flash-thinking", 40],
          ["gpt-5.2-instant", 32],
        ],
      },
    ],
  );
  assert.equal(summary?.insights?.mostUsedModel?.name, "claude-sonnet");
});

test("loadT3PublishedSummary fails fast when the export has no usable assistant token data", async (t) => {
  const workspace = createTempWorkspace("t3-empty");
  const exportPath = join(workspace, "t3-chat-export.json");

  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  writeJsonFile(exportPath, {
    version: 1,
    threads: [],
    messages: [
      {
        role: "assistant",
        model: "unknown-model",
        created_at: "2026-03-15T10:00:00.000Z",
      },
    ],
  });

  await assert.rejects(
    () =>
      loadT3PublishedSummary(
        exportPath,
        new Date("2026-03-14T00:00:00.000Z"),
        new Date("2026-03-15T23:59:59.999Z"),
      ),
    /No usable T3 assistant token data found/,
  );
});
