export type ProviderId =
  | "codex"
  | "nanoclaw"
  | "omp"
  | "opencode"
  | "claude"
  | "hermes"
  | "droid"
  | "pi"
  | "t3"
  | "agy"
  | "gemini"
  | "cursor"
  | "helios";

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

export interface PublishedCostMonthlyRow {
  month: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  activeDays?: number;
  costUsd: number | null;
}

export interface PublishedCostHarness {
  id: string;
  label: string;
  activeDays: number;
  firstDate: string | null;
  lastDate: string | null;
  totalCostUsd: number | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  monthly: PublishedCostMonthlyRow[];
}

export interface PublishedCostModel {
  name: string;
  totalCostUsd: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  monthsActive: number;
  monthly: PublishedCostMonthlyRow[];
}

export interface PublishedCostModelWarning {
  model: string;
  totalTokens: number;
  status: "missing-cost";
}

export interface PublishedCostPayload {
  version: string;
  generatedAt: string;
  source: string;
  dateRange: {
    start: string;
    end: string;
  };
  grandTotalTokens: number;
  harnessTotalCostUsd: number;
  modelTotalCostUsd: number;
  coverageNote: string;
  harnesses: PublishedCostHarness[];
  models: PublishedCostModel[];
  monthlyTotals: PublishedCostMonthlyRow[];
  modelWarnings: PublishedCostModelWarning[];
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

export interface BurnSeries {
  provider: string;
  title: string;
  accent: string;
  daily: ProviderDailyAnalytics[];
  currentStreak: number;
  longestStreak: number;
}

export interface DailyBurnLayer {
  provider: string;
  title: string;
  accent: string;
  values: number[];
  total: number;
  input: number;
  output: number;
  cache: number;
  activeDays: number;
  peak: {
    date: string;
    total: number;
  } | null;
  currentStreak: number;
  longestStreak: number;
}

export interface DailyBurn {
  dates: string[];
  totals: number[];
  total: number;
  activeDays: number;
  peak: {
    date: string;
    total: number;
  } | null;
  layers: DailyBurnLayer[];
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

export interface CostSeriesSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface CostSeriesBucket {
  key: string;
  label: string;
  totalCostUsd: number;
  segments: CostSeriesSegment[];
}

export interface CostEntityAnalytics {
  id: string;
  label: string;
  groupLabel: string;
  color: string;
  totalCostUsd: number | null;
  totalTokens: number;
  costPerMillionTokens: number | null;
  hasCostData: boolean;
  monthly: Array<{
    month: string;
    costUsd: number;
    totalTokens: number;
  }>;
}

export interface CostAnalytics {
  generatedAt: string;
  source: string;
  coverageNote: string;
  dateRange: PublishedCostPayload["dateRange"];
  harnessTotalCostUsd: number;
  modelTotalCostUsd: number;
  latestMonth: {
    month: string;
    costUsd: number;
  } | null;
  topHarness: CostEntityAnalytics | null;
  harnesses: CostEntityAnalytics[];
  models: CostEntityAnalytics[];
  monthKeys: string[];
}

export interface DetailsAnalytics {
  providers: ProviderAnalytics[];
  models: BurnSeries[];
  families: BurnSeries[];
  vendors: VendorModelsAnalytics[];
  cost: CostAnalytics | null;
  latestUsageDate: string | null;
}
