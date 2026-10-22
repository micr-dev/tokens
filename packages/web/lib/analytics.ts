import type {
  AnalyticsModelShare,
  BurnSeries,
  AnalyticsSeriesPoint,
  CostAnalytics,
  CostEntityAnalytics,
  DailyBurn,
  DailyBurnLayer,
  DetailsAnalytics,
  ModelsTimeScale,
  PublishedCostPayload,
  ProviderAnalytics,
  ProviderId,
  PublishedUsagePayload,
  VendorCompanyId,
  VendorModelsAnalytics,
  VendorModelsBucket,
} from "./types";

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const fullMonthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAJOR_VENDOR_SHARE_THRESHOLD = 0.01;

const providerTitles: Record<ProviderId, string> = {
  codex: "Codex",
  nanoclaw: "NanoClaw",
  omp: "OMP",
  opencode: "Open Code",
  claude: "Claude Code",
  hermes: "Hermes Agent",
  droid: "Droid",
  pi: "Pi Coding Agent",
  t3: "T3 Chat",
  agy: "Antigravity CLI",
  gemini: "Gemini CLI (legacy)",
  cursor: "Cursor",
  helios: "Helios",
};

const providerDetailThemes: Record<
  ProviderId,
  { accent: string; accentSoft: string }
> = {
  omp: {
    accent: "#F84FCC",
    accentSoft: "#2b1028",
  },
  claude: {
    accent: "#f97316",
    accentSoft: "#fff7ed",
  },
  codex: {
    accent: "#4f46e5",
    accentSoft: "#e0e7ff",
  },
  nanoclaw: {
    accent: "#22d3ee",
    accentSoft: "#083344",
  },
  agy: {
    accent: "#ef4444",
    accentSoft: "#2a1414",
  },
  gemini: {
    accent: "#a3a3a3",
    accentSoft: "#202020",
  },
  cursor: {
    accent: "#f97316",
    accentSoft: "#fff7ed",
  },
  opencode: {
    accent: "#525252",
    accentSoft: "#f5f5f5",
  },
  pi: {
    accent: "#10b981",
    accentSoft: "#ecfdf5",
  },
  droid: {
    accent: "#d46922",
    accentSoft: "#fff7ed",
  },
  hermes: {
    accent: "#ffc107",
    accentSoft: "#fffde7",
  },
  helios: {
    accent: "#f59e0b",
    accentSoft: "#fffbea",
  },
  t3: {
    accent: "#a95381",
    accentSoft: "#f6eaf0",
  },
};

const vendorTitles: Record<VendorCompanyId, string> = {
  openai: "OpenAI",
  google: "Google",
  "z-ai": "Z.AI",
  anthropic: "Anthropic",
  moonshot: "Moonshot",
  minimax: "MiniMax",
  xai: "xAI",
  nvidia: "NVIDIA",
  deepseek: "DeepSeek",
  alibaba: "Alibaba",
};

const vendorBaseHues: Record<VendorCompanyId, number> = {
  openai: 200,
  google: 138,
  "z-ai": 38,
  anthropic: 16,
  moonshot: 188,
  minimax: 324,
  xai: 258,
  nvidia: 126,
  deepseek: 358,
  alibaba: 24,
};

const vendorToneOffsets = [0, -10, 12, -18, 22, -28, 32, -38, 42, -48];
const preferredVendorOrder: VendorCompanyId[] = [
  "openai",
  "z-ai",
  "anthropic",
  "google",
  "moonshot",
  "deepseek",
  "alibaba",
  "minimax",
  "xai",
  "nvidia",
];
const modelFallbackColor = "#a3a3a3";

interface FlattenedModelUsage {
  date: string;
  model: string;
  vendor: VendorCompanyId;
  total: number;
}

interface BucketDefinition {
  key: string;
  label: string;
  description: string;
  start: number;
  end: number;
}

const modelAliasPrefixes = [
  "cliproxyapi/",
  "google/",
  "anthropic/",
  "openai/",
  "xai/",
  "moonshot/",
  "minimax/",
  "deepseek/",
  "alibaba/",
  "nvidia/",
  "z-ai/",
];

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function parseDateToUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function formatDateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    padNumber(date.getUTCMonth() + 1),
    padNumber(date.getUTCDate()),
  ].join("-");
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date: Date, months: number) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
}

function startOfUtcYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function addUtcYears(date: Date, years: number) {
  return new Date(Date.UTC(date.getUTCFullYear() + years, 0, 1));
}

function startOfIsoWeek(date: Date) {
  const dayIndex = (date.getUTCDay() + 6) % 7;

  return addUtcDays(date, -dayIndex);
}

function getMondayBasedWeekdayIndex(dateLabel: string) {
  const sundayBasedWeekday = parseDateToUtc(dateLabel).getUTCDay();

  return (sundayBasedWeekday + 6) % 7;
}

function formatShortMonth(date: Date) {
  return monthLabels[date.getUTCMonth()] ?? "";
}

