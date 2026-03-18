import type {
  AnalyticsModelShare,
  AnalyticsSeriesPoint,
  ProviderAnalytics,
  PublishedUsagePayload,
} from "./types";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const providerTitles: Record<
  PublishedUsagePayload["providers"][number]["provider"],
  string
> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "Open Code",
  pi: "Pi Coding Agent",
  hermes: "Hermes Agent",
  helios: "Helios",
  t3: "T3 Chat",
};

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 10_000 ? 1 : 2,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function getProviderTitle(
  provider: PublishedUsagePayload["providers"][number]["provider"],
) {
  return providerTitles[provider];
}

function sortSeries<T extends AnalyticsSeriesPoint>(series: T[]) {
  return [...series].sort((left, right) => left.label.localeCompare(right.label));
}

function getMondayBasedWeekdayIndex(dateLabel: string) {
  const sundayBasedWeekday = new Date(`${dateLabel}T00:00:00`).getDay();

  return (sundayBasedWeekday + 6) % 7;
}

export function buildProviderAnalytics(
  provider: PublishedUsagePayload["providers"][number],
): ProviderAnalytics {
  const monthly = new Map<string, number>();
  const weekdayTotals = new Map<number, number>();
  const modelTotals = new Map<string, number>();
  let total = 0;
  let input = 0;
  let output = 0;
  let cacheTotal = 0;
  let topDay: ProviderAnalytics["topDay"] = null;

  for (const day of provider.daily) {
    total += day.total;
    input += day.input;
    output += day.output;
    cacheTotal += day.cache.input + day.cache.output;

    const monthLabel = day.date.slice(0, 7);

    monthly.set(monthLabel, (monthly.get(monthLabel) ?? 0) + day.total);

    const weekday = getMondayBasedWeekdayIndex(day.date);

    weekdayTotals.set(weekday, (weekdayTotals.get(weekday) ?? 0) + day.total);

    if (!topDay || day.total > topDay.total) {
      topDay = { date: day.date, total: day.total };
    }

    for (const breakdown of day.breakdown) {
      modelTotals.set(
        breakdown.name,
        (modelTotals.get(breakdown.name) ?? 0) + breakdown.tokens.total,
      );
    }
  }

  const topMonthEntry =
    [...monthly.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const topModels = [...modelTotals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([name, modelTotal]) => ({
      name,
      total: modelTotal,
      share: total > 0 ? modelTotal / total : 0,
    })) satisfies AnalyticsModelShare[];

  return {
    provider: provider.provider,
    total,
    input,
    output,
    cacheTotal,
    cacheShare: total > 0 ? (cacheTotal / total) * 100 : 0,
    activeDays: provider.daily.length,
    longestStreak: provider.insights?.streaks.longest ?? 0,
    currentStreak: provider.insights?.streaks.current ?? 0,
    topDay,
    topMonth: topMonthEntry
      ? { label: topMonthEntry[0], total: topMonthEntry[1] }
      : null,
    mostUsedModel: provider.insights?.mostUsedModel
      ? {
          name: provider.insights.mostUsedModel.name,
          total: provider.insights.mostUsedModel.tokens.total,
        }
      : null,
    recentMostUsedModel: provider.insights?.recentMostUsedModel
      ? {
          name: provider.insights.recentMostUsedModel.name,
          total: provider.insights.recentMostUsedModel.tokens.total,
        }
      : null,
    monthly: sortSeries(
      [...monthly.entries()].map(([label, value]) => ({ label, value })),
    ),
    weekdays: weekdayLabels.map((label, index) => ({
      label,
      value: weekdayTotals.get(index) ?? 0,
    })),
    topModels,
  };
}

export function buildAnalytics(
  payload: PublishedUsagePayload,
): ProviderAnalytics[] {
  return payload.providers.map(buildProviderAnalytics);
}
