import { writeFileSync } from "node:fs";
import type {
  JsonDailyUsage,
  JsonExportPayload,
  JsonUsageSummary,
  UsageSummary,
} from "../interfaces";
import { providerIds, type ProviderId } from "./interfaces";
import { formatLocalDate, mergeUsageSummaries } from "./utils";

export const JSON_EXPORT_VERSION = "2026-03-03";

export function toJsonDailyUsage(row: UsageSummary["daily"][number]): JsonDailyUsage {
  return {
    date: formatLocalDate(row.date),
    input: row.input,
    output: row.output,
    cache: row.cache,
    total: row.total,
    displayValue: row.displayValue,
    breakdown: row.breakdown,
  };
}

export function toJsonUsageSummary(summary: UsageSummary): JsonUsageSummary {
  return {
    provider: summary.provider,
    insights: summary.insights,
    daily: summary.daily.map(toJsonDailyUsage),
  };
}

export function createJsonExportPayload(
  start: Date,
  end: Date,
  providers: UsageSummary[],
): JsonExportPayload {
  return {
    version: JSON_EXPORT_VERSION,
    start: formatLocalDate(start),
    end: formatLocalDate(end),
    providers: providers.map(toJsonUsageSummary),
  };
}

export function writeJsonExport(
  outputPath: string,
  payload: JsonExportPayload,
) {
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseDateOnly(value: string, field: string) {
  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${field} date: ${value}`);
  }

  return parsed;
}

function parseJsonUsageSummary(summary: JsonUsageSummary): UsageSummary {
  return {
    provider: summary.provider,
    insights: summary.insights,
    daily: summary.daily.map((row) => ({
      date: parseDateOnly(row.date, "daily"),
      input: row.input,
      output: row.output,
      cache: row.cache,
      total: row.total,
      displayValue: row.displayValue,
      breakdown: row.breakdown,
    })),
  };
}

export function parseJsonExportPayload(payload: JsonExportPayload) {
  const start = parseDateOnly(payload.start, "start");
  const end = parseDateOnly(payload.end, "end");
  const providers = payload.providers.map(parseJsonUsageSummary);

  return { start, end, providers };
}

export interface PublishedUsagePayload {
  version: string;
  start: string;
  end: string;
  updatedAt: string;
  providers: JsonUsageSummary[];
}

function mergeUsageSummariesByProvider(
  summaries: UsageSummary[],
  end: Date,
): UsageSummary[] {
  const grouped = new Map<ProviderId, UsageSummary[]>();

  for (const summary of summaries) {
    if (summary.provider === "all" || summary.provider === "t3") {
      throw new Error(
        "Provider-specific CLI JSON export required. Re-run slopmeter without --all and without hosted-only providers before importing.",
      );
    }

    const existing = grouped.get(summary.provider) ?? [];

    existing.push(summary);
    grouped.set(summary.provider, existing);
  }

  return providerIds.flatMap((provider) => {
    const entries = grouped.get(provider);

    if (!entries || entries.length === 0) {
      return [];
    }

    return [mergeUsageSummaries(provider, entries, end)];
  });
}

export function mergeJsonExportsToPublishedUsage(
  payloads: JsonExportPayload[],
  updatedAt = new Date(),
): PublishedUsagePayload {
  if (payloads.length === 0) {
    throw new Error("At least one JSON export payload is required.");
  }

  const unsupported = payloads
    .map((payload) => payload.version)
    .filter((version) => version !== JSON_EXPORT_VERSION);

  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported import version(s): ${[...new Set(unsupported)].join(", ")}`,
    );
  }

  const parsed = payloads.map(parseJsonExportPayload);
  const start = new Date(
    Math.min(...parsed.map((entry) => entry.start.getTime())),
  );
  const end = new Date(
    Math.max(...parsed.map((entry) => entry.end.getTime())),
  );
  const summaries = parsed.flatMap((entry) => entry.providers);

  if (summaries.length === 0) {
    throw new Error("No provider data found in imported JSON export.");
  }

  const mergedProviders = mergeUsageSummariesByProvider(summaries, end);

  if (mergedProviders.length === 0) {
    throw new Error("No provider-specific data found in imported JSON export.");
  }

  return {
    version: JSON_EXPORT_VERSION,
    start: formatLocalDate(start),
    end: formatLocalDate(end),
    updatedAt: updatedAt.toISOString(),
    providers: mergedProviders.map(toJsonUsageSummary),
  };
}
