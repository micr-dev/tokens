import type { UsageSummary } from "./interfaces";
import { loadClaudeRows } from "./lib/claude-code";
import { loadCodexRows } from "./lib/codex";
import { loadCursorRows } from "./lib/cursor";
import { loadDroidRows } from "./lib/droid";
import { loadGeminiRows } from "./lib/gemini";
import { loadHeliosRows } from "./lib/helios";
import { loadHermesRows } from "./lib/hermes";
import {
  providerIds,
  providerStatusLabel,
  type ProviderId,
} from "./lib/interfaces";
import { loadOpenCodeRows } from "./lib/open-code";
import { loadPiRows } from "./lib/pi";
import { hasUsage, mergeUsageSummaries } from "./lib/utils";

export { providerIds, providerStatusLabel, type ProviderId };

/** Options for {@link aggregateUsage}. */
interface AggregateUsageOptions {
  start: Date;
  end: Date;
  requestedProviders?: ProviderId[];
}

/** Result of aggregating usage across providers. */
export interface AggregateUsageResult {
  /** Per-provider usage summaries; null entries indicate no data found. */
  rowsByProvider: Record<ProviderId, UsageSummary | null>;
  /** Warning messages emitted during provider data loading. */
  warnings: string[];
}

/**
 * Merges usage data from all providers into a single aggregated summary.
 *
 * @param rowsByProvider - Per-provider usage summaries (null if no data found).
 * @param end - The end date of the reporting window, used for streak computation.
 * @returns A merged {@link UsageSummary} with provider "all", or null if no provider has data.
 */
export function mergeProviderUsage(
  rowsByProvider: Record<ProviderId, UsageSummary | null>,
  end: Date,
): UsageSummary | null {
  const summaries = providerIds
    .map((provider) => rowsByProvider[provider])
    .filter((summary): summary is UsageSummary => summary !== null);

  if (summaries.length === 0) {
    return null;
  }

  return mergeUsageSummaries("all", summaries, end);
}

/**
 * Aggregates usage data from one or more providers within the given date range.
 *
 * Iterates over requested providers (or all if none specified), loads their
 * local usage data, and returns a map of provider IDs to their summaries.
 *
 * @param options.start - Start of the reporting window.
 * @param options.end - End of the reporting window.
 * @param options.requestedProviders - Optional subset of providers to load; defaults to all.
 * @returns Per-provider summaries and any warnings encountered during loading.
 */
export async function aggregateUsage({
  start,
  end,
  requestedProviders,
}: AggregateUsageOptions): Promise<AggregateUsageResult> {
  const providersToLoad = requestedProviders?.length
    ? requestedProviders
    : providerIds;
  const rowsByProvider: Record<ProviderId, UsageSummary | null> = {
    claude: null,
    codex: null,
    gemini: null,
    cursor: null,
    opencode: null,
    pi: null,
    droid: null,
    hermes: null,
    helios: null,
  };
  const warnings: string[] = [];

  for (const provider of providersToLoad) {
    const summary =
      provider === "claude"
        ? await loadClaudeRows(start, end)
        : provider === "codex"
          ? await loadCodexRows(start, end, warnings)
          : provider === "gemini"
            ? await loadGeminiRows(start, end)
          : provider === "cursor"
            ? await loadCursorRows(start, end)
            : provider === "opencode"
              ? await loadOpenCodeRows(start, end)
              : provider === "pi"
                ? await loadPiRows(start, end)
                : provider === "droid"
                  ? await loadDroidRows(start, end)
                : provider === "hermes"
                  ? await loadHermesRows(start, end)
                  : await loadHeliosRows(start, end);

    rowsByProvider[provider] = hasUsage(summary) ? summary : null;
  }

  return { rowsByProvider, warnings };
}
