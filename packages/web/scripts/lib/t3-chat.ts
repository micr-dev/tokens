import { existsSync, readFileSync } from "node:fs";

const T3_MAX_IMPORT_BYTES_ENV = "SLOPMETER_WEB_T3_MAX_BYTES";
const DEFAULT_T3_MAX_IMPORT_BYTES = 256 * 1024 * 1024;

interface TokenTotals {
  input: number;
  output: number;
  cache: {
    input: number;
    output: number;
  };
  total: number;
}

interface JsonUsageSummary {
  provider: "t3";
  daily: Array<{
    date: string;
    input: number;
    output: number;
    cache: {
      input: number;
      output: number;
    };
    total: number;
    displayValue?: number;
    breakdown: Array<{
      name: string;
      tokens: TokenTotals;
    }>;
  }>;
  insights: {
    mostUsedModel?: {
      name: string;
      tokens: TokenTotals;
    };
    recentMostUsedModel?: {
      name: string;
      tokens: TokenTotals;
    };
    streaks: {
      longest: number;
      current: number;
    };
  };
}

interface T3OpenAiMetadata {
  cachedPromptTokens?: number;
}

interface T3OpenRouterMetadata {
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    promptTokensDetails?: {
      cachedTokens?: number;
    };
  };
}

interface T3AnthropicMetadata {
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

interface T3GoogleMetadata {
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface T3Message {
  role?: string;
  model?: string;
  tokens?: number;
  created_at?: string | number;
  updated_at?: string | number;
  _creationTime?: string | number;
  providerMetadata?: {
    openai?: T3OpenAiMetadata;
    openrouter?: T3OpenRouterMetadata;
    anthropic?: T3AnthropicMetadata;
    google?: T3GoogleMetadata;
  };
}

interface T3ExportPayload {
  messages?: T3Message[];
}

interface DailyEntry {
  tokens: TokenTotals;
  models: Map<string, TokenTotals>;
}

type DailyTotalsByDate = Map<string, DailyEntry>;

function formatLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function cloneTokenTotals(totals: TokenTotals): TokenTotals {
  return {
    input: totals.input,
    output: totals.output,
    cache: {
      input: totals.cache.input,
      output: totals.cache.output,
    },
    total: totals.total,
  };
}

function mergeTokenTotals(target: TokenTotals, source: TokenTotals) {
  target.input += source.input;
  target.output += source.output;
  target.cache.input += source.cache.input;
  target.cache.output += source.cache.output;
  target.total += source.total;
}

function addModelTokenTotals(
  modelTotals: Map<string, TokenTotals>,
  modelName: string,
  tokenTotals: TokenTotals,
) {
  const existing = modelTotals.get(modelName);

  if (!existing) {
    modelTotals.set(modelName, cloneTokenTotals(tokenTotals));

    return;
  }

  mergeTokenTotals(existing, tokenTotals);
}

function addDailyTokenTotals(
  totals: DailyTotalsByDate,
  date: Date,
  tokenTotals: TokenTotals,
  modelName?: string,
) {
  const dateKey = formatLocalDate(date);
  const existing = totals.get(dateKey);

  if (!existing) {
    const models = new Map<string, TokenTotals>();

    if (modelName) {
      models.set(modelName, cloneTokenTotals(tokenTotals));
    }

    totals.set(dateKey, {
      tokens: cloneTokenTotals(tokenTotals),
      models,
    });
    return;
  }

  mergeTokenTotals(existing.tokens, tokenTotals);

  if (modelName) {
    addModelTokenTotals(existing.models, modelName, tokenTotals);
  }
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJsonTextWithLimit<T>(content: string, sourceLabel: string, maxBytes: number) {
  if (Buffer.byteLength(content, "utf8") > maxBytes) {
    throw new Error(
      `T3 export exceeds ${maxBytes} bytes in ${sourceLabel}. Increase ${T3_MAX_IMPORT_BYTES_ENV} to process this file.`,
    );
  }

  return JSON.parse(content) as T;
}

function normalizeModelName(modelName: string) {
  return modelName.replace(/-\d{8}$/, "");
}

function getRecentWindowStart(endDate: Date, days = 30) {
  const start = new Date(endDate);

  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  return start;
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

function parseStoredTimestamp(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value > 100_000_000_000 ? value : value * 1000);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);

    if (Number.isFinite(numeric)) {
      return new Date(
        numeric > 100_000_000_000 ? numeric : numeric * 1000,
      );
    }

    const parsed = new Date(trimmed);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function toModelName(value?: string) {
  const trimmed = value?.trim();

  return trimmed ? normalizeModelName(trimmed) : undefined;
}

function toTokenTotals(
  input: number,
  output: number,
  cacheInput = 0,
  cacheOutput = 0,
  explicitTotal?: number,
) {
  const total = explicitTotal && explicitTotal > 0
    ? explicitTotal
    : input + output;

  if (total <= 0) {
    return null;
  }

  return {
    input,
    output,
    cache: { input: cacheInput, output: cacheOutput },
    total,
  } satisfies TokenTotals;
}

function getAnthropicTotals(message: T3Message) {
  const anthropic = message.providerMetadata?.anthropic;
  const inputTokens = toPositiveInteger(anthropic?.usage?.input_tokens);
  const outputTokens = toPositiveInteger(anthropic?.usage?.output_tokens);
  const cacheInput = toPositiveInteger(
    anthropic?.usage?.cache_read_input_tokens ?? anthropic?.cacheReadInputTokens,
  );
  const cacheOutput = toPositiveInteger(
    anthropic?.usage?.cache_creation_input_tokens ??
      anthropic?.cacheCreationInputTokens,
  );

  return toTokenTotals(
    inputTokens + cacheInput,
    outputTokens + cacheOutput,
    cacheInput,
    cacheOutput,
  );
}

function getOpenRouterTotals(message: T3Message) {
  const usage = message.providerMetadata?.openrouter?.usage;
  const inputTokens = toPositiveInteger(usage?.promptTokens);
  const outputTokens = toPositiveInteger(usage?.completionTokens);
  const cacheInput = toPositiveInteger(usage?.promptTokensDetails?.cachedTokens);
  const totalTokens = toPositiveInteger(usage?.totalTokens);

  return toTokenTotals(
    inputTokens,
    outputTokens,
    cacheInput,
    0,
    totalTokens,
  );
}

function getGoogleTotals(message: T3Message) {
  const usage = message.providerMetadata?.google?.usageMetadata;
  const inputTokens = toPositiveInteger(usage?.promptTokenCount);
  const outputTokens = toPositiveInteger(usage?.candidatesTokenCount);

  return toTokenTotals(inputTokens, outputTokens);
}

function getOpenAiTotals(message: T3Message) {
  const cacheInput = toPositiveInteger(
    message.providerMetadata?.openai?.cachedPromptTokens,
  );
  const outputTokens = toPositiveInteger(message.tokens);

  return toTokenTotals(cacheInput, outputTokens, cacheInput, 0);
}

function getFallbackTotals(message: T3Message) {
  return toTokenTotals(0, toPositiveInteger(message.tokens));
}

function getT3MessageTotals(message: T3Message) {
  return (
    getAnthropicTotals(message) ??
    getOpenRouterTotals(message) ??
    getGoogleTotals(message) ??
    getOpenAiTotals(message) ??
    getFallbackTotals(message)
  );
}

function totalsToRows(totals: DailyTotalsByDate) {
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entry]) => ({
      date,
      input: entry.tokens.input,
      output: entry.tokens.output,
      cache: entry.tokens.cache,
      total: entry.tokens.total,
      breakdown: [...entry.models.entries()]
        .sort(([, left], [, right]) => right.total - left.total)
        .map(([name, tokens]) => ({
          name,
          tokens: cloneTokenTotals(tokens),
        })),
    }));
}

