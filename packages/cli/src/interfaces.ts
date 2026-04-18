/**
 * Identifier for a usage provider, including aggregated pseudo-providers
 * like "all" (merged across all providers) and "t3" (T3 Chat hosted data).
 */
export type UsageProviderId =
  | "claude"
  | "codex"
  | "gemini"
  | "cursor"
  | "opencode"
  | "pi"
  | "droid"
  | "hermes"
  | "helios"
  | "t3"
  | "all";

/**
 * Aggregated usage summary for a single provider over a date range.
 */
export interface UsageSummary {
  /** Provider identifier. */
  provider: UsageProviderId;
  /** Daily token usage entries, sorted chronologically. */
  daily: DailyUsage[];
  /** Computed insights about usage patterns. */
  insights?: Insights;
}

/**
 * Token usage for a single day, including per-model breakdown.
 */
export interface DailyUsage {
  /** The date of usage. */
  date: Date;
  /** Total input tokens (including cache reads). */
  input: number;
  /** Total output tokens (including cache writes). */
  output: number;
  /** Cache token breakdown. */
  cache: {
    /** Tokens read from cache. */
    input: number;
    /** Tokens written to cache. */
    output: number;
  };
  /** Sum of input + output tokens. */
  total: number;
  /** Alternative display value when total tokens are unavailable (e.g. message count). */
  displayValue?: number;
  /** Usage by model, sorted by total tokens descending. */
  breakdown: ModelUsage[];
}

/**
 * Token usage for a specific model.
 */
export interface ModelUsage {
  /** Normalized model name (e.g. "claude-3.5-sonnet"). */
  name: string;
  /** Token counts for this model. */
  tokens: {
    input: number;
    output: number;
    cache: {
      input: number;
      output: number;
    };
    total: number;
  };
}

/**
 * Computed insights about a provider's usage patterns.
 */
export interface Insights {
  /** Most used model across the entire date range. */
  mostUsedModel?: ModelUsage;
  /** Most used model in the last 30 days. */
  recentMostUsedModel?: ModelUsage;
  /** Consecutive-day usage streaks. */
  streaks: {
    /** Longest consecutive-day streak with activity. */
    longest: number;
    /** Current consecutive-day streak ending at the report end date. */
    current: number;
  };
}

/**
 * JSON-serializable export payload for writing usage data to disk.
 */
export interface JsonExportPayload {
  /** Schema version string for format validation. */
  version: string;
  /** Start date of the reporting window (ISO date string). */
  start: string;
  /** End date of the reporting window (ISO date string). */
  end: string;
  /** Per-provider usage summaries. */
  providers: JsonUsageSummary[];
}

/**
 * JSON-serializable usage summary for a single provider.
 */
export interface JsonUsageSummary {
  provider: UsageProviderId;
  daily: JsonDailyUsage[];
  insights?: Insights;
}

/**
 * JSON-serializable daily usage entry with ISO date strings instead of Date objects.
 */
export interface JsonDailyUsage {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  input: number;
  output: number;
  cache: {
    input: number;
    output: number;
  };
  total: number;
  displayValue?: number;
  breakdown: ModelUsage[];
}
