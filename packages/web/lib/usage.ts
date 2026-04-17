import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PublishedUsagePayload } from "./types";

const REPO_ROOT = resolve(process.cwd(), "../..");
const DEFAULT_LOCAL_JSON_OUTPUT_PATH = resolve(
  REPO_ROOT,
  ".slopmeter-data/published/daily-usage.json",
);
const DEFAULT_LOCAL_SVG_OUTPUT_PATH = resolve(
  REPO_ROOT,
  ".slopmeter-data/published/heatmap-last-year.svg",
);
const mergedProvidersCaption = "TOTAL USAGE FROM";
const mergedProvidersLabel = "All Providers";

export function shouldUseLocalPublishedArtifacts(path: string) {
  return existsSync(path);
}

export function normalizePublishedSvgMarkup(svgMarkup: string) {
  const mergedProvidersPattern = new RegExp(
    `(<text\\b[^>]*>${mergedProvidersCaption}<\\/text>\\s*<text\\b[^>]*>)([^<]+)(<\\/text>)`,
  );

  return svgMarkup.replace(
    mergedProvidersPattern,
    `$1${mergedProvidersLabel}$3`,
  );
}

export async function getPublishedSvgMarkup(): Promise<string> {
  const svgUrl = process.env.SLOPMETER_WEB_SVG_URL?.trim();

  if (shouldUseLocalPublishedArtifacts(DEFAULT_LOCAL_SVG_OUTPUT_PATH)) {
    return normalizePublishedSvgMarkup(
      await readFile(DEFAULT_LOCAL_SVG_OUTPUT_PATH, "utf8"),
    );
  }

  if (!svgUrl) {
    throw new Error(
      "No published SVG found. Set SLOPMETER_WEB_SVG_URL or run bun run publish:web.",
    );
  }

  const response = await fetch(svgUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load published SVG: ${response.status}`);
  }

  return normalizePublishedSvgMarkup(await response.text());
}

export async function getPublishedUsagePayload(): Promise<PublishedUsagePayload | null> {
  const dataUrl = process.env.SLOPMETER_WEB_DATA_URL?.trim();

  if (shouldUseLocalPublishedArtifacts(DEFAULT_LOCAL_JSON_OUTPUT_PATH)) {
    return JSON.parse(
      await readFile(DEFAULT_LOCAL_JSON_OUTPUT_PATH, "utf8"),
    ) as PublishedUsagePayload;
  }

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