function getTopModel(modelTotals: Map<string, TokenTotals>) {
  let bestName: string | undefined;
  let bestTotals: TokenTotals | undefined;

  for (const [name, totals] of modelTotals.entries()) {
    if (!bestTotals || totals.total > bestTotals.total) {
      bestName = name;
      bestTotals = totals;
    }
  }

  return bestName && bestTotals
    ? {
        name: bestName,
        tokens: cloneTokenTotals(bestTotals),
      }
    : undefined;
}

function startOfDay(date: Date) {
  const day = new Date(date);

  day.setHours(0, 0, 0, 0);

  return day;
}

function isConsecutiveDay(prevDate: Date, currDate: Date) {
  return startOfDay(currDate).getTime() - startOfDay(prevDate).getTime() === 86_400_000;
}

function computeLongestStreak(dates: Date[]) {
  if (dates.length === 0) {
    return 0;
  }

  let longest = 1;
  let running = 1;

  for (let index = 1; index < dates.length; index += 1) {
    if (isConsecutiveDay(dates[index - 1], dates[index])) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 1;
    }
  }

  return longest;
}

function computeCurrentStreak(dates: Date[], end: Date) {
  if (dates.length === 0) {
    return 0;
  }

  const endDay = startOfDay(end);
  const lastDay = startOfDay(dates[dates.length - 1]);

  if (
    lastDay.getTime() !== endDay.getTime() &&
    !isConsecutiveDay(lastDay, endDay)
  ) {
    return 0;
  }

  let current = 1;

  for (let index = dates.length - 2; index >= 0; index -= 1) {
    if (!isConsecutiveDay(dates[index], dates[index + 1])) {
      break;
    }

    current += 1;
  }

  return current;
}

