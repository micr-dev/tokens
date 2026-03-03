export type ProviderId = "claude" | "codex" | "opencode";

export type CliDailyRow = {
  date: string;
  totalTokens: number;
};

export type ProviderRows = Record<ProviderId, CliDailyRow[]>;

export const providerIds: ProviderId[] = ["claude", "codex", "opencode"];

export const providerStatusLabel: Record<ProviderId, string> = {
  claude: "Claude code",
  codex: "Codex",
  opencode: "Open code",
};
