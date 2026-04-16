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

export type ModelsTimeScale = "year" | "month" | "week" | "day";

export type VendorCompanyId =
  | "openai"
  | "google"
  | "z-ai"
  | "anthropic"
  | "moonshot"
  | "minimax"
  | "xai"
  | "nvidia"
  | "deepseek"
  | "alibaba";

export interface VendorModelColor {
  name: string;
  color: string;
}

export interface VendorModelsBucketSegment {
  name: string;
  total: number;
  color: string;
}

export interface VendorModelsBucket {
  key: string;
  label: string;
  description: string;
  total: number;
  segments: VendorModelsBucketSegment[];
}

export interface VendorModelsAnalytics {
  vendor: VendorCompanyId;
  name: string;
  total: number;
  share: number;
  topModels: AnalyticsModelShare[];
  modelColors: VendorModelColor[];
  scales: Record<ModelsTimeScale, VendorModelsBucket[]>;
}

export interface DetailsAnalytics {
  providers: ProviderAnalytics[];
  vendors: VendorModelsAnalytics[];
}
