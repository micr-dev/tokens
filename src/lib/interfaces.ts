export type ProviderId = "claude" | "codex" | "openCode";

export type CliDailyRow = {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
};

export type ModelUsageStat = {
  modelName: string;
  totalTokens: number;
};

export type ProviderInsights = {
  mostUsedModel?: ModelUsageStat;
  recentMostUsedModel?: ModelUsageStat;
};

export type ProviderData = {
  daily: CliDailyRow[];
  insights?: ProviderInsights;
};

export type ProviderRows = Record<ProviderId, ProviderData>;

export const providerIds: ProviderId[] = ["claude", "codex", "openCode"];

export const providerStatusLabel: Record<ProviderId, string> = {
  claude: "Claude code",
  codex: "Codex",
  openCode: "Open Code",
};
