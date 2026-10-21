import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";
import { heatmapThemes, renderUsageHeatmapsSvg } from "../../cli/src/graph";
import {
  createJsonExportPayload,
  mergeJsonExportsToPublishedUsage,
  toJsonUsageSummary,
  type PublishedUsagePayload,
} from "../../cli/src/lib/export";
import { mergeUsageSummaries } from "../../cli/src/lib/utils";
import { providerIds, aggregateUsage } from "../../cli/src/providers";
import { loadLatestModelPrices } from "../lib/model-prices";
import type { PublishedCostPayload } from "../lib/types";
import type {
  JsonExportPayload,
  JsonUsageSummary,
  UsageSummary,
} from "../../cli/src/interfaces";
import { writePublishedCostArtifact } from "./lib/cost-analysis";
import { syncPublishedArtifactsToGitBackupRepo } from "./lib/git-backup";
import { loadT3PublishedSummary } from "./lib/t3-chat";

const DEFAULT_IMPORT_PATH = ".slopmeter-data/imports/windows-history.json";
const DEFAULT_T3_IMPORT_PATH = ".local/share/slopmeter/t3-chat-export.json";
const DEFAULT_OPENCODE_RECOVERY_IMPORT_PATH =
  ".local/share/opencode/recovery/t3-chat-export-opencode-recovered.json";
const DEFAULT_OPENCODE_DAILY_RECOVERY_IMPORT_PATH =
  ".local/share/opencode/recovery/opencode-daily-recovered.json";
const DEFAULT_LOCAL_OUTPUT_PATH = ".slopmeter-data/published/daily-usage.json";
const DEFAULT_LOCAL_COST_OUTPUT_PATH =
  ".slopmeter-data/published/cost-analysis.json";
const DEFAULT_LOCAL_SVG_OUTPUT_PATH =
  ".slopmeter-data/published/heatmap-last-year.svg";
const DEFAULT_LOCAL_HISTORY_DIR = ".slopmeter-data/history";
const LOCAL_HISTORY_SNAPSHOTS_KEPT = 30;
const DEFAULT_BUNDLED_MODULE_OUTPUT_PATH =
  "packages/web/lib/published-data.generated.ts";
const DEFAULT_BLOB_PATH = "slopmeter/daily-usage.json";
const DEFAULT_SVG_BLOB_PATH = "slopmeter/heatmap-last-year.svg";
const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const CLAUDE_EXCLUDED_DATES = new Set(["2026-03-10", "2026-03-17"]);
export const WEB_PROVIDER_ORDER = [
  "codex",
  "nanoclaw",
  "omp",
  "opencode",
  "claude",
  "hermes",
  "droid",
  "pi",
  "t3",
  "agy",
  "gemini",
  "cursor",
  "helios",
] as const;

