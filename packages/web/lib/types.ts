export interface PublishedModelUsage {
  name: string;
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

export interface PublishedDailyUsage {
  date: string;
  input: number;
  output: number;
  cache: {
    input: number;
    output: number;
  };
  total: number;
  displayValue?: number;
  breakdown: PublishedModelUsage[];
}

export interface PublishedUsagePayload {
  version: string;
  start: string;
  end: string;
  updatedAt: string;
  providers: Array<{
    provider:
      | "claude"
      | "codex"
      | "cursor"
      | "opencode"
      | "pi"
      | "hermes"
      | "helios"
      | "t3";
    daily: PublishedDailyUsage[];
    insights?: {
      mostUsedModel?: PublishedModelUsage;
      recentMostUsedModel?: PublishedModelUsage;
      streaks: {
        longest: number;
        current: number;
      };
    };
  }>;
}