function buildInsights(
  modelTotals: Map<string, TokenTotals>,
  recentModelTotals: Map<string, TokenTotals>,
  dailyRows: ReturnType<typeof totalsToRows>,
  end: Date,
) {
  const measuredDates = dailyRows
    .filter((row) => row.total > 0)
    .map((row) => new Date(`${row.date}T00:00:00`));

  return {
    mostUsedModel: getTopModel(modelTotals),
    recentMostUsedModel: getTopModel(recentModelTotals),
    streaks: {
      longest: computeLongestStreak(measuredDates),
      current: computeCurrentStreak(measuredDates, end),
    },
  };
}

function toJsonDailyUsage(row: ReturnType<typeof totalsToRows>[number]) {
  return {
    date: row.date,
    input: row.input,
    output: row.output,
    cache: row.cache,
    total: row.total,
    breakdown: row.breakdown,
  };
}

export async function loadT3PublishedSummary(
  importPath: string,
  start: Date,
  end: Date,
): Promise<JsonUsageSummary | null> {
  if (!existsSync(importPath)) {
    return null;
  }

  const maxBytes = getPositiveIntegerEnv(
    T3_MAX_IMPORT_BYTES_ENV,
    DEFAULT_T3_MAX_IMPORT_BYTES,
  );
  const payload = parseJsonTextWithLimit<T3ExportPayload>(
    readFileSync(importPath, "utf8"),
    importPath,
    maxBytes,
  );

  if (!Array.isArray(payload.messages)) {
    throw new Error(
      `T3 export at ${importPath} is missing a messages array.`,
    );
  }

  const totals: DailyTotalsByDate = new Map();
  const modelTotals = new Map<string, TokenTotals>();
  const recentModelTotals = new Map<string, TokenTotals>();
  const recentStart = getRecentWindowStart(end, 30);
  let usableMessages = 0;

  for (const message of payload.messages) {
    if (message.role !== "assistant") {
      continue;
    }

    const timestamp =
      parseStoredTimestamp(message.created_at) ??
      parseStoredTimestamp(message._creationTime) ??
      parseStoredTimestamp(message.updated_at);

    if (!timestamp || Number.isNaN(timestamp.getTime())) {
      continue;
    }

    if (timestamp < start || timestamp > end) {
      continue;
    }

    const tokenTotals = getT3MessageTotals(message);

    if (!tokenTotals || tokenTotals.total <= 0) {
      continue;
    }

    usableMessages += 1;

    const modelName = toModelName(message.model);

    addDailyTokenTotals(totals, timestamp, tokenTotals, modelName);

    if (!modelName) {
      continue;
    }

    addModelTokenTotals(modelTotals, modelName, tokenTotals);

    if (timestamp >= recentStart) {
      addModelTokenTotals(recentModelTotals, modelName, tokenTotals);
    }
  }

  if (usableMessages === 0) {
    throw new Error(
      `No usable T3 assistant token data found in ${importPath}.`,
    );
  }

  const daily = totalsToRows(totals);

  return {
    provider: "t3",
    daily: daily.map(toJsonDailyUsage),
    insights: buildInsights(modelTotals, recentModelTotals, daily, end),
  };
}