function getDateWindow() {
  const start = new Date();

  start.setHours(0, 0, 0, 0);
  start.setFullYear(start.getFullYear() - 1);

  const end = new Date();

  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function readImportedPayload(importPath: string) {
  if (!existsSync(importPath)) {
    return null;
  }

  return JSON.parse(readFileSync(importPath, "utf8")) as ReturnType<
    typeof createJsonExportPayload
  >;
}

async function readHostedPayload() {
  const dataUrl = process.env.SLOPMETER_WEB_DATA_URL?.trim();

  if (!dataUrl) {
    return null;
  }

  const response = await fetch(dataUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PublishedUsagePayload;
}

function readExistingPublishedPayload(localOutputPath: string) {
  if (!existsSync(localOutputPath)) {
    return null;
  }

  return JSON.parse(
    readFileSync(localOutputPath, "utf8"),
  ) as PublishedUsagePayload;
}

function resolveRepoPath(pathValue: string) {
  return resolve(REPO_ROOT, pathValue);
}

function resolveHomePath(pathValue: string) {
  return resolve(homedir(), pathValue);
}

function formatBackupTimestamp(value: Date) {
  return value.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

export function buildPublishedBackupPaths(historyDir: string, updatedAt: Date) {
  const snapshotDir = resolve(historyDir, formatBackupTimestamp(updatedAt));

  return {
    snapshotDir,
    jsonPath: resolve(snapshotDir, "daily-usage.json"),
    svgPath: resolve(snapshotDir, "heatmap-last-year.svg"),
  };
}

export function writePublishedBackupArtifacts({
  historyDir,
  payload,
  svg,
  updatedAt,
}: {
  historyDir: string;
  payload: PublishedUsagePayload;
  svg: string;
  updatedAt: Date;
}) {
  const paths = buildPublishedBackupPaths(historyDir, updatedAt);

  mkdirSync(paths.snapshotDir, { recursive: true });
  writeFileSync(
    paths.jsonPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(paths.svgPath, svg, "utf8");

  // Every published dataset is also a commit on GitHub, so these local
  // snapshots are only a quick-restore cache; keep the newest ones and stop
  // them from filling the publisher's disk.
  const snapshots = readdirSync(historyDir).sort();

  for (const name of snapshots.slice(0, -LOCAL_HISTORY_SNAPSHOTS_KEPT)) {
    rmSync(resolve(historyDir, name), { recursive: true, force: true });
  }

  return paths;
}

// Keep the published dataset in the web bundle so production serves the recovered snapshot directly.
export function buildBundledPublishedDataModule(
  payload: PublishedUsagePayload,
  svg: string,
  costPayload: PublishedCostPayload | null = null,
) {
  return [
    'import type { PublishedCostPayload, PublishedUsagePayload } from "./types";',
    "",
    "export const publishedUsagePayload: PublishedUsagePayload = " +
      JSON.stringify(payload, null, 2) +
      ";",
    "",
    "export const publishedCostPayload: PublishedCostPayload | null = " +
      JSON.stringify(costPayload, null, 2) +
      ";",
    "",
    "export const publishedSvgMarkup = " + JSON.stringify(svg) + ";",
    "",
  ].join("\n");
}

export function writeBundledPublishedArtifacts({
  modulePath,
  payload,
  svg,
  costPayload = null,
}: {
  modulePath: string;
  payload: PublishedUsagePayload;
  svg: string;
  costPayload?: PublishedCostPayload | null;
}) {
  mkdirSync(dirname(modulePath), { recursive: true });
  writeFileSync(
    modulePath,
    buildBundledPublishedDataModule(payload, svg, costPayload),
    "utf8",
  );
}

// Published history is the system of record. Local sources are lossy over time:
// Claude prunes old sessions, Codex compresses old rollouts, remote machine
// exports can lag, and a loader can regress. Only the most recent days may be
// recomputed downward (so same-day dedup fixes still land); older rows may
// grow (new machine backfill) but never shrink.
const RECOMPUTE_WINDOW_DAYS = 2;

function sumProviderDateTotals(payloads: JsonExportPayload[]) {
  const totals = new Map<string, number>();

  for (const payload of payloads) {
    for (const provider of payload.providers) {
      for (const row of provider.daily) {
        const key = `${provider.provider}:${row.date}`;

        totals.set(key, (totals.get(key) ?? 0) + row.total);
      }
    }
  }

  return totals;
}

function filterPayloadRows(
  payload: JsonExportPayload,
  keep: (providerDateKey: string) => boolean,
): JsonExportPayload | null {
  const providers: JsonExportPayload["providers"] = [];

  for (const provider of payload.providers) {
    const daily = provider.daily.filter((row) =>
      keep(`${provider.provider}:${row.date}`),
    );

    if (daily.length === 0) {
      continue;
    }

    providers.push({
      ...provider,
      daily,
    });
  }

  if (providers.length === 0) {
    return null;
  }

  return {
    ...payload,
    providers,
  };
}

function filterImportableProviders(
  payload: JsonExportPayload,
): JsonExportPayload {
  return {
    ...payload,
    providers: payload.providers.filter(
      (provider) => provider.provider !== "all" && provider.provider !== "t3",
    ),
  };
}

// Picks, per provider/date, either the hosted row or the fresh rows. Fresh
// rows from several sources (this host, machine imports, recovery) are summed
// later by mergeJsonExportsToPublishedUsage, so the comparison uses their
// combined total.
function buildCanonicalPayloadInputs({
  currentPayload,
  importedPayload,
  opencodeDailyRecoveryPayload,
  hostedPayload,
}: {
  currentPayload: JsonExportPayload;
  importedPayload: JsonExportPayload | null;
  opencodeDailyRecoveryPayload: JsonExportPayload | null;
  hostedPayload: PublishedUsagePayload | null;
}) {
  const freshPayloads = [
    opencodeDailyRecoveryPayload,
    importedPayload,
    currentPayload,
  ]
    .filter((payload): payload is JsonExportPayload => payload !== null)
    .map((payload) => filterImportableProviders(payload));

  if (!hostedPayload) {
    return freshPayloads;
  }

  const hosted = filterImportableProviders(toJsonExportPayload(hostedPayload));
  const hostedTotals = sumProviderDateTotals([hosted]);
  const freshTotals = sumProviderDateTotals(freshPayloads);
  const recomputeFrom = new Date(`${currentPayload.end}T00:00:00.000Z`);

  recomputeFrom.setUTCDate(
    recomputeFrom.getUTCDate() + 1 - RECOMPUTE_WINDOW_DAYS,
  );

  const recomputeFromKey = recomputeFrom.toISOString().slice(0, 10);
  const freshWins = (key: string) => {
    const freshTotal = freshTotals.get(key);
    const hostedTotal = hostedTotals.get(key);

    if (freshTotal === undefined) {
      return false;
    }

    return (
      hostedTotal === undefined ||
      key.slice(key.indexOf(":") + 1) >= recomputeFromKey ||
      // Equal totals still take the fresh row so loader fixes to the model
      // breakdown (e.g. newly recognized models) reach older days.
      freshTotal >= hostedTotal
    );
  };

  return [
    filterPayloadRows(hosted, (key) => !freshWins(key)),
    ...freshPayloads.map((payload) => filterPayloadRows(payload, freshWins)),
  ].filter((payload): payload is JsonExportPayload => payload !== null);
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00`);
}

function toUsageSummary(
  provider: PublishedUsagePayload["providers"][number],
): UsageSummary {
  return {
    provider: provider.provider,
    insights: provider.insights,
    daily: provider.daily.map((row) => ({
      date: parseDateOnly(row.date),
      input: row.input,
      output: row.output,
      cache: row.cache,
      total: row.total,
      displayValue: row.displayValue,
      breakdown: row.breakdown,
    })),
  };
}

function toJsonExportPayload(
  payload: PublishedUsagePayload,
): JsonExportPayload {
  return {
    version: payload.version,
    start: payload.start,
    end: payload.end,
    providers: payload.providers.filter(
      (provider) => provider.provider !== "t3",
    ),
  };
}

function getMergedSectionTitle(providers: UsageSummary[]) {
  return providers
    .map((provider) => heatmapThemes[provider.provider].title)
    .join(" / ");
}

function sanitizePublishedProvider(
  provider: PublishedUsagePayload["providers"][number],
  endDate: Date,
) {
  if (provider.provider !== "claude") {
    return provider;
  }

  const daily = provider.daily.filter(
    (row) => !CLAUDE_EXCLUDED_DATES.has(row.date),
  );

  if (daily.length === provider.daily.length) {
    return provider;
  }

  return toJsonUsageSummary(
    mergeUsageSummaries(
      provider.provider,
      [
        toUsageSummary({
          ...provider,
          daily,
        }),
      ],
      endDate,
    ),
  );
}

function sanitizePublishedPayload(payload: PublishedUsagePayload) {
  const endDate = parseDateOnly(payload.end);
  const sanitizedProviders = payload.providers.map((provider) =>
    sanitizePublishedProvider(provider, endDate),
  );
  const continuityProviders = foldGeminiIntoAntigravityProvider(
    sanitizedProviders,
    endDate,
  );

  return {
    ...payload,
    providers: sortPublishedProviders(continuityProviders),
  };
}

/**
 * Fold raw "gemini" provider data into "agy" in a JsonExportPayload BEFORE
 * the hosted-data merge. This is the critical anti-inflation step: by folding
 * in the raw payload, the resulting "agy:" date keys are visible to
 * filterPayloadByProviderDateKeys, which then removes stale hosted "agy"
 * entries for those dates. Without this, the post-merge fold in
 * sanitizePublishedPayload would stack gemini data on every publish cycle.
 */
function foldGeminiInJsonExportPayload(
  payload: JsonExportPayload,
): JsonExportPayload {
  const agy = payload.providers.find((p) => p.provider === "agy");
  const gemini = payload.providers.find((p) => p.provider === "gemini");

  if (!gemini) {
    return payload;
  }

  const sources: JsonUsageSummary[] = [];
  if (agy) sources.push(agy);
  sources.push(gemini);

  const merged = toJsonUsageSummary(
    mergeUsageSummaries(
      "agy",
      sources.map((s) => ({
        provider: s.provider as UsageSummary["provider"],
        insights: s.insights,
        daily: s.daily.map((d) => ({
          date: parseDateOnly(d.date),
          input: d.input,
          output: d.output,
          cache: d.cache,
          total: d.total,
          breakdown: d.breakdown,
        })),
      })),
      new Date(),
    ),
  );

  return {
    ...payload,
    providers: [
      ...payload.providers.filter(
        (p) => p.provider !== "agy" && p.provider !== "gemini",
      ),
      merged,
    ],
  };
}

function foldGeminiIntoAntigravityProvider(
  providers: PublishedUsagePayload["providers"],
  endDate: Date,
) {
  const agySources = providers.filter(
    (provider) => provider.provider === "agy" || provider.provider === "gemini",
  );

  if (agySources.length <= 1) {
    // Already folded (single "agy", no raw "gemini") or nothing to fold.
    return providers;
  }

  const antigravitySummary = toJsonUsageSummary(
    mergeUsageSummaries("agy", agySources.map(toUsageSummary), endDate),
  );

  return [
    ...providers.filter(
      (provider) =>
        provider.provider !== "agy" && provider.provider !== "gemini",
    ),
    antigravitySummary,
  ];
}

function renderPublishedSvg(payload: PublishedUsagePayload) {
  const providerSummaries = WEB_PROVIDER_ORDER.flatMap((providerId) => {
    const summary = payload.providers.find(
      (provider) => provider.provider === providerId,
    );

    return summary ? [toUsageSummary(summary)] : [];
  });
  const mergedSummary = mergeUsageSummaries(
    "all",
    providerSummaries,
    parseDateOnly(payload.end),
  );

  return renderUsageHeatmapsSvg({
    startDate: parseDateOnly(payload.start),
    endDate: parseDateOnly(payload.end),
    colorMode: "dark",
    sections: [
      {
        daily: mergedSummary.daily,
        insights: mergedSummary.insights,
        title: getMergedSectionTitle(providerSummaries),
        titleCaption: heatmapThemes.all.titleCaption,
        colors: heatmapThemes.all.colors,
      },
      ...providerSummaries.map((summary) => ({
        daily: summary.daily,
        insights: summary.insights,
        title: heatmapThemes[summary.provider].title,
        titleCaption: heatmapThemes[summary.provider].titleCaption,
        colors: heatmapThemes[summary.provider].colors,
      })),
    ],
  });
}

export function sortPublishedProviders(
  providers: PublishedUsagePayload["providers"],
) {
  const ordered = new Map(
    WEB_PROVIDER_ORDER.map((providerId, index) => [providerId, index]),
  );

  return [...providers].sort((left, right) => {
    const leftOrder =
      ordered.get(left.provider as (typeof WEB_PROVIDER_ORDER)[number]) ??
      Number.MAX_SAFE_INTEGER;
    const rightOrder =
      ordered.get(right.provider as (typeof WEB_PROVIDER_ORDER)[number]) ??
      Number.MAX_SAFE_INTEGER;

    return (
      leftOrder - rightOrder || left.provider.localeCompare(right.provider)
    );
  });
}

export function mergePublishedUsagePayloads({
  currentPayload,
  importedPayload,
  opencodeDailyRecoveryPayload,
  hostedPayload,
  t3Summary,
  updatedAt,
}: {
  currentPayload: JsonExportPayload;
  importedPayload: JsonExportPayload | null;
  opencodeDailyRecoveryPayload: JsonExportPayload | null;
  hostedPayload: PublishedUsagePayload | null;
  t3Summary: JsonUsageSummary | null;
  updatedAt?: Date;
}): PublishedUsagePayload {
  // Fold gemini into agy in the RAW current payload BEFORE merging with
  // hosted data. This ensures the folded dates appear as "agy:" keys in
  // freshProviderDates, so the date-key filter properly removes stale hosted
  // "agy" entries. Without this pre-merge fold, raw "gemini" dates (which
  // have no matching "agy:" key) leave hosted "agy" entries unfiltered, and
  // the post-merge fold stacks gemini data on top every publish cycle.
  const foldedCurrentPayload = foldGeminiInJsonExportPayload(currentPayload);

  const payloadInputs = buildCanonicalPayloadInputs({
    currentPayload: foldedCurrentPayload,
    importedPayload,
    opencodeDailyRecoveryPayload,
    hostedPayload,
  });
  const mergedPayload = mergeJsonExportsToPublishedUsage(
    payloadInputs,
    updatedAt,
  );

  if (t3Summary) {
    mergedPayload.providers = sortPublishedProviders([
      ...mergedPayload.providers,
      t3Summary,
    ]);
  } else {
    // Fallback: preserve T3 from the hosted/existing published payload
    // when the source export file is unavailable. This prevents T3 history
    // from silently disappearing when the export file is removed.
    const hostedT3 = hostedPayload?.providers.find(
      (provider) => provider.provider === "t3",
    );

    if (hostedT3) {
      mergedPayload.providers = sortPublishedProviders([
        ...mergedPayload.providers,
        hostedT3,
      ]);
    } else {
      mergedPayload.providers = sortPublishedProviders(mergedPayload.providers);
    }
  }

  return sanitizePublishedPayload(mergedPayload);
}

async function main() {
  const { start, end } = getDateWindow();
  const { rowsByProvider, warnings } = await aggregateUsage({ start, end });
  const currentProviders = providerIds.flatMap((provider) => {
    const summary = rowsByProvider[provider];

    return summary ? [summary] : [];
  });

  if (currentProviders.length === 0) {
    throw new Error("No local usage data found on this machine.");
  }

  for (const warning of warnings) {
    process.stderr.write(`${warning}\n`);
  }

  const importPath = resolve(
    process.env.SLOPMETER_WEB_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_IMPORT_PATH.trim()
      : resolveRepoPath(DEFAULT_IMPORT_PATH),
  );
  const t3ImportPath = resolve(
    process.env.SLOPMETER_WEB_T3_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_T3_IMPORT_PATH.trim()
      : resolveHomePath(DEFAULT_T3_IMPORT_PATH),
  );
  const opencodeRecoveryImportPath = resolve(
    process.env.SLOPMETER_WEB_OPENCODE_RECOVERY_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_OPENCODE_RECOVERY_IMPORT_PATH.trim()
      : resolveHomePath(DEFAULT_OPENCODE_RECOVERY_IMPORT_PATH),
  );
  const opencodeDailyRecoveryImportPath = resolve(
    process.env.SLOPMETER_WEB_OPENCODE_DAILY_RECOVERY_IMPORT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_OPENCODE_DAILY_RECOVERY_IMPORT_PATH.trim()
      : resolveHomePath(DEFAULT_OPENCODE_DAILY_RECOVERY_IMPORT_PATH),
  );
  const localOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_LOCAL_OUTPUT_PATH),
  );
  const localCostOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_COST_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_COST_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_LOCAL_COST_OUTPUT_PATH),
  );
  const localSvgOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_SVG_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_SVG_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_LOCAL_SVG_OUTPUT_PATH),
  );
  const localHistoryDir = resolve(
    process.env.SLOPMETER_WEB_LOCAL_HISTORY_DIR?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_HISTORY_DIR.trim()
      : resolveRepoPath(DEFAULT_LOCAL_HISTORY_DIR),
  );
  const localBundledModuleOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_BUNDLED_MODULE_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_BUNDLED_MODULE_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_BUNDLED_MODULE_OUTPUT_PATH),
  );
  const gitBackupRepoDir = process.env.SLOPMETER_WEB_GIT_BACKUP_REPO_DIR?.trim()
    ? resolve(process.env.SLOPMETER_WEB_GIT_BACKUP_REPO_DIR.trim())
    : null;
  const shouldPushGitBackup = process.env.SLOPMETER_WEB_GIT_BACKUP_PUSH === "1";
  const blobPath =
    process.env.SLOPMETER_WEB_BLOB_PATH?.trim() || DEFAULT_BLOB_PATH;
  const svgBlobPath =
    process.env.SLOPMETER_WEB_SVG_BLOB_PATH?.trim() || DEFAULT_SVG_BLOB_PATH;
  const currentPayload = createJsonExportPayload(start, end, currentProviders);
  const importedPayload = readImportedPayload(importPath);
  const opencodeDailyRecoveryPayload = readImportedPayload(
    opencodeDailyRecoveryImportPath,
  );
  const hostedPayload =
    (await readHostedPayload()) ??
    readExistingPublishedPayload(localOutputPath);
  const t3Summary = await loadT3PublishedSummary(t3ImportPath, start, end);
  const opencodeRecoverySummary = await loadT3PublishedSummary(
    opencodeRecoveryImportPath,
    start,
    end,
    "opencode",
  );
  const currentPayloadWithRecovery = opencodeRecoverySummary
    ? {
        ...currentPayload,
        providers: [...currentPayload.providers, opencodeRecoverySummary],
      }
    : currentPayload;
  const publishTimestamp = new Date();
  const mergedPayload = mergePublishedUsagePayloads({
    currentPayload: currentPayloadWithRecovery,
    importedPayload,
    opencodeDailyRecoveryPayload,
    hostedPayload,
    t3Summary,
    updatedAt: publishTimestamp,
  });
  const svg = renderPublishedSvg(mergedPayload);
  // Cost is a function of the merged usage just built and the latest price
  // data, so every machine's history is priced the same way on every publish.
  await loadLatestModelPrices();
  const costPayload = writePublishedCostArtifact({
    outputPath: localCostOutputPath,
    usagePayload: mergedPayload,
  });

  mkdirSync(dirname(localOutputPath), { recursive: true });
  writeFileSync(
    localOutputPath,
    `${JSON.stringify(mergedPayload, null, 2)}\n`,
    "utf8",
  );
  mkdirSync(dirname(localSvgOutputPath), { recursive: true });
  writeFileSync(localSvgOutputPath, svg, "utf8");
  writeBundledPublishedArtifacts({
    modulePath: localBundledModuleOutputPath,
    payload: mergedPayload,
    svg,
    costPayload,
  });
  const backupPaths = writePublishedBackupArtifacts({
    historyDir: localHistoryDir,
    payload: mergedPayload,
    svg,
    updatedAt: publishTimestamp,
  });
  const gitBackup = gitBackupRepoDir
    ? syncPublishedArtifactsToGitBackupRepo({
        repoDir: gitBackupRepoDir,
        jsonSourcePath: backupPaths.jsonPath,
        svgSourcePath: backupPaths.svgPath,
        updatedAt: publishTimestamp,
        push: shouldPushGitBackup,
      })
    : {
        enabled: false,
        skipped: false,
        pushed: false,
        repoDir: null,
        commitHash: null,
        reason: null,
      };

  if (process.env.SLOPMETER_WEB_SKIP_BLOB_UPLOAD === "1") {
    process.stdout.write(
      `${JSON.stringify(
        {
          importPath: importedPayload ? importPath : null,
          t3ImportPath: t3Summary ? t3ImportPath : null,
          opencodeRecoveryImportPath: opencodeRecoverySummary
            ? opencodeRecoveryImportPath
            : null,
          opencodeDailyRecoveryImportPath: opencodeDailyRecoveryPayload
            ? opencodeDailyRecoveryImportPath
            : null,
          localOutputPath,
          localCostOutputPath,
          localSvgOutputPath,
          localHistoryDir,
          localBundledModuleOutputPath,
          backupJsonPath: backupPaths.jsonPath,
          backupSvgPath: backupPaths.svgPath,
          gitBackup,
          blobPath: null,
          svgBlobPath: null,
          url: null,
          svgUrl: null,
        },
        null,
        2,
      )}\n`,
    );

    return;
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required unless SLOPMETER_WEB_SKIP_BLOB_UPLOAD=1.",
    );
  }

  const upload = await put(blobPath, JSON.stringify(mergedPayload, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  const svgUpload = await put(svgBlobPath, svg, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "image/svg+xml",
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        importPath: importedPayload ? importPath : null,
        t3ImportPath: t3Summary ? t3ImportPath : null,
        opencodeRecoveryImportPath: opencodeRecoverySummary
          ? opencodeRecoveryImportPath
          : null,
        opencodeDailyRecoveryImportPath: opencodeDailyRecoveryPayload
          ? opencodeDailyRecoveryImportPath
          : null,
        localOutputPath,
        localCostOutputPath,
        localSvgOutputPath,
        localHistoryDir,
        localBundledModuleOutputPath,
        backupJsonPath: backupPaths.jsonPath,
        backupSvgPath: backupPaths.svgPath,
        gitBackup,
        blobPath,
        svgBlobPath,
        url: upload.url,
        svgUrl: svgUpload.url,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
