import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOpenCodeRecoveryExportMessageFromJsonlRecord,
  buildOpenCodeRecoveryExportPayload,
  buildOpenCodeRecoveryExportPayloadFromMessages,
  summarizeOpenCodeRecoveryExportPayload,
  type OpenCodeRecoveryMergedMessageRow,
} from "../scripts/lib/opencode-recovery";

test("buildOpenCodeRecoveryExportPayload converts salvage rows into a T3-compatible recovery import", () => {
  const rows: OpenCodeRecoveryMergedMessageRow[] = [
    {
      source_file: "/tmp/source-a.sqlite",
      id: "msg_recovered_1",
      session_id: "ses_recovered_1",
      time_created: 1771122628523,
      time_created_utc: "2026-02-15 02:30:28",
      role: "assistant",
      model_id: "gpt-5.3-codex",
      provider_id: "openai",
      data: JSON.stringify({
        role: "assistant",
        modelID: "gpt-5.3-codex",
        providerID: "openai",
        time: { created: 1771122628523 },
        tokens: {
          total: 80799,
          input: 23071,
          output: 1152,
          cache: {
            read: 56576,
            write: 0,
          },
        },
      }),
    },
    {
      source_file: "/tmp/source-b.sqlite",
      id: "msg_ignored_user",
      session_id: "ses_recovered_1",
      time_created: 1771122629000,
      time_created_utc: "2026-02-15 02:30:29",
      role: "user",
      model_id: null,
      provider_id: null,
      data: JSON.stringify({
        role: "user",
        time: { created: 1771122629000 },
      }),
    },
    {
      source_file: "/tmp/source-c.sqlite",
      id: "msg_ignored_empty",
      session_id: "ses_recovered_2",
      time_created: 1771122630000,
      time_created_utc: "2026-02-15 02:30:30",
      role: "assistant",
      model_id: "gpt-5.2",
      provider_id: "openai",
      data: JSON.stringify({
        role: "assistant",
        modelID: "gpt-5.2",
        providerID: "openai",
        time: { created: 1771122630000 },
        tokens: {
          total: 0,
        },
      }),
    },
    {
      source_file: "/tmp/source-d.sqlite",
      id: "msg_sparse_row",
      session_id: "ses_recovered_2",
      time_created: 1771122631000,
      time_created_utc: "2026-02-15 02:30:31",
      role: null,
      model_id: null,
      provider_id: null,
      data: "",
    },
  ];
  const payload = buildOpenCodeRecoveryExportPayload(
    rows,
    "opencode-salvage-merged.db",
  );
  const summary = summarizeOpenCodeRecoveryExportPayload(payload);

  assert.equal(payload.version, 1);
  assert.deepEqual(payload.threads, []);
  assert.equal(payload.messages.length, 1);
  assert.deepEqual(payload.messages[0], {
    id: "msg_recovered_1",
    threadId: "ses_recovered_1",
    role: "assistant",
    model: "gpt-5.3-codex",
    created_at: "2026-02-15T02:30:28.523Z",
    providerMetadata: {
      anthropic: {
        usage: {
          input_tokens: 23071,
          output_tokens: 1152,
          cache_read_input_tokens: 56576,
          cache_creation_input_tokens: 0,
        },
      },
    },
    recovery: {
      source: "opencode-salvage-merged.db",
      provider_id: "openai",
      original_message_id: "msg_recovered_1",
      session_id: "ses_recovered_1",
      source_file: "/tmp/source-a.sqlite",
    },
  });
  assert.deepEqual(summary, {
    messageCount: 1,
    firstCreatedAt: "2026-02-15T02:30:28.523Z",
    lastCreatedAt: "2026-02-15T02:30:28.523Z",
    dayCount: 1,
  });
});

test("buildOpenCodeRecoveryExportMessageFromJsonlRecord converts clean recovered JSONL rows and dedupes by id", () => {
  const message = buildOpenCodeRecoveryExportMessageFromJsonlRecord(
    {
      id: "02828c22",
      parentId: "b34290a3",
      timestamp: "2026-03-21T22:46:32.328Z",
      message: {
        role: "assistant",
        model: "gpt-5.4",
        provider: "cliproxyapi",
        usage: {
          input: 41438,
          output: 999,
          cacheRead: 41088,
          cacheWrite: 0,
          totalTokens: 83525,
        },
      },
    },
    "all-recovered-messages-clean.jsonl",
  );

  assert.deepEqual(message, {
    id: "02828c22",
    threadId: "b34290a3",
    role: "assistant",
    model: "gpt-5.4",
    created_at: "2026-03-21T22:46:32.328Z",
    providerMetadata: {
      anthropic: {
        usage: {
          input_tokens: 41438,
          output_tokens: 999,
          cache_read_input_tokens: 41088,
          cache_creation_input_tokens: 0,
        },
      },
    },
    recovery: {
      source: "all-recovered-messages-clean.jsonl",
      provider_id: "cliproxyapi",
      original_message_id: "02828c22",
      session_id: "b34290a3",
    },
  });

  const payload = buildOpenCodeRecoveryExportPayloadFromMessages([
    message!,
    {
      ...message!,
      created_at: "2026-03-22T00:00:00.000Z",
    },
    {
      ...message!,
      id: "bfdaf386",
      threadId: "8520994b",
      created_at: "2026-03-16T02:15:22.648Z",
      recovery: {
        source: "all-recovered-messages-clean.jsonl",
        provider_id: "openai-codex",
        original_message_id: "bfdaf386",
        session_id: "8520994b",
      },
    },
  ]);

  assert.deepEqual(
    payload.messages.map((entry) => ({ id: entry.id, created_at: entry.created_at })),
    [
      { id: "bfdaf386", created_at: "2026-03-16T02:15:22.648Z" },
      { id: "02828c22", created_at: "2026-03-21T22:46:32.328Z" },
    ],
  );
});