function formatShortMonthDay(date: Date) {
  return `${formatShortMonth(date)} ${padNumber(date.getUTCDate())}`;
}

function formatFullMonth(date: Date) {
  return `${fullMonthLabels[date.getUTCMonth()] ?? ""} ${date.getUTCFullYear()}`;
}

function formatFullDate(date: Date) {
  return `${formatShortMonth(date)} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function compareMonthKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function sortSeries<T extends AnalyticsSeriesPoint>(series: T[]) {
  return [...series].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
}

function normalizeModelName(modelName: string) {
  let normalized = modelName.trim().toLowerCase();

  normalized = normalized.replace(/^custom:/, "");

  for (const prefix of modelAliasPrefixes) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  if (
    normalized.includes("ox-alpha") ||
    normalized.includes("x-preview-f-free")
  ) {
    return "glm-5.3-flash";
  }

  normalized = normalized.replace(/-\[cliproxy\]-\d+$/, "");
  normalized = normalized.replace(/-free$/, "");

  return normalized;
}

function canonicalizeVendorModelName(modelName: string) {
  const normalized = normalizeModelName(modelName);
  let canonical = normalized;

  canonical = canonical.replace(
    /^(?:antigravity|star)-(?=(?:claude|gemini|gpt|glm|deepseek|grok|kimi|minimax|nemotron|qwen|o\d))/,
    "",
  );

  canonical = canonical.replace(/:(?:cloud)$/, "");
  canonical = canonical.replace(
    /-(?:openrouter|groq|fireworks)(?=$|-(?:thinking|reasoning)$)/,
    "",
  );
  canonical = canonical.replace(/-(?:\d{4}|\d{8})$/, "");

  canonical = canonical.replace(
    /^claude-(haiku|sonnet|opus)-(\d)-(\d)(?:-(?:thinking|reasoning))?$/,
    "claude-$2.$3-$1",
  );
  canonical = canonical.replace(
    /^claude-(haiku|sonnet|opus)-(\d(?:\.\d+)?)(?:-(?:thinking|reasoning))?$/,
    "claude-$2-$1",
  );
  canonical = canonical.replace(
    /^claude-(\d)-(\d)-(haiku|sonnet|opus)(?:-(?:thinking|reasoning))?$/,
    "claude-$1.$2-$3",
  );
  canonical = canonical.replace(
    /^claude-(\d(?:\.\d+)?)-(haiku|sonnet|opus)(?:-(?:thinking|reasoning))?$/,
    "claude-$1-$2",
  );

  canonical = canonical.replace(
    /^deepseek-chat-v(\d(?:\.\d+)?)(?:-.+)?$/,
    "deepseek-v$1",
  );
  canonical = canonical.replace(/^deepseek-r1(?:-.+)?$/, "deepseek-r1");
  canonical = canonical.replace(
    /^deepseek-v-?(\d(?:\.\d+)?(?:-exp)?)(?:-(?:thinking|reasoning))?$/,
    "deepseek-v$1",
  );

  canonical = canonical.replace(
    /^gemini-(\d(?:\.\d+)?)-flash-lite(?:-(?:thinking|reasoning))?$/,
    "gemini-$1-flash-lite",
  );
  canonical = canonical.replace(
    /^gemini-(\d(?:\.\d+)?)-(flash|pro)(?:-(?:preview|high|thinking|reasoning))$/,
    "gemini-$1-$2",
  );

  canonical = canonical.replace(
    /^glm-(\d(?:\.\d+)?)(?:-(?:thinking|reasoning))$/,
    "glm-$1",
  );

  canonical = canonical.replace(
    /^gpt-(5(?:\.\d+)?)(?:-(?:chat|thinking|reasoning))$/,
    "gpt-$1",
  );

  canonical = canonical.replace(/^minimax-(m[\d.]+)$/, "minimax-$1");

  if (canonical === "nemotron-3-super") {
    return canonical;
  }

  if (canonical.startsWith("kimi-k2.5")) {
    return "kimi-k2.5";
  }

  if (canonical.startsWith("kimi-k2")) {
    return "kimi-k2";
  }

  return canonical;
}

function classifyVendorCompany(modelName: string): VendorCompanyId | null {
  const normalized = canonicalizeVendorModelName(modelName);

  if (
    normalized.startsWith("gpt") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4") ||
    normalized.startsWith("custom:gpt-")
  ) {
    return "openai";
  }

  if (normalized.startsWith("glm")) {
    return "z-ai";
  }

  if (normalized.startsWith("claude")) {
    return "anthropic";
  }

  if (
    normalized.startsWith("gemini") ||
    normalized.startsWith("google/gemini")
  ) {
    return "google";
  }

  if (normalized.startsWith("grok")) {
    return "xai";
  }

  if (normalized.startsWith("kimi")) {
    return "moonshot";
  }

  if (normalized.startsWith("deepseek")) {
    return "deepseek";
  }

  if (normalized.startsWith("qwen")) {
    return "alibaba";
  }

  if (normalized.startsWith("minimax")) {
    return "minimax";
  }

  if (normalized.startsWith("nemotron")) {
    return "nvidia";
  }

  return null;
}

function flattenModelUsage(payload: PublishedUsagePayload) {
  const entries: FlattenedModelUsage[] = [];

  for (const provider of payload.providers) {
    for (const day of provider.daily) {
      for (const breakdown of day.breakdown) {
        const vendor = classifyVendorCompany(breakdown.name);

        if (!vendor) {
          continue;
        }

        entries.push({
          date: day.date,
          model: canonicalizeVendorModelName(breakdown.name),
          vendor,
          total: breakdown.tokens.total,
        });
      }
    }
  }

  return entries;
}

function getVisibleVendorIds(entries: FlattenedModelUsage[]) {
  const vendorTotals = new Map<VendorCompanyId, number>();
  let totalUsage = 0;

  for (const entry of entries) {
    totalUsage += entry.total;
    vendorTotals.set(
      entry.vendor,
      (vendorTotals.get(entry.vendor) ?? 0) + entry.total,
    );
  }

  const visible = new Set<VendorCompanyId>();

  for (const [vendor, total] of vendorTotals.entries()) {
    if (totalUsage > 0 && total / totalUsage >= MAJOR_VENDOR_SHARE_THRESHOLD) {
      visible.add(vendor);
    }
  }

  return visible;
}

function compareVendors(
  left: VendorCompanyId,
  right: VendorCompanyId,
  leftTotal: number,
  rightTotal: number,
) {
  const leftOrder = preferredVendorOrder.indexOf(left);
  const rightOrder = preferredVendorOrder.indexOf(right);

  if (leftOrder !== -1 || rightOrder !== -1) {
    if (leftOrder === -1) {
      return 1;
    }

    if (rightOrder === -1) {
      return -1;
    }

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
  }

  if (leftTotal !== rightTotal) {
    return rightTotal - leftTotal;
  }

  return left.localeCompare(right);
}

function extractModelVersionParts(modelName: string) {
  return [...modelName.matchAll(/\d+(?:\.\d+)?/g)].flatMap((match) =>
    match[0].split(".").map((part) => Number.parseInt(part, 10)),
  );
}

function compareNumberPartsDescending(left: number[], right: number[]) {
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? -1;
    const rightValue = right[index] ?? -1;

    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
  }

  return 0;
}

function compareModelNewness(
  left: { name: string; latestDate: string; total: number },
  right: { name: string; latestDate: string; total: number },
) {
  const versionComparison = compareNumberPartsDescending(
    extractModelVersionParts(left.name),
    extractModelVersionParts(right.name),
  );

  if (versionComparison !== 0) {
    return versionComparison;
  }

  if (left.latestDate !== right.latestDate) {
    return right.latestDate.localeCompare(left.latestDate);
  }

  if (left.total !== right.total) {
    return right.total - left.total;
  }

  return left.name.localeCompare(right.name);
}

function getVendorModelColor(
  vendor: VendorCompanyId,
  index: number,
  totalModels: number,
) {
  const baseHue = vendorBaseHues[vendor];
  const toneOffset =
    vendorToneOffsets[index % vendorToneOffsets.length] +
    Math.floor(index / vendorToneOffsets.length) * 6;
  const position = totalModels <= 1 ? 0 : index / (totalModels - 1);
  const hue = (baseHue + toneOffset + 360) % 360;
  const saturation = Math.round(82 - Math.min(position * 16, 20));
  const lightness = Math.round(24 + position * 50);

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function getCostPerMillionTokens(costUsd: number | null, totalTokens: number) {
  if (costUsd === null || totalTokens <= 0) {
    return null;
  }

  return (costUsd / totalTokens) * 1_000_000;
}

function getLatestCostMonth(
  monthlyTotals: PublishedCostPayload["monthlyTotals"],
) {
  const latest =
    [...monthlyTotals]
      .filter((row) => row.costUsd !== null)
      .sort((left, right) => right.month.localeCompare(left.month))[0] ?? null;

  return latest
    ? {
        month: latest.month,
        costUsd: latest.costUsd ?? 0,
      }
    : null;
}

function getMonthKeys(costPayload: PublishedCostPayload) {
  return [
    ...new Set([
      ...costPayload.monthlyTotals.map((row) => row.month),
      ...costPayload.harnesses.flatMap((harness) =>
        harness.monthly.map((row) => row.month),
      ),
    ]),
  ].sort(compareMonthKeys);
}

function buildHarnessCostAnalytics(
  costPayload: PublishedCostPayload,
): CostEntityAnalytics[] {
  return costPayload.harnesses.map((harness) => {
    const providerId = harness.id as ProviderId;
    const theme =
      providerId in providerDetailThemes
        ? providerDetailThemes[providerId]
        : { accent: modelFallbackColor };

    return {
      id: harness.id,
      label: harness.label,
      groupLabel: "Harness",
      color: theme.accent,
      totalCostUsd: harness.totalCostUsd,
      totalTokens: harness.totalTokens,
      costPerMillionTokens: getCostPerMillionTokens(
        harness.totalCostUsd,
        harness.totalTokens,
      ),
      hasCostData: harness.totalCostUsd !== null,
      monthly: harness.monthly.map((row) => ({
        month: row.month,
        costUsd: row.costUsd ?? 0,
        totalTokens: row.totalTokens,
      })),
    };
  });
}

function buildModelCostAnalytics(
  costPayload: PublishedCostPayload,
): CostEntityAnalytics[] {
  // Each model is priced from its own token breakdown when the artifact is
  // built, so model rows already sum to harness spend; aliases only merge rows.
  const models = new Map<
    string,
    {
      totalCostUsd: number;
      totalTokens: number;
      monthly: Map<
        string,
        { month: string; costUsd: number; totalTokens: number }
      >;
    }
  >();

  for (const model of costPayload.models) {
    const canonicalName = canonicalizeVendorModelName(model.name);
    const current = models.get(canonicalName) ?? {
      totalCostUsd: 0,
      totalTokens: 0,
      monthly: new Map(),
    };

    current.totalCostUsd += model.totalCostUsd;
    current.totalTokens += model.totalTokens;

    for (const row of model.monthly) {
      const month = current.monthly.get(row.month) ?? {
        month: row.month,
        costUsd: 0,
        totalTokens: 0,
      };

      month.costUsd += row.costUsd ?? 0;
      month.totalTokens += row.totalTokens;
      current.monthly.set(row.month, month);
    }

    models.set(canonicalName, current);
  }

  const vendorIndexes = new Map<VendorCompanyId, number>();

  return [...models.entries()].map(([canonicalName, model]) => {
    const vendor = classifyVendorCompany(canonicalName);
    const vendorIndex = vendor ? (vendorIndexes.get(vendor) ?? 0) : 0;

    if (vendor) {
      vendorIndexes.set(vendor, vendorIndex + 1);
    }

    return {
      id: `model:${canonicalName}`,
      label: canonicalName,
      groupLabel: vendor ? vendorTitles[vendor] : "Unknown",
      color: vendor
        ? getVendorModelColor(vendor, vendorIndex, models.size)
        : modelFallbackColor,
      totalCostUsd: model.totalCostUsd,
      totalTokens: model.totalTokens,
      costPerMillionTokens: getCostPerMillionTokens(
        model.totalCostUsd,
        model.totalTokens,
      ),
      hasCostData: true,
      monthly: [...model.monthly.values()].sort((left, right) =>
        compareMonthKeys(left.month, right.month),
      ),
    };
  });
}

export function buildCostAnalytics(
  costPayload: PublishedCostPayload | null,
): CostAnalytics | null {
  if (!costPayload) {
    return null;
  }

  const harnesses = buildHarnessCostAnalytics(costPayload);
  const models = buildModelCostAnalytics(costPayload);
  const topHarness =
    [...harnesses]
      .filter((harness) => harness.totalCostUsd !== null)
      .sort(
        (left, right) => (right.totalCostUsd ?? 0) - (left.totalCostUsd ?? 0),
      )[0] ?? null;

  const modelTotalCostUsd = models.reduce(
    (sum, model) => sum + (model.totalCostUsd ?? 0),
    0,
  );

  return {
    generatedAt: costPayload.generatedAt,
    source: costPayload.source,
    coverageNote: costPayload.coverageNote,
    dateRange: costPayload.dateRange,
    harnessTotalCostUsd: costPayload.harnessTotalCostUsd,
    modelTotalCostUsd,
    latestMonth: getLatestCostMonth(costPayload.monthlyTotals),
    topHarness,
    harnesses,
    models,
    monthKeys: getMonthKeys(costPayload),
  };
}

function getLatestUsageDate(payload: PublishedUsagePayload) {
  let latestDate: string | null = null;

  for (const provider of payload.providers) {
    for (const day of provider.daily) {
      if (!latestDate || day.date > latestDate) {
        latestDate = day.date;
      }
    }
  }

  return latestDate ? parseDateToUtc(latestDate) : null;
}

function getLatestUsageDateKey(payload: PublishedUsagePayload) {
  const latestDate = getLatestUsageDate(payload);
  return latestDate ? formatDateKey(latestDate) : null;
}

function getEarliestUsageDate(payload: PublishedUsagePayload) {
  let earliestDate: string | null = null;

  for (const provider of payload.providers) {
    for (const day of provider.daily) {
      if (!earliestDate || day.date < earliestDate) {
        earliestDate = day.date;
      }
    }
  }

  return earliestDate ? parseDateToUtc(earliestDate) : null;
}

function getBucketDefinitions(
  scale: ModelsTimeScale,
  earliestDate: Date,
  latestDate: Date,
): BucketDefinition[] {
  if (scale === "year") {
    const currentYearStart = startOfUtcYear(latestDate);
    const buckets: BucketDefinition[] = [];

    for (let offset = 4; offset >= 0; offset -= 1) {
      const start = addUtcYears(currentYearStart, -offset);
      const end = addUtcYears(start, 1);

      buckets.push({
        key: String(start.getUTCFullYear()),
        label: String(start.getUTCFullYear()),
        description: String(start.getUTCFullYear()),
        start: start.getTime(),
        end: end.getTime(),
      });
    }

    return buckets;
  }

  if (scale === "month") {
    const currentMonthStart = startOfUtcMonth(latestDate);
    const buckets: BucketDefinition[] = [];

    for (let offset = 11; offset >= 0; offset -= 1) {
      const start = addUtcMonths(currentMonthStart, -offset);
      const end = addUtcMonths(start, 1);

      buckets.push({
        key: `${start.getUTCFullYear()}-${padNumber(start.getUTCMonth() + 1)}`,
        label: formatShortMonth(start),
        description: formatFullMonth(start),
        start: start.getTime(),
        end: end.getTime(),
      });
    }

    return buckets;
  }

  if (scale === "week") {
    const earliestWeekStart = startOfIsoWeek(earliestDate);
    const currentWeekStart = startOfIsoWeek(latestDate);
    const buckets: BucketDefinition[] = [];

    for (
      let start = earliestWeekStart;
      start.getTime() <= currentWeekStart.getTime();
      start = addUtcDays(start, 7)
    ) {
      const end = addUtcDays(start, 7);

      buckets.push({
        key: formatDateKey(start),
        label: formatShortMonthDay(start),
        description: `Week of ${formatFullDate(start)}`,
        start: start.getTime(),
        end: end.getTime(),
      });
    }

    return buckets;
  }

  const buckets: BucketDefinition[] = [];

  for (
    let start = earliestDate;
    start.getTime() <= latestDate.getTime();
    start = addUtcDays(start, 1)
  ) {
    const end = addUtcDays(start, 1);

    buckets.push({
      key: formatDateKey(start),
      label: String(start.getUTCDate()),
      description: formatFullDate(start),
      start: start.getTime(),
      end: end.getTime(),
    });
  }

  return buckets;
}

function getBucketKeyForDate(scale: ModelsTimeScale, value: string) {
  const date = parseDateToUtc(value);

  if (scale === "year") {
    return String(date.getUTCFullYear());
  }

  if (scale === "month") {
    return `${date.getUTCFullYear()}-${padNumber(date.getUTCMonth() + 1)}`;
  }

  if (scale === "week") {
    return formatDateKey(startOfIsoWeek(date));
  }

  return formatDateKey(date);
}

function buildVendorBuckets(
  entries: FlattenedModelUsage[],
  earliestDate: Date,
  latestDate: Date,
  scale: ModelsTimeScale,
  modelColorMap: Map<string, string>,
): VendorModelsBucket[] {
  const buckets = getBucketDefinitions(scale, earliestDate, latestDate);
  const bucketTotals = buckets.map(() => 0);
  const bucketModelTotals = buckets.map(() => new Map<string, number>());
  const bucketIndexes = new Map(
    buckets.map((bucket, index) => [bucket.key, index] as const),
  );

  for (const entry of entries) {
    const bucketIndex = bucketIndexes.get(
      getBucketKeyForDate(scale, entry.date),
    );

    if (bucketIndex === undefined) {
      continue;
    }

    bucketTotals[bucketIndex] += entry.total;
    bucketModelTotals[bucketIndex].set(
      entry.model,
      (bucketModelTotals[bucketIndex].get(entry.model) ?? 0) + entry.total,
    );
  }

  const orderedModels = [...modelColorMap.keys()];

  return buckets.map((bucket, index) => {
    const modelTotals = bucketModelTotals[index];
    const segments = orderedModels
      .map((modelName) => {
        const total = modelTotals.get(modelName) ?? 0;

        if (total <= 0) {
          return null;
        }

        return {
          name: modelName,
          total,
          color: modelColorMap.get(modelName) ?? "",
        };
      })
      .filter((segment) => segment !== null);

    return {
      key: bucket.key,
      label: bucket.label,
      description: bucket.description,
      total: bucketTotals[index],
      segments,
    };
  });
}

function buildVendorAnalytics(
  payload: PublishedUsagePayload,
): VendorModelsAnalytics[] {
  const flattened = flattenModelUsage(payload);
  const earliestDate = getEarliestUsageDate(payload);
  const latestDate = getLatestUsageDate(payload);

  if (!earliestDate || !latestDate) {
    return [];
  }

  const visibleVendors = getVisibleVendorIds(flattened);
  const rowEntries = new Map<VendorCompanyId, FlattenedModelUsage[]>();

  for (const entry of flattened) {
    if (!visibleVendors.has(entry.vendor)) {
      continue;
    }

    const bucket = rowEntries.get(entry.vendor);

    if (bucket) {
      bucket.push(entry);
    } else {
      rowEntries.set(entry.vendor, [entry]);
    }
  }

  return [...rowEntries.entries()]
    .map(([vendor, entries]) => {
      const total = entries.reduce((sum, entry) => sum + entry.total, 0);
      const modelStats = new Map<
        string,
        { total: number; latestDate: string }
      >();

      for (const entry of entries) {
        const existing = modelStats.get(entry.model);

        if (existing) {
          existing.total += entry.total;

          if (entry.date > existing.latestDate) {
            existing.latestDate = entry.date;
          }

          continue;
        }

        modelStats.set(entry.model, {
          total: entry.total,
          latestDate: entry.date,
        });
      }

      const sortedModels = [...modelStats.entries()].sort((left, right) => {
        if (right[1].total !== left[1].total) {
          return right[1].total - left[1].total;
        }

        return left[0].localeCompare(right[0]);
      });
      const colorOrderedModels = [...modelStats.entries()]
        .map(([modelName, stats]) => ({
          name: modelName,
          total: stats.total,
          latestDate: stats.latestDate,
        }))
        .sort(compareModelNewness);
      const modelColorMap = new Map<string, string>();

      for (const [index, model] of colorOrderedModels.entries()) {
        modelColorMap.set(
          model.name,
          getVendorModelColor(vendor, index, colorOrderedModels.length),
        );
      }

      const topModels = sortedModels.map(([modelName, modelTotal]) => ({
        name: modelName,
        total: modelTotal.total,
        share: total > 0 ? modelTotal.total / total : 0,
      })) satisfies AnalyticsModelShare[];

      return {
        vendor,
        name: vendorTitles[vendor],
        total,
        share: 0,
        topModels,
        modelColors: colorOrderedModels.map((model) => ({
          name: model.name,
          color: modelColorMap.get(model.name) ?? "",
        })),
        scales: {
          year: buildVendorBuckets(
            entries,
            earliestDate,
            latestDate,
            "year",
            modelColorMap,
          ),
          month: buildVendorBuckets(
            entries,
            earliestDate,
            latestDate,
            "month",
            modelColorMap,
          ),
          week: buildVendorBuckets(
            entries,
            earliestDate,
            latestDate,
            "week",
            modelColorMap,
          ),
          day: buildVendorBuckets(
            entries,
            earliestDate,
            latestDate,
            "day",
            modelColorMap,
          ),
        },
      };
    })
    .sort((left, right) =>
      compareVendors(left.vendor, right.vendor, left.total, right.total),
    );
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 10_000 ? 1 : 2,
  }).format(value);
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function getProviderTitle(provider: ProviderId) {
  return providerTitles[provider];
}

export function getProviderDetailTheme(provider: ProviderId) {
  return providerDetailThemes[provider];
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

  const daily = [...provider.daily]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day) => {
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
        const modelName = normalizeModelName(breakdown.name);

        modelTotals.set(
          modelName,
          (modelTotals.get(modelName) ?? 0) + breakdown.tokens.total,
        );
      }

      return {
        date: day.date,
        total: day.total,
        input: day.input,
        output: day.output,
        cacheInput: day.cache.input,
        cacheOutput: day.cache.output,
      };
    });

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
    share: 0,
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
          name: normalizeModelName(provider.insights.mostUsedModel.name),
          total: provider.insights.mostUsedModel.tokens.total,
        }
      : null,
    recentMostUsedModel: provider.insights?.recentMostUsedModel
      ? {
          name: normalizeModelName(provider.insights.recentMostUsedModel.name),
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
    daily,
  };
}

/**
 * Daily token totals per provider for the `rangeDays` days ending on the
 * latest published day. Missing days are zero; providers without usage in the
 * range are dropped. Layers are ordered by range total, largest first.
 */
export function buildDailyBurn(
  providers: ProviderAnalytics[],
  rangeDays: number,
): DailyBurn {
  return buildSeriesBurn(
    providers.map((provider) => ({
      provider: provider.provider,
      title: getProviderTitle(provider.provider),
      accent: getProviderDetailTheme(provider.provider).accent,
      daily: provider.daily,
      currentStreak: provider.currentStreak,
      longestStreak: provider.longestStreak,
    })),
    rangeDays,
  );
}

export function buildSeriesBurn(
  providers: BurnSeries[],
  rangeDays: number,
  latestDate?: string | null,
): DailyBurn {
  let endDate: string | null = latestDate ?? null;

  for (const provider of providers) {
    for (const day of provider.daily) {
      if (!endDate || day.date > endDate) {
        endDate = day.date;
      }
    }
  }

  if (!endDate || rangeDays < 1) {
    return {
      dates: [],
      totals: [],
      total: 0,
      activeDays: 0,
      peak: null,
      layers: [],
    };
  }

  const start = addUtcDays(parseDateToUtc(endDate), 1 - rangeDays);
  const dates = Array.from({ length: rangeDays }, (_, index) =>
    formatDateKey(addUtcDays(start, index)),
  );
  const indexByDate = new Map(dates.map((date, index) => [date, index]));
  const layers: DailyBurnLayer[] = [];

  for (const provider of providers) {
    const values = new Array<number>(rangeDays).fill(0);
    const layer: DailyBurnLayer = {
      provider: provider.provider,
      title: provider.title,
      accent: provider.accent,
      values,
      total: 0,
      input: 0,
      output: 0,
      cache: 0,
      activeDays: 0,
      peak: null,
      currentStreak: provider.currentStreak,
      longestStreak: provider.longestStreak,
    };

    for (const day of provider.daily) {
      const index = indexByDate.get(day.date);

      if (index === undefined || day.total <= 0) {
        continue;
      }

      if (values[index] === 0) {
        layer.activeDays += 1;
      }

      values[index] += day.total;
      layer.total += day.total;
      layer.input += day.input;
      layer.output += day.output;
      layer.cache += day.cacheInput + day.cacheOutput;
    }

    if (layer.total === 0) {
      continue;
    }

    values.forEach((value, index) => {
      if (value > 0 && (!layer.peak || value > layer.peak.total)) {
        layer.peak = { date: dates[index], total: value };
      }
    });
    layers.push(layer);
  }

  layers.sort((left, right) => right.total - left.total);

  const totals = dates.map((_, index) =>
    layers.reduce((sum, layer) => sum + layer.values[index], 0),
  );
  let peak: DailyBurn["peak"] = null;

  totals.forEach((total, index) => {
    if (total > 0 && (!peak || total > peak.total)) {
      peak = { date: dates[index], total };
    }
  });

  return {
    dates,
    totals,
    total: totals.reduce((sum, total) => sum + total, 0),
    activeDays: totals.filter((total) => total > 0).length,
    peak,
    layers,
  };
}

export function buildAnalytics(
  payload: PublishedUsagePayload,
  costPayload: PublishedCostPayload | null = null,
): DetailsAnalytics {
  const providers = payload.providers.map(buildProviderAnalytics);
  const vendors = buildVendorAnalytics(payload);
  const cost = buildCostAnalytics(costPayload);
  const latestUsageDate = getLatestUsageDateKey(payload);
  const providerTotal = providers.reduce(
    (sum, provider) => sum + provider.total,
    0,
  );
  const vendorTotal = vendors.reduce((sum, vendor) => sum + vendor.total, 0);

  for (const provider of providers) {
    provider.share = providerTotal > 0 ? provider.total / providerTotal : 0;
  }

  for (const vendor of vendors) {
    vendor.share = vendorTotal > 0 ? vendor.total / vendorTotal : 0;
  }

  return {
    providers,
    models: buildModelBurnSeries(payload, "model", latestUsageDate),
    families: buildModelBurnSeries(payload, "family", latestUsageDate),
    vendors,
    cost,
    latestUsageDate,
  };
}

const modelFamilyPatterns: [RegExp, string, number][] = [
  [/^gpt(?:[-\s]|$)/, vendorTitles.openai, vendorBaseHues.openai],
  [/^o\d(?:-|$)/, vendorTitles.openai, vendorBaseHues.openai],
  [/^claude(?:[-\s]|$)/, vendorTitles.anthropic, vendorBaseHues.anthropic],
  [/^gemini(?:[-\s]|$)/, vendorTitles.google, vendorBaseHues.google],
  [/^gemma(?:[-\d:\s]|$)/, vendorTitles.google, vendorBaseHues.google],
  [/^glm(?:[-\d\s]|$)/, vendorTitles["z-ai"], vendorBaseHues["z-ai"]],
  [/^kimi(?:[-\s]|$)/, vendorTitles.moonshot, vendorBaseHues.moonshot],
  [/^deepseek(?:[-\s]|$)/, vendorTitles.deepseek, vendorBaseHues.deepseek],
  [/^qwen(?:[\d.\-\s]|$)/, vendorTitles.alibaba, vendorBaseHues.alibaba],
  [/^grok(?:[-\s]|$)/, vendorTitles.xai, vendorBaseHues.xai],
  [/^minimax(?:[-\s]|$)/, vendorTitles.minimax, vendorBaseHues.minimax],
  [/^nemotron(?:[-\s]|$)/, vendorTitles.nvidia, vendorBaseHues.nvidia],
  [/^muse(?:[-\s]|$)/, "Meta", 220],
  [/^union-alpha(?:[-\s]|$)/, "Unbiased (Pareto)", 280],
  [/^pareto(?:[-\s]|$)/, "Unbiased (Pareto)", 280],
  [/^mimo(?:[-\s]|$)/, "Xiaomi", 15],
  [
    /^duo-chat-(?:opus|sonnet|haiku)(?:-|$)/,
    "Anthropic",
    vendorBaseHues.anthropic,
  ],
  [/^duo-chat-gpt(?:-|$)/, "OpenAI", vendorBaseHues.openai],
  [/^sherlock-think-alpha(?:-|$)/, "xAI", vendorBaseHues.xai],
];

const modelFamilyNameOverrides: [RegExp, string][] = [
  [/^big-pickle(?:-|$)/, "Big Pickle"],
  [/^cursor-auto(?:-|$)/, "Cursor Auto"],
  [/^horizon-beta(?:-|$)/, "Horizon Beta"],
  [/^kiro-auto(?:-|$)/, "Kiro Auto"],
];

function getModelFamilyDefinition(modelName: string) {
  const normalized = canonicalizeVendorModelName(modelName);
  const name = normalized
    .replace(
      /^(?:zen-|openrouter\/|meta\/|unbiased\/|xiaomi\/|opencode\/)+/,
      "",
    )
    .replace(/^stealth\/union-alpha(?=-|$)/, "union-alpha");
  const match = modelFamilyPatterns.find(([pattern]) => pattern.test(name));
  if (match) return { label: match[1], hue: match[2] };

  const label = modelFamilyNameOverrides.find(([pattern]) =>
    pattern.test(name),
  )?.[1];
  return { label: label ?? normalized, hue: null };
}

/** Group known models by their maker; unknown model IDs remain separate. */
export function getModelFamily(modelName: string) {
  return getModelFamilyDefinition(modelName).label;
}

export function buildModelBurnSeries(
  payload: PublishedUsagePayload,
  group: "model" | "family" = "model",
  latestUsageDate = getLatestUsageDateKey(payload),
): BurnSeries[] {
  const groups = new Map<string, Map<string, BurnSeries["daily"][number]>>();
  const groupHues = new Map<string, number | null>();
  const latestKey = latestUsageDate ?? "";
  for (const provider of payload.providers) {
    for (const day of provider.daily) {
      const rows = day.breakdown.map((row) => ({
        name: canonicalizeVendorModelName(row.name) || "Unknown model",
        total: row.tokens.total,
        input: row.tokens.input,
        output: row.tokens.output,
        cacheInput: row.tokens.cache.input,
        cacheOutput: row.tokens.cache.output,
      }));
      // Older published days may not have a complete model breakdown.
      const breakdownTotals = {
        total: 0,
        input: 0,
        output: 0,
        cacheInput: 0,
        cacheOutput: 0,
      };
      for (const row of rows) {
        breakdownTotals.total += row.total;
        breakdownTotals.input += row.input;
        breakdownTotals.output += row.output;
        breakdownTotals.cacheInput += row.cacheInput;
        breakdownTotals.cacheOutput += row.cacheOutput;
      }
      if (day.total > breakdownTotals.total)
        rows.push({
          name: "Unattributed",
          total: day.total - breakdownTotals.total,
          input: Math.max(0, day.input - breakdownTotals.input),
          output: Math.max(0, day.output - breakdownTotals.output),
          cacheInput: Math.max(0, day.cache.input - breakdownTotals.cacheInput),
          cacheOutput: Math.max(
            0,
            day.cache.output - breakdownTotals.cacheOutput,
          ),
        });
      for (const row of rows) {
        if (row.total <= 0) continue;
        const family =
          row.name === "Unattributed"
            ? null
            : getModelFamilyDefinition(row.name);
        const name = group === "family" && family ? family.label : row.name;
        const days =
          groups.get(name) ?? new Map<string, BurnSeries["daily"][number]>();
        const entry = days.get(day.date) ?? {
          date: day.date,
          total: 0,
          input: 0,
          output: 0,
          cacheInput: 0,
          cacheOutput: 0,
        };
        for (const key of [
          "total",
          "input",
          "output",
          "cacheInput",
          "cacheOutput",
        ] as const)
          entry[key] += row[key];
        days.set(day.date, entry);
        groups.set(name, days);
        if (!groupHues.has(name)) groupHues.set(name, family?.hue ?? null);
      }
    }
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, days]) => {
      const daily = [...days.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      let streak = 0,
        longestStreak = 0;
      let previous = "";
      for (const day of daily) {
        streak =
          previous &&
          formatDateKey(addUtcDays(parseDateToUtc(previous), 1)) === day.date
            ? streak + 1
            : 1;
        longestStreak = Math.max(longestStreak, streak);
        previous = day.date;
      }
      const hue = groupHues.get(name);
      return {
        provider: `${group}:${name}`,
        title: name,
        accent:
          hue === null || hue === undefined
            ? modelFallbackColor
            : `hsl(${hue} 74% 58%)`,
        daily,
        longestStreak,
        currentStreak: previous === latestKey ? streak : 0,
      };
    });
}
