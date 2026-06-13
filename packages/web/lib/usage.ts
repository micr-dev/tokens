import {
  publishedSvgMarkup,
  publishedUsagePayload,
} from "./published-data.generated";
import type { PublishedUsagePayload } from "./types";

// Bundle the published artifacts into the app so production cannot drift to stale runtime files.
const mergedProvidersCaption = "TOTAL USAGE FROM";
const mergedProvidersLabel = "All Providers";
const svgFontReplacements = [
  [
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    "helveticaNeue, Helvetica Neue, sans-serif",
  ],
] as const;

export function normalizePublishedSvgMarkup(svgMarkup: string) {
  let normalizedSvgMarkup = svgMarkup;
  const mergedProvidersPattern = new RegExp(
    `(<text\\b[^>]*>${mergedProvidersCaption}<\\/text>\\s*<text\\b[^>]*>)([^<]+)(<\\/text>)`,
  );

  normalizedSvgMarkup = normalizedSvgMarkup.replace(
    mergedProvidersPattern,
    `$1${mergedProvidersLabel}$3`,
  );

  for (const [from, to] of svgFontReplacements) {
    normalizedSvgMarkup = normalizedSvgMarkup.replaceAll(from, to);
  }

  return normalizedSvgMarkup;
}

export async function getPublishedSvgMarkup(): Promise<string> {
  return normalizePublishedSvgMarkup(publishedSvgMarkup);
}

export async function getPublishedUsagePayload(): Promise<PublishedUsagePayload | null> {
  return publishedUsagePayload;
}
