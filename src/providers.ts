import { loadClaudeRows } from "./lib/claude-code";
import { loadCodexRows } from "./lib/codex";
import {
  providerIds,
  providerStatusLabel,
  type CliDailyRow,
  type ProviderData,
  type ProviderId,
} from "./lib/interfaces";
import { loadOpenCodeRows } from "./lib/open-code";

export { providerIds, providerStatusLabel, type CliDailyRow, type ProviderId };

interface AggregateUsageOptions {
  start: Date;
  end: Date;
  timezone: string;
}

export async function aggregateUsage({ start, end, timezone }: AggregateUsageOptions) {
  const [claude, codex, openCode] = await Promise.all([
    loadClaudeRows(start, end, timezone),
    loadCodexRows(start, end),
    loadOpenCodeRows(start, end),
  ]);

  return {
    claude: claude.daily.some((row) => row.totalTokens > 0) ? claude : null,
    codex: codex.daily.some((row) => row.totalTokens > 0) ? codex : null,
    openCode: openCode.daily.some((row) => row.totalTokens > 0) ? openCode : null,
  };
}

