import {
  publishedSvgMarkup,
  publishedUsagePayload,
} from "./published-data.generated";
import type { PublishedUsagePayload } from "./types";

// Bundle the published artifacts into the app so production cannot drift to stale runtime files.
const mergedProvidersCaption = "TOTAL USAGE FROM";
const mergedProvidersLabel = "All Providers";

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
  return normalizePublishedSvgMarkup(publishedSvgMarkup);
}

export async function getPublishedUsagePayload(): Promise<PublishedUsagePayload | null> {
  return publishedUsagePayload;
}
