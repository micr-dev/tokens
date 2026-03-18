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

export async function getPublishedSvgMarkup(): Promise<string> {
  const svgUrl = process.env.SLOPMETER_WEB_SVG_URL?.trim();

  if (!svgUrl) {
    if (!existsSync(DEFAULT_LOCAL_SVG_OUTPUT_PATH)) {
      throw new Error(
        "No published SVG found. Set SLOPMETER_WEB_SVG_URL or run bun run publish:web.",
      );
    }

    return await readFile(DEFAULT_LOCAL_SVG_OUTPUT_PATH, "utf8");
  }

  const response = await fetch(svgUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load published SVG: ${response.status}`);
  }

  return await response.text();
}

export async function getPublishedUsagePayload(): Promise<PublishedUsagePayload | null> {
  const dataUrl = process.env.SLOPMETER_WEB_DATA_URL?.trim();

  if (!dataUrl) {
    if (!existsSync(DEFAULT_LOCAL_JSON_OUTPUT_PATH)) {
      return null;
    }

    return JSON.parse(
      await readFile(DEFAULT_LOCAL_JSON_OUTPUT_PATH, "utf8"),
    ) as PublishedUsagePayload;
  }

  const response = await fetch(dataUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PublishedUsagePayload;
}
