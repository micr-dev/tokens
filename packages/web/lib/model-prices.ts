import {
  calcPrice,
  updatePrices,
  waitForUpdate,
} from "@pydantic/genai-prices";

// Model prices come from @pydantic/genai-prices: a maintained, MIT-licensed
// price database with per-model price history, so each day is billed at the
// price that applied on that day. publish:usage refreshes the database from
// the package's GitHub data file before pricing (loadLatestModelPrices), so
// models released after the installed package version still get priced.
//
// This file only maps the names harnesses emit onto names the database knows.
// Unknown models are reported as missing-cost instead of being guessed.

// Naming variants that harnesses emit for a priced model. Keys are applied after
// normalizeModelPriceName, so provider prefixes, "-thinking"/"-reasoning"
// suffixes, and dotted Claude versions never need their own entry here.
export const MODEL_PRICE_ALIASES: Record<string, string> = {
  "grok-code": "grok-code-fast-1",
  "grok-v3": "grok-3",
  "grok-v3-mini": "grok-3-mini",
  "grok-v4": "grok-4",
  "kimi-k2-0905": "kimi-k2-0905-preview",
  "gemini-flash-3.6-high-control": "gemini-3.6-flash",
  "kimi-k3-modal": "kimi-k3",
  "antigravity-claude-opus-4-5": "claude-opus-4-5",
  "antigravity-claude-opus-4-6": "claude-opus-4-6",
  "antigravity-claude-sonnet-4-5": "claude-sonnet-4-5",
  "antigravity-gemini-3-flash": "gemini-3-flash-preview",
  "antigravity-gemini-3-pro": "gemini-3-pro-preview",
  "deepseek-r1-0528": "deepseek-r1",
  "duo-chat-gpt-5-2-codex": "gpt-5.2-codex",
  "duo-chat-haiku-4-5": "claude-haiku-4-5",
  "duo-chat-opus-4-5": "claude-opus-4-5",
  "duo-chat-opus-4-6": "claude-opus-4-6",
  "duo-chat-sonnet-4-5": "claude-sonnet-4-5",
  "duo-chat-sonnet-4-6": "claude-sonnet-4-6",
  "gemini 3.5 flash (high)": "gemini-3.5-flash",
  "gemini-3-flash": "gemini-3-flash-preview",
  "gemini-3-flash-a": "gemini-3-flash-preview",
  "gemini-3-flash-agent": "gemini-3-flash-preview",
  "gemini-3-pro": "gemini-3-pro-preview",
  "gemini-3-pro-high": "gemini-3-pro-preview",
  "gemini-3.1-pro-low": "gemini-3.1-pro-preview",
  "gemini-3.6-flash-high": "gemini-3.6-flash",
  "gemini-claude-opus-4-5": "claude-opus-4-5",
  // GLM-5 served from Alibaba Cloud; priced at the Z.ai list price.
  "glm-5-ali": "glm-5",
  "glm5.3": "glm-5.3",
  "gpt-5.1-instant": "gpt-5.1-chat-latest",
  "gpt-5.2-instant": "gpt-5.2-chat-latest",
  "gpt-o3-mini": "o3-mini",
  "gpt-o4-mini": "o4-mini",
  "kimi-k2.6:cloud": "kimi-k2.6",
  "o3-full": "o3",
  "star-gemini-3-flash": "gemini-3-flash-preview",
  "star-gemini-3.5-flash": "gemini-3.5-flash",
};

const MODEL_PROVIDER_PREFIXES = [
  "cliproxyapi/",
  "anthropic/",
  "openai/",
  "google/",
  "z-ai/",
];

export function normalizeModelPriceName(modelName: string) {
  let name = modelName.trim().toLowerCase();
  const prefix = MODEL_PROVIDER_PREFIXES.find((value) =>
    name.startsWith(value),
  );

  if (prefix) {
    name = name.slice(prefix.length);
  }

  // Ollama Cloud tags (":cloud") serve the vendor model unchanged.
  name = name.replace(/:cloud$/, "");

  // Thinking/reasoning variants bill at the base model's token prices.
  name = name.replace(/-(?:thinking|reasoning)$/, "");

  return name
    .replace(/^claude-(opus|sonnet|haiku)-(\d+)\.(\d+)$/, "claude-$1-$2-$3")
    .replace(/^claude-(\d+)\.(\d+)-(opus|sonnet|haiku)$/, "claude-$3-$1-$2");
}

// Token counts for one model on one day, already split into disjoint buckets.
export interface BillableTokens {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

// Returns the USD price of one day's usage of a model, or null when the model
// has no known price.
export type ModelPricer = (
  modelName: string,
  date: string,
  tokens: BillableTokens,
) => number | null;

const FREE_MODELS = new Set(["big-pickle", "glm-4.7-flash"]);

// Below the smallest published long-context threshold (100K, Claude Haiku 5.5).
const PRICE_SAMPLE_INPUT_TOKENS = 10_000;

export const priceModelUsage: ModelPricer = (modelName, date, tokens) => {
  const normalized = normalizeModelPriceName(modelName);

  // OpenCode Zen serves its free models under "-free" IDs (plus big-pickle) at
  // $0, and Z.ai lists GLM-4.7-Flash as free; the database has none of these.
  if (normalized.endsWith("-free") || FREE_MODELS.has(normalized)) {
    return 0;
  }

  // genai-prices counts input_tokens inclusive of cache reads and writes.
  const inputTokens = tokens.input + tokens.cacheRead + tokens.cacheWrite;
  // Long-context tiers (e.g. above 272K input on GPT-5.5) apply per request,
  // but these are whole-day totals. Price a proportionally scaled-down sample
  // that stays under every tier threshold, then scale back up, so the day is
  // billed at the standard rate instead of as one giant request.
  const scale =
    inputTokens > PRICE_SAMPLE_INPUT_TOKENS
      ? PRICE_SAMPLE_INPUT_TOKENS / inputTokens
      : 1;
  const result = calcPrice(
    {
      input_tokens: inputTokens * scale,
      cache_read_tokens: tokens.cacheRead * scale,
      cache_write_tokens: tokens.cacheWrite * scale,
      output_tokens: tokens.output * scale,
    },
    MODEL_PRICE_ALIASES[normalized] ?? normalized,
    { timestamp: new Date(`${date}T12:00:00.000Z`) },
  );

  return result ? result.total_price / scale : null;
};

// Replaces the bundled price database with the latest published one. A failed
// download keeps the bundled data (the installed package version) and is
// reported, so a GitHub outage cannot stop a publish.
export async function loadLatestModelPrices(timeoutMs = 30_000) {
  updatePrices(({ remoteDataUrl, setProviderData }) => {
    setProviderData(
      fetch(remoteDataUrl, { signal: AbortSignal.timeout(timeoutMs) })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          return response.json();
        })
        .catch((error: unknown) => {
          process.stderr.write(
            `WARNING: could not refresh genai-prices data, using the bundled prices: ${String(error)}\n`,
          );

          return null;
        }),
    );
  });

  await waitForUpdate();
}
