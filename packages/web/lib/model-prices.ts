// Per-million-token API list prices used to compute the published Cost tab.
//
// Sources, recorded per entry so every number can be traced during audits
// (all checked 2026-10-21):
// - "official:<page>": the vendor's own pricing or model page. Retired models
//   use the archived page from while they were served.
// - "models.dev:<provider>/<id>": the vendor's first-party entry in
//   https://models.dev/api.json, used where the vendor page was not checked
//   directly (current Google, xAI, Moonshot models).
// - "opencode-zen-free": OpenCode Zen "-free" model IDs, which are served at $0.
// Prices are the standard short-context list rate. Daily usage rows cannot
// tell long-context, batch, fast-mode, or off-peak requests apart.
// Missing cache-read prices fall back to the input price because no discount
// is published.
//
// Models missing here are reported as missing-cost instead of being guessed.
export interface ModelPricePerMillion {
  input: number;
  cachedInput: number;
  // Cache writes are billed at the input price unless the vendor publishes a
  // separate write price.
  cacheWrite?: number;
  output: number;
  source: string;
}

export const MODEL_PRICES_PER_MILLION: Record<string, ModelPricePerMillion> = {
  "big-pickle": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "claude-fable-5": {
    input: 10,
    cachedInput: 1,
    cacheWrite: 12.5,
    output: 50,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-fable-5-1": {
    input: 10,
    cachedInput: 0.25,
    cacheWrite: 12.5,
    output: 50,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-haiku-4-5": {
    input: 1,
    cachedInput: 0.1,
    cacheWrite: 1.25,
    output: 5,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-haiku-5-5": {
    input: 0.1,
    cachedInput: 0.01,
    cacheWrite: 0.125,
    output: 0.5,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-opus-4-5": {
    input: 5,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    output: 25,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-opus-4-6": {
    input: 5,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    output: 25,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-opus-4-8": {
    input: 5,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    output: 25,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-opus-5": {
    input: 5,
    cachedInput: 0.5,
    cacheWrite: 6.25,
    output: 25,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-opus-5-5": {
    input: 4,
    cachedInput: 0.2,
    cacheWrite: 5,
    output: 20,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-sonnet-4-5": {
    input: 3,
    cachedInput: 0.3,
    cacheWrite: 3.75,
    output: 15,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-sonnet-4-6": {
    input: 3,
    cachedInput: 0.3,
    cacheWrite: 3.75,
    output: 15,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-sonnet-5": {
    input: 2,
    cachedInput: 0.2,
    cacheWrite: 2.5,
    output: 10,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "claude-sonnet-5-5": {
    input: 2,
    cachedInput: 0.1,
    cacheWrite: 2.5,
    output: 10,
    source: "official:platform.claude.com/docs/en/about-claude/pricing",
  },
  "deepseek-r1": {
    input: 0.55,
    cachedInput: 0.14,
    output: 2.19,
    source: "official:api-docs.deepseek.com/quick_start/pricing (deepseek-reasoner, archived)",
  },
  "deepseek-v4-flash": {
    input: 0.3,
    cachedInput: 0.006,
    output: 1.2,
    source: "official:api-docs.deepseek.com/quick_start/pricing (peak rate)",
  },
  "deepseek-v4-flash-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "deepseek-v4-pro": {
    input: 1.32,
    cachedInput: 0.044,
    output: 3.96,
    source: "official:api-docs.deepseek.com/quick_start/pricing (peak rate)",
  },
  "gemini-2.0-flash": {
    input: 0.1,
    cachedInput: 0.025,
    output: 0.4,
    source: "official:ai.google.dev/gemini-api/docs/pricing (model shut down 2026-06-01)",
  },
  "gemini-2.5-flash": {
    input: 0.3,
    cachedInput: 0.03,
    output: 2.5,
    source: "models.dev:google/gemini-2.5-flash",
  },
  "gemini-2.5-flash-lite": {
    input: 0.1,
    cachedInput: 0.01,
    output: 0.4,
    source: "models.dev:google/gemini-2.5-flash-lite",
  },
  "gemini-2.5-pro": {
    input: 1.25,
    cachedInput: 0.125,
    output: 10,
    source: "models.dev:google/gemini-2.5-pro",
  },
  "gemini-3-flash-preview": {
    input: 0.5,
    cachedInput: 0.05,
    output: 3,
    source: "models.dev:google/gemini-3-flash-preview",
  },
  "gemini-3-pro-preview": {
    input: 2,
    cachedInput: 0.2,
    output: 12,
    source: "official:ai.google.dev/gemini-api/docs/pricing (archived 2026-02-01; model shut down 2026-03-09)",
  },
  "gemini-3.1-flash-lite": {
    input: 0.25,
    cachedInput: 0.025,
    output: 1.5,
    source: "models.dev:google/gemini-3.1-flash-lite",
  },
  "gemini-3.1-pro-preview": {
    input: 2,
    cachedInput: 0.2,
    output: 12,
    source: "models.dev:google/gemini-3.1-pro-preview",
  },
  "gemini-3.5-flash": {
    input: 1.5,
    cachedInput: 0.15,
    output: 9,
    source: "models.dev:google/gemini-3.5-flash",
  },
  "gemini-3.6-flash": {
    input: 0.75,
    cachedInput: 0.075,
    output: 3.75,
    source: "models.dev:google/gemini-3.6-flash",
  },
  "gemini-3.7-flash": {
    input: 0.75,
    cachedInput: 0.075,
    output: 3.75,
    source: "models.dev:google/gemini-3.7-flash",
  },
  "gemini-4-argon": {
    input: 2,
    cachedInput: 0.1,
    output: 10,
    source: "models.dev:google/gemini-4-argon",
  },
  "glm-4.5-air": {
    input: 0.2,
    cachedInput: 0.03,
    output: 1.1,
    source: "official:docs.z.ai/guides/overview/pricing",
  },
  "glm-4.6": {
    input: 0.6,
    cachedInput: 0.11,
    output: 2.2,
    source: "official:docs.z.ai/guides/overview/pricing",
  },
  "glm-4.7": {
    input: 0.6,
    cachedInput: 0.11,
    output: 2.2,
    source: "official:docs.z.ai/guides/overview/pricing",
  },
  "glm-4.7-flash": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "official:docs.z.ai/guides/overview/pricing",
  },
  "glm-4.7-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "glm-5": {
    input: 1,
    cachedInput: 0.2,
    output: 3.2,
    source: "official:docs.z.ai/guides/overview/pricing",
  },
  "glm-5-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "glm-5.1": {
    input: 1.4,
    cachedInput: 0.26,
    output: 4.4,
    source: "official:docs.z.ai/guides/overview/pricing",
  },
  "glm-5.2": {
    input: 1.4,
    cachedInput: 0.26,
    output: 4.4,
    source: "official:docs.z.ai/guides/overview/pricing",
  },
  "glm-5.3": {
    input: 1.4,
    cachedInput: 0.26,
    output: 4.4,
    source: "official:docs.z.ai/guides/overview/pricing",
  },
  "glm-5.3-flash": {
    input: 0.15,
    cachedInput: 0.03,
    output: 0.5,
    source: "official:docs.z.ai/guides/overview/pricing",
  },
  "gpt-4.1": {
    input: 2,
    cachedInput: 0.5,
    output: 8,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-4o": {
    input: 2.5,
    cachedInput: 1.25,
    output: 10,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5": {
    input: 1.25,
    cachedInput: 0.125,
    output: 10,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5-chat": {
    input: 1.25,
    cachedInput: 0.125,
    output: 10,
    source: "official:developers.openai.com/api/docs/models/gpt-5-chat-latest",
  },
  "gpt-5-mini": {
    input: 0.25,
    cachedInput: 0.025,
    output: 2,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5-nano": {
    input: 0.05,
    cachedInput: 0.005,
    output: 0.4,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.1": {
    input: 1.25,
    cachedInput: 0.125,
    output: 10,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.1-chat-latest": {
    input: 1.25,
    cachedInput: 0.125,
    output: 10,
    source: "official:developers.openai.com/api/docs/models/gpt-5.1-chat-latest",
  },
  "gpt-5.1-codex-max": {
    input: 1.25,
    cachedInput: 0.125,
    output: 10,
    source: "official:developers.openai.com/api/docs/models/gpt-5.1-codex-max",
  },
  "gpt-5.1-codex-mini": {
    input: 0.25,
    cachedInput: 0.025,
    output: 2,
    source: "official:developers.openai.com/api/docs/models/gpt-5.1-codex-mini",
  },
  "gpt-5.2": {
    input: 1.75,
    cachedInput: 0.175,
    output: 14,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.2-chat-latest": {
    input: 1.75,
    cachedInput: 0.175,
    output: 14,
    source: "official:developers.openai.com/api/docs/models/gpt-5.2-chat-latest",
  },
  "gpt-5.2-codex": {
    input: 1.75,
    cachedInput: 0.175,
    output: 14,
    source: "official:developers.openai.com/api/docs/models/gpt-5.2-codex",
  },
  "gpt-5.3-codex": {
    input: 1.75,
    cachedInput: 0.175,
    output: 14,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.3-codex-spark": {
    input: 1.75,
    cachedInput: 0.175,
    output: 14,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.4": {
    input: 2.5,
    cachedInput: 0.25,
    output: 15,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.4-mini": {
    input: 0.75,
    cachedInput: 0.075,
    output: 4.5,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.5": {
    input: 5,
    cachedInput: 0.5,
    output: 30,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.6-luna": {
    input: 0.2,
    cachedInput: 0.02,
    cacheWrite: 0.25,
    output: 1.2,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.6-sol": {
    input: 4,
    cachedInput: 0.4,
    cacheWrite: 5,
    output: 20,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-5.6-terra": {
    input: 2,
    cachedInput: 0.2,
    cacheWrite: 2.5,
    output: 12,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-6-astra": {
    input: 10,
    cachedInput: 1,
    cacheWrite: 12.5,
    output: 50,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-6-luna": {
    input: 0.1,
    cachedInput: 0.01,
    cacheWrite: 0.125,
    output: 0.5,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-6-sol": {
    input: 2,
    cachedInput: 0.2,
    cacheWrite: 2.5,
    output: 10,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-6.1-sol": {
    input: 2,
    cachedInput: 0.1,
    cacheWrite: 2.5,
    output: 10,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "gpt-daybreak-blue-latest": {
    input: 4,
    cachedInput: 0.4,
    cacheWrite: 5,
    output: 20,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "grok-4.5": {
    input: 2,
    cachedInput: 0.3,
    output: 6,
    source: "models.dev:xai/grok-4.5",
  },
  "grok-4.6": {
    input: 2,
    cachedInput: 0.5,
    output: 6,
    source: "models.dev:xai/grok-4.6",
  },
  "kimi-k3": {
    input: 3,
    cachedInput: 0.3,
    cacheWrite: 3,
    output: 15,
    source: "models.dev:moonshotai/kimi-k3",
  },
  "kimi-k2.5": {
    input: 0.6,
    cachedInput: 0.1,
    output: 3,
    source: "official:platform.kimi.ai launch price (discontinued 2026-08-31); input/output match Azure listing",
  },
  "kimi-k2.5-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "kimi-k2.6": {
    input: 0.95,
    cachedInput: 0.16,
    output: 4,
    source: "models.dev:moonshotai/kimi-k2.6",
  },
  "kimi-k2.7-code": {
    input: 0.95,
    cachedInput: 0.19,
    output: 4,
    source: "models.dev:moonshotai/kimi-k2.7-code",
  },
  "mimo-v2-flash-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "mimo-v2.6-flash-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "minimax-m2.1-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "minimax-m2.5-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "minimax-m3-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  "nemotron-3-ultra-free": {
    input: 0,
    cachedInput: 0,
    output: 0,
    source: "opencode-zen-free",
  },
  o3: {
    input: 2,
    cachedInput: 0.5,
    output: 8,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "o3-mini": {
    input: 1.1,
    cachedInput: 0.55,
    output: 4.4,
    source: "official:developers.openai.com/api/docs/pricing",
  },
  "o4-mini": {
    input: 1.1,
    cachedInput: 0.275,
    output: 4.4,
    source: "official:developers.openai.com/api/docs/pricing",
  },
};

// Naming variants that harnesses emit for a priced model. Keys are applied after
// normalizeModelPriceName, so provider prefixes, "-thinking"/"-reasoning"
// suffixes, and dotted Claude versions never need their own entry here.
export const MODEL_PRICE_ALIASES: Record<string, string> = {
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

  // Thinking/reasoning variants bill at the base model's token prices.
  name = name.replace(/-(?:thinking|reasoning)$/, "");

  return name
    .replace(/^claude-(opus|sonnet|haiku)-(\d+)\.(\d+)$/, "claude-$1-$2-$3")
    .replace(/^claude-(\d+)\.(\d+)-(opus|sonnet|haiku)$/, "claude-$3-$1-$2");
}

export function resolveModelPrice(
  modelName: string,
  prices: Record<string, ModelPricePerMillion> = MODEL_PRICES_PER_MILLION,
  aliases: Record<string, string> = MODEL_PRICE_ALIASES,
) {
  const normalized = normalizeModelPriceName(modelName);

  return prices[aliases[normalized] ?? normalized] ?? null;
}
