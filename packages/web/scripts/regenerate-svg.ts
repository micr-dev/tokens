import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { heatmapThemes, renderUsageHeatmapsSvg } from "../../cli/src/graph";
import { mergeUsageSummaries } from "../../cli/src/lib/utils";
import type {
  PublishedUsagePayload,
  PublishedCostPayload,
} from "../lib/types";
import type { UsageSummary } from "../../cli/src/interfaces";

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

function getMergedSectionTitle(providers: UsageSummary[]) {
  return providers
    .map((provider) => heatmapThemes[provider.provider].title)
    .join(" / ");
}

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const JSON_PATH = resolve(
  REPO_ROOT,
  ".slopmeter-data/published/daily-usage.json",
);
const COST_PATH = resolve(
  REPO_ROOT,
  ".slopmeter-data/published/cost-analysis.json",
);
const SVG_OUTPUT_PATH = resolve(
  REPO_ROOT,
  ".slopmeter-data/published/heatmap-last-year.svg",
);
const MODULE_PATH = resolve(
  REPO_ROOT,
  "packages/web/lib/published-data.generated.ts",
);

const WEB_PROVIDER_ORDER = [
  "codex",
  "opencode",
  "agy",
  "pi",
  "droid",
  "hermes",
  "claude",
  "t3",
] as const;

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

function buildBundledPublishedDataModule(
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

// ── Run ──────────────────────────────────────────────────────────────────────

const payload: PublishedUsagePayload = JSON.parse(
  readFileSync(JSON_PATH, "utf8"),
);

const costPayload: PublishedCostPayload | null = (() => {
  try {
    return JSON.parse(readFileSync(COST_PATH, "utf8"));
  } catch {
    return null;
  }
})();

// Regenerate SVG from the corrected data
const svg = renderPublishedSvg(payload);
console.log("SVG regenerated, length:", svg.length);

// Save SVG file
writeFileSync(SVG_OUTPUT_PATH, svg, "utf8");
console.log("SVG written to:", SVG_OUTPUT_PATH);

// Verify the SVG has correct totals
const inputMatch = svg.match(/INPUT TOKENS<\/text><text[^>]*>([^<]+)/);
const totalMatch = svg.match(/TOTAL TOKENS<\/text><text[^>]*>([^<]+)/);
console.log("SVG All Providers input:", inputMatch?.[1]);
console.log("SVG All Providers total:", totalMatch?.[1]);

// Rebuild the TS module (same format as publish-usage.ts)
const moduleContent = buildBundledPublishedDataModule(
  payload,
  svg,
  costPayload,
);
writeFileSync(MODULE_PATH, moduleContent, "utf8");
console.log("TS module written to:", MODULE_PATH);
