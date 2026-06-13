export const DEFAULT_OPENCODE_RECOVERY_SOURCE_DB_PATH =
  "/home/ubuntu/.local/share/opencode/recovery/opencode-salvage-merged.db";

export interface OpenCodeRecoveryTokens {
  total?: number;
  input?: number;
  output?: number;
  cache?: {
    read?: number;
    write?: number;
  };
}

interface OpenCodeRecoveryMessageData {
  role?: string;
  modelID?: string;
  providerID?: string;
  time?: {
    created?: number;
  };
  tokens?: OpenCodeRecoveryTokens;
}

interface OpenCodeRecoveryJsonlUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
}

interface OpenCodeRecoveryJsonlMessageRecord {
  id?: string;
  parentId?: string | null;
  timestamp?: string | number;
  message?: {
    role?: string;
    model?: string;
    provider?: string;
    usage?: OpenCodeRecoveryJsonlUsage;
  };
}

export interface OpenCodeRecoveryMergedMessageRow {
  source_file: string | null;
  id: string | null;
  session_id: string | null;
  time_created: number | null;
  time_created_utc: string | null;
  role: string | null;
  model_id: string | null;
  provider_id: string | null;
  data: string;
}

export interface OpenCodeRecoveryExportMessage {
  id: string;
  threadId: string;
  role: "assistant";
  model: string;
  created_at: string;
  providerMetadata: {
    anthropic: {
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens: number;
        cache_creation_input_tokens: number;
      };
    };
  };
  recovery: {
    source: string;
    provider_id: string;
    original_message_id: string;
    session_id: string;
    source_file?: string;
  };
}

export interface OpenCodeRecoveryExportPayload {
  version: 1;
  threads: [];
  messages: OpenCodeRecoveryExportMessage[];
}

export interface OpenCodeRecoveryExportSummary {
  messageCount: number;
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
  dayCount: number;
}

function toPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }

  return 0;
}

