export type ProviderId =
  | "claude"
  | "codex"
  | "gemini"
  | "cursor"
  | "opencode"
  | "pi"
  | "droid"
  | "hermes"
  | "helios"
  | "t3";

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
    provider: ProviderId;
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

export interface AnalyticsSeriesPoint {
  label: string;
  value: number;
}

export interface AnalyticsModelShare {
  name: string;
  total: number;
  share: number;
}

export interface ProviderDailyAnalytics {
  date: string;
  total: number;
  input: number;
  output: number;
  cacheInput: number;
  cacheOutput: number;
}

export interface ProviderAnalytics {
  provider: PublishedUsagePayload["providers"][number]["provider"];
  total: number;
  share: number;
  input: number;
  output: number;
  cacheTotal: number;
  cacheShare: number;
  activeDays: number;
  longestStreak: number;
  currentStreak: number;
  topDay: {
    date: string;
    total: number;
  } | null;
  topMonth: {
    label: string;
    total: number;
  } | null;
  mostUsedModel: {
    name: string;
    total: number;
  } | null;
  recentMostUsedModel: {
    name: string;
    total: number;
  } | null;
  monthly: AnalyticsSeriesPoint[];
  weekdays: AnalyticsSeriesPoint[];
  topModels: AnalyticsModelShare[];
  daily: ProviderDailyAnalytics[];
}

export interface DetailsAnalytics {
  providers: ProviderAnalytics[];
}
