import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { put } from "@vercel/blob";
import { heatmapThemes, renderUsageHeatmapsSvg } from "../../cli/src/graph";
import {
  createJsonExportPayload,
  mergeJsonExportsToPublishedUsage,
  type PublishedUsagePayload,
} from "../../cli/src/lib/export";
import { mergeUsageSummaries } from "../../cli/src/lib/utils";
import { providerIds, aggregateUsage } from "../../cli/src/providers";
import type {
  JsonExportPayload,
  JsonUsageSummary,
  UsageSummary,
} from "../../cli/src/interfaces";
import { loadT3PublishedSummary } from "./lib/t3-chat";

const DEFAULT_IMPORT_PATH = ".slopmeter-data/imports/windows-history.json";
const DEFAULT_T3_IMPORT_PATH = ".local/share/slopmeter/t3-chat-export.json";
const DEFAULT_LOCAL_OUTPUT_PATH = ".slopmeter-data/published/daily-usage.json";
const DEFAULT_LOCAL_SVG_OUTPUT_PATH =
  ".slopmeter-data/published/heatmap-last-year.svg";
const DEFAULT_BLOB_PATH = "slopmeter/daily-usage.json";
const DEFAULT_SVG_BLOB_PATH = "slopmeter/heatmap-last-year.svg";
const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
export const WEB_PROVIDER_ORDER = [
  "codex",
  "opencode",
  "pi",
  "gemini",
  "claude",
  "hermes",
  "cursor",
  "helios",
  "t3",
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

function resolveRepoPath(pathValue: string) {
  return resolve(REPO_ROOT, pathValue);
}

function resolveHomePath(pathValue: string) {
  return resolve(homedir(), pathValue);
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
    providers: payload.providers,
  };
}

function getMergedSectionTitle(providers: UsageSummary[]) {
  return providers
    .map((provider) => heatmapThemes[provider.provider].title)
    .join(" / ");
}

function renderPublishedSvg(payload: PublishedUsagePayload) {
  const providerSummaries = WEB_PROVIDER_ORDER.flatMap((providerId) => {
    const summary = payload.providers.find((provider) => provider.provider === providerId);

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
    colorMode: "light",
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

    return leftOrder - rightOrder || left.provider.localeCompare(right.provider);
  });
}

export function mergePublishedUsagePayloads({
  currentPayload,
  importedPayload,
  hostedPayload,
  t3Summary,
  updatedAt,
}: {
  currentPayload: JsonExportPayload;
  importedPayload: JsonExportPayload | null;
  hostedPayload: PublishedUsagePayload | null;
  t3Summary: JsonUsageSummary | null;
  updatedAt?: Date;
}): PublishedUsagePayload {
  const mergedPayload = mergeJsonExportsToPublishedUsage(
    [
      currentPayload,
      hostedPayload ? toJsonExportPayload(hostedPayload) : null,
      importedPayload,
    ].filter((payload): payload is JsonExportPayload => payload !== null),
    updatedAt,
  );

  if (t3Summary) {
    mergedPayload.providers = sortPublishedProviders([
      ...mergedPayload.providers,
      t3Summary,
    ]);
  } else {
    mergedPayload.providers = sortPublishedProviders(mergedPayload.providers);
  }

  return mergedPayload;
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
  const localOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_LOCAL_OUTPUT_PATH),
  );
  const localSvgOutputPath = resolve(
    process.env.SLOPMETER_WEB_LOCAL_SVG_OUTPUT_PATH?.trim()
      ? process.env.SLOPMETER_WEB_LOCAL_SVG_OUTPUT_PATH.trim()
      : resolveRepoPath(DEFAULT_LOCAL_SVG_OUTPUT_PATH),
  );
  const blobPath =
    process.env.SLOPMETER_WEB_BLOB_PATH?.trim() || DEFAULT_BLOB_PATH;
  const svgBlobPath =
    process.env.SLOPMETER_WEB_SVG_BLOB_PATH?.trim() || DEFAULT_SVG_BLOB_PATH;
  const currentPayload = createJsonExportPayload(start, end, currentProviders);
  const importedPayload = readImportedPayload(importPath);
  const hostedPayload = await readHostedPayload();
  const t3Summary = await loadT3PublishedSummary(t3ImportPath, start, end);
  const mergedPayload = mergePublishedUsagePayloads({
    currentPayload,
    importedPayload,
    hostedPayload,
    t3Summary,
  });
  const svg = renderPublishedSvg(mergedPayload);

  mkdirSync(dirname(localOutputPath), { recursive: true });
  writeFileSync(
    localOutputPath,
    `${JSON.stringify(mergedPayload, null, 2)}\n`,
    "utf8",
  );
  mkdirSync(dirname(localSvgOutputPath), { recursive: true });
  writeFileSync(localSvgOutputPath, svg, "utf8");

  if (process.env.SLOPMETER_WEB_SKIP_BLOB_UPLOAD === "1") {
    process.stdout.write(
      `${JSON.stringify(
        {
          importPath: importedPayload ? importPath : null,
          t3ImportPath: t3Summary ? t3ImportPath : null,
          localOutputPath,
          localSvgOutputPath,
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

  const upload = await put(
    blobPath,
    JSON.stringify(mergedPayload, null, 2),
    {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
    },
  );
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
          localOutputPath,
          localSvgOutputPath,
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