function parseMessageData(row: OpenCodeRecoveryMergedMessageRow) {
  const raw = row.data?.trim();

  if (!raw || raw === "null") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as OpenCodeRecoveryMessageData | null;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Failed to parse recovery message row ${row.id ?? "<unknown>"}: ${reason}`,
    );
  }
}

function resolveCreatedAt(
  row: OpenCodeRecoveryMergedMessageRow,
  data: OpenCodeRecoveryMessageData,
) {
  const created =
    toPositiveInteger(data.time?.created) ||
    toPositiveInteger(row.time_created);

  if (created <= 0) {
    throw new Error(
      `Recovery message row ${row.id ?? "<unknown>"} is missing time.created`,
    );
  }

  return new Date(created).toISOString();
}

function getTokenTotals(tokens?: OpenCodeRecoveryTokens) {
  const cacheInput = toPositiveInteger(tokens?.cache?.read);
  const cacheOutput = toPositiveInteger(tokens?.cache?.write);
  const input = toPositiveInteger(tokens?.input);
  const output = toPositiveInteger(tokens?.output);
  const total = Math.max(
    toPositiveInteger(tokens?.total),
    input + output + cacheInput + cacheOutput,
  );

  return {
    input,
    output,
    cacheInput,
    cacheOutput,
    total,
  };
}

function parseStoredCreatedAt(
  value: string | number | undefined,
  rowId: string,
) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      throw new Error(`Recovery JSONL row ${rowId} is missing a timestamp`);
    }

    const numeric = Number(trimmed);

    if (Number.isFinite(numeric) && numeric > 0) {
      return new Date(
        numeric > 100_000_000_000 ? numeric : numeric * 1000,
      ).toISOString();
    }

    const parsed = new Date(trimmed);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  throw new Error(`Recovery JSONL row ${rowId} has an invalid timestamp`);
}

export function buildOpenCodeRecoveryExportMessage(
  row: OpenCodeRecoveryMergedMessageRow,
  sourceName: string,
) {
  const data = parseMessageData(row);

  if (!data) {
    return null;
  }

  const role = data.role ?? row.role ?? undefined;

  if (role !== "assistant") {
    return null;
  }

  const tokenTotals = getTokenTotals(data.tokens);

  if (tokenTotals.total <= 0) {
    return null;
  }

  const id = row.id?.trim();
  const threadId = row.session_id?.trim();
  const model = (data.modelID ?? row.model_id ?? "").trim();
  const providerId =
    (data.providerID ?? row.provider_id ?? "unknown").trim() || "unknown";

  if (!id) {
    throw new Error("Recovery message row is missing an id");
  }

  if (!threadId) {
    throw new Error(`Recovery message row ${id} is missing a session_id`);
  }

  if (!model) {
    throw new Error(`Recovery message row ${id} is missing a model identifier`);
  }

  return {
    id,
    threadId,
    role: "assistant",
    model,
    created_at: resolveCreatedAt(row, data),
    providerMetadata: {
      anthropic: {
        usage: {
          input_tokens: tokenTotals.input,
          output_tokens: tokenTotals.output,
          cache_read_input_tokens: tokenTotals.cacheInput,
          cache_creation_input_tokens: tokenTotals.cacheOutput,
        },
      },
    },
    recovery: {
      source: sourceName,
      provider_id: providerId,
      original_message_id: id,
      session_id: threadId,
      source_file: row.source_file ?? undefined,
    },
  } satisfies OpenCodeRecoveryExportMessage;
}

export function buildOpenCodeRecoveryExportMessageFromJsonlRecord(
  row: OpenCodeRecoveryJsonlMessageRecord,
  sourceName: string,
) {
  const message = row.message;

  if (message?.role !== "assistant") {
    return null;
  }

  const usage = message.usage;
  const input = toPositiveInteger(usage?.input);
  const output = toPositiveInteger(usage?.output);
  const cacheInput = toPositiveInteger(usage?.cacheRead);
  const cacheOutput = toPositiveInteger(usage?.cacheWrite);
  const explicitTotal = toPositiveInteger(usage?.totalTokens);
  const total = explicitTotal || input + output + cacheInput + cacheOutput;

  if (total <= 0) {
    return null;
  }

  const id = row.id?.trim();
  const model = message.model?.trim();
  const providerId = message.provider?.trim() || "unknown";
  const threadId = row.parentId?.trim() || id;

  if (!id) {
    throw new Error("Recovery JSONL row is missing an id");
  }

  if (!threadId) {
    throw new Error(`Recovery JSONL row ${id} is missing a thread identifier`);
  }

  if (!model) {
    throw new Error(`Recovery JSONL row ${id} is missing a model identifier`);
  }

  return {
    id,
    threadId,
    role: "assistant",
    model,
    created_at: parseStoredCreatedAt(row.timestamp, id),
    providerMetadata: {
      anthropic: {
        usage: {
          input_tokens: input,
          output_tokens: output,
          cache_read_input_tokens: cacheInput,
          cache_creation_input_tokens: cacheOutput,
        },
      },
    },
    recovery: {
      source: sourceName,
      provider_id: providerId,
      original_message_id: id,
      session_id: threadId,
    },
  } satisfies OpenCodeRecoveryExportMessage;
}

export function buildOpenCodeRecoveryExportPayloadFromMessages(
  messages: OpenCodeRecoveryExportMessage[],
): OpenCodeRecoveryExportPayload {
  const dedupedMessages: OpenCodeRecoveryExportMessage[] = [];
  const seenIds = new Set<string>();

  for (const message of messages) {
    if (seenIds.has(message.id)) {
      continue;
    }

    seenIds.add(message.id);
    dedupedMessages.push(message);
  }

  dedupedMessages.sort((left, right) => {
    return (
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id)
    );
  });

  return {
    version: 1,
    threads: [],
    messages: dedupedMessages,
  };
}

export function buildOpenCodeRecoveryExportPayload(
  rows: OpenCodeRecoveryMergedMessageRow[],
  sourceName: string,
): OpenCodeRecoveryExportPayload {
  const messages: OpenCodeRecoveryExportMessage[] = [];

  for (const row of rows) {
    const message = buildOpenCodeRecoveryExportMessage(row, sourceName);

    if (!message) {
      continue;
    }

    messages.push(message);
  }

  return buildOpenCodeRecoveryExportPayloadFromMessages(messages);
}

export function summarizeOpenCodeRecoveryExportPayload(
  payload: OpenCodeRecoveryExportPayload,
): OpenCodeRecoveryExportSummary {
  if (payload.messages.length === 0) {
    return {
      messageCount: 0,
      firstCreatedAt: null,
      lastCreatedAt: null,
      dayCount: 0,
    };
  }

  const firstCreatedAt = payload.messages[0]?.created_at ?? null;
  const lastCreatedAt = payload.messages.at(-1)?.created_at ?? null;
  const dayCount = new Set(
    payload.messages.map((message) => message.created_at.slice(0, 10)),
  ).size;

  return {
    messageCount: payload.messages.length,
    firstCreatedAt,
    lastCreatedAt,
    dayCount,
  };
}
