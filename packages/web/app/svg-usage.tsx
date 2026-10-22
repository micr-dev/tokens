"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { Cursor } from "../components/cursor";
import {
  buildDailyBurn,
  buildSeriesBurn,
  formatCompactNumber,
  formatPercent,
} from "../lib/analytics";
import type {
  CostAnalytics,
  CostEntityAnalytics,
  DailyBurn,
  DetailsAnalytics,
  ModelsTimeScale,
  VendorModelsAnalytics,
} from "../lib/types";
import { buildMonotoneAreaPath, getBurnAxisTicks } from "./burn-chart";
import {
  findUsageViewBySegment,
  getUsageViewHref,
  usageViews,
  type UsageViewId,
} from "./views";

interface SvgUsageProps {
  svgMarkup: string;
  analytics: DetailsAnalytics | null;
  children: ReactNode;
}

interface TooltipMetric {
  label: string;
  value: string;
}

interface HeatmapTooltipState {
  kind: "heatmap";
  accentColor: string;
  provider: string;
  date: string;
  metrics: TooltipMetric[];
  topModel: string | null;
  topModelTokens: string | null;
  note: string | null;
  x: number;
  y: number;
}

interface DetailsTooltipState {
  kind: "details";
  accentColor: string;
  label: string;
  value: string;
  note: string | null;
  x: number;
  y: number;
}

type TooltipState = HeatmapTooltipState | DetailsTooltipState;
type CostGroupMode = "harness" | "model";
type CostRankMode = "cost" | "tokens" | "rate";
type CostVisibleLimit = 5 | 10 | 20 | "all";
type BurnRangeDays = (typeof burnRanges)[number]["days"];

const burnRanges = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
] as const;
const burnChartWidth = 1000;
const burnChartHeight = 240;

const exactNumberFormatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const preciseCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const modelScaleOrder: ModelsTimeScale[] = ["year", "month", "week", "day"];
const costGroupModes: CostGroupMode[] = ["harness", "model"];
const costRankModes: CostRankMode[] = ["cost", "tokens", "rate"];
const costVisibleLimits: CostVisibleLimit[] = [5, 10, 20, "all"];
const defaultCursorAccent = "#22c55e";
const minimumVisibleCostBarPixels = 6;
const modelScaleLabels: Record<ModelsTimeScale, string> = {
  year: "Year",
  month: "Month",
  week: "Week",
  day: "Day",
};
const costGroupLabels: Record<CostGroupMode, string> = {
  harness: "Harness",
  model: "Provider / Model",
};
const costRankLabels: Record<CostRankMode, string> = {
  cost: "Cost",
  tokens: "Tokens",
  rate: "Cost / 1M",
};

function readTooltipState(target: SVGRectElement, x: number, y: number) {
  const description = target.querySelector("desc")?.textContent?.trim();

  if (!description) {
    return null;
  }

  let payload: Record<string, string>;

  try {
    payload = JSON.parse(description) as Record<string, string>;
  } catch {
    return null;
  }

  const {
    provider,
    date,
    total,
    input,
    output,
    cacheInput,
    cacheOutput,
    topModel,
    topModelTokens,
    note,
  } = payload;

  if (
    !provider ||
    !date ||
    !total ||
    !input ||
    !output ||
    !cacheInput ||
    !cacheOutput
  ) {
    return null;
  }

  return {
    accentColor: findAccentColor(target),
    kind: "heatmap",
    provider,
    date,
    metrics: [
      { label: "Total", value: total },
      { label: "Input", value: input },
      { label: "Output", value: output },
      { label: "Cache in", value: cacheInput },
      { label: "Cache out", value: cacheOutput },
    ],
    topModel: topModel ?? null,
    topModelTokens: topModelTokens ?? null,
    note: note ?? null,
    x,
    y,
  } satisfies HeatmapTooltipState;
}

function formatFullDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatMonthLabel(value: string) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function formatExactNumber(value: number) {
  return exactNumberFormatter.format(value);
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "No cost data";
  }

  if (Math.abs(value) < 100) {
    return preciseCurrencyFormatter.format(value);
  }

  return currencyFormatter.format(value);
}

function formatCostRate(value: number | null) {
  if (value === null) {
    return "No cost data";
  }

  return `${preciseCurrencyFormatter.format(value)} / 1M`;
}

function formatGeneratedAt(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function createDetailsTooltip(label: string, value: string, note?: string) {
  return JSON.stringify({
    label,
    value,
    note: note ?? null,
  });
}

function normalizeAccentColor(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized === "" ||
    normalized === "transparent" ||
    normalized === "none" ||
    normalized === "rgba(0, 0, 0, 0)"
  ) {
    return null;
  }

  return normalized;
}

function readElementAccent(element: Element) {
  const computed = getComputedStyle(element);
  const providerAccent = normalizeAccentColor(
    computed.getPropertyValue("--provider-accent"),
  );

  if (providerAccent) {
    return providerAccent;
  }

  if (element instanceof SVGElement) {
    const svgFill = normalizeAccentColor(
      element.getAttribute("fill") ?? computed.fill,
    );

    if (svgFill) {
      return svgFill;
    }
  }

  const background = normalizeAccentColor(computed.backgroundColor);

  if (background && background !== "rgb(255, 255, 255)") {
    return background;
  }

  return null;
}

function readAccentFromChildren(source: Element) {
  const coloredChild = source.querySelector(
    ".models-row__legend-swatch, .models-bar__segment",
  );

  if (!(coloredChild instanceof Element)) {
    return null;
  }

  return readElementAccent(coloredChild);
}

function findAccentColor(target: Element | null) {
  for (let current = target; current; current = current.parentElement) {
    const directAccent = readElementAccent(current);

    if (directAccent) {
      return directAccent;
    }

    const childAccent = readAccentFromChildren(current);

    if (childAccent) {
      return childAccent;
    }
  }

  return defaultCursorAccent;
}

function readDetailsTooltipState(target: Element, x: number, y: number) {
  const source = target.closest("[data-details-tooltip]");
  const payload = source?.getAttribute("data-details-tooltip")?.trim();

  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as {
      label?: string;
      value?: string;
      note?: string | null;
    };

    if (!parsed.label || !parsed.value) {
      return null;
    }

    return {
      accentColor: findAccentColor(source),
      kind: "details",
      label: parsed.label,
      value: parsed.value,
      note: parsed.note ?? null,
      x,
      y,
    } satisfies DetailsTooltipState;
  } catch {
    return null;
  }
}

function AntigravityNoDataCard() {
  return (
    <section className="provider-empty">
      <h2 className="provider-empty__title">Antigravity CLI</h2>
      <p className="provider-empty__body">
        No published Antigravity CLI usage yet. Token totals are shown after
        legacy Gemini CLI history or current agy rows exist in the published
        data.
      </p>
    </section>
  );
}

function BurnChart({
  burn,
  groupLabel,
}: {
  burn: DailyBurn;
  groupLabel: string;
}) {
  const geometry = useMemo(() => {
    const ticks = getBurnAxisTicks(burn.peak?.total ?? 0);
    const max = ticks[ticks.length - 1] || 1;
    const lastIndex = burn.dates.length - 1;
    const step = lastIndex > 0 ? burnChartWidth / lastIndex : burnChartWidth;
    const xs = burn.dates.map((_, index) =>
      lastIndex > 0 ? index * step : burnChartWidth / 2,
    );
    const stackTops = burn.dates.map(() => 0);
    // Each layer fills from its stack top down to the baseline; painting the
    // tallest first lets lower layers cover it, leaving one visible band each.
    const areas = burn.layers
      .map((layer) => ({
        provider: layer.provider,
        accent: layer.accent,
        path: buildMonotoneAreaPath(
          layer.values.map((value, index) => {
            stackTops[index] += value;

            return {
              x: xs[index],
              y: burnChartHeight - (stackTops[index] / max) * burnChartHeight,
            };
          }),
          burnChartHeight,
        ),
      }))
      .reverse();
    const days = burn.dates.map((date, index) => {
      const contributors = burn.layers
        .filter((layer) => layer.values[index] > 0)
        .sort((left, right) => right.values[index] - left.values[index]);
      const left = Math.max(0, xs[index] - step / 2);

      return {
        date,
        x: xs[index],
        left,
        width: Math.min(burnChartWidth, xs[index] + step / 2) - left,
        accent: contributors[0]?.accent ?? defaultCursorAccent,
        tooltip: createDetailsTooltip(
          formatFullDate(date),
          `${formatExactNumber(burn.totals[index])} tokens`,
          contributors
            .map(
              (layer) =>
                `${layer.title}: ${formatCompactNumber(layer.values[index])}`,
            )
            .join("\n") || undefined,
        ),
      };
    });

    return { ticks, max, areas, days };
  }, [burn]);

  if (burn.dates.length === 0) {
    return null;
  }

  const firstDay = burn.dates[0];
  const lastDay = burn.dates[burn.dates.length - 1];
  const formatAxisDate =
    firstDay.slice(0, 4) === lastDay.slice(0, 4)
      ? formatShortDate
      : formatFullDate;
  const firstDate = formatAxisDate(firstDay);
  const lastDate = formatAxisDate(lastDay);

  return (
    <div className="burn-chart">
      <div className="burn-chart__y" aria-hidden="true">
        {geometry.ticks.map((tick) => (
          <span
            key={tick}
            className="burn-chart__tick"
            style={{ bottom: `${(tick / geometry.max) * 100}%` }}
          >
            {formatCompactNumber(tick)}
          </span>
        ))}
      </div>
      <svg
        className="burn-chart__svg"
        viewBox={`0 0 ${burnChartWidth} ${burnChartHeight}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily tokens by ${groupLabel.toLowerCase()}, ${firstDate} to ${lastDate}`}
      >
        {geometry.ticks.map((tick) => {
          const y = burnChartHeight - (tick / geometry.max) * burnChartHeight;

          return (
            <line
              key={tick}
              className="burn-chart__grid"
              x1={0}
              x2={burnChartWidth}
              y1={y}
              y2={y}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {geometry.areas.map((area) => (
          <path
            key={area.provider}
            className="burn-chart__area"
            d={area.path}
            fill={area.accent}
          />
        ))}
        {geometry.days.map((day) => (
          <g
            key={day.date}
            className="burn-chart__day"
            data-details-tooltip={day.tooltip}
            style={{ "--provider-accent": day.accent } as CSSProperties}
          >
            <rect
              x={day.left}
              y={0}
              width={day.width}
              height={burnChartHeight}
            />
            <line
              className="burn-chart__guide"
              x1={day.x}
              x2={day.x}
              y1={0}
              y2={burnChartHeight}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>
      <div className="burn-chart__x" aria-hidden="true">
        <span>{firstDate}</span>
        <span>{lastDate}</span>
      </div>
    </div>
  );
}

function BurnTable({
  burn,
  groupLabel,
}: {
  burn: DailyBurn;
  groupLabel: string;
}) {
  if (burn.layers.length === 0) {
    return null;
  }

  const input = burn.layers.reduce((sum, layer) => sum + layer.input, 0);
  const output = burn.layers.reduce((sum, layer) => sum + layer.output, 0);
  const cache = burn.layers.reduce((sum, layer) => sum + layer.cache, 0);

  return (
    <div className="burn-table-scroll">
      <table className="burn-table">
        <thead>
          <tr>
            <th scope="col">{groupLabel}</th>
            <th scope="col">Tokens</th>
            <th scope="col">Share</th>
            <th scope="col">Input</th>
            <th scope="col">Output</th>
            <th scope="col">Cache</th>
            <th scope="col">Days</th>
            <th scope="col">Peak</th>
            <th scope="col" title="Current / longest, all time">
              Streak
            </th>
          </tr>
        </thead>
        <tbody>
          {burn.layers.map((layer) => (
            <tr key={layer.provider}>
              <th scope="row">
                <span
                  className="burn-table__swatch"
                  style={{ background: layer.accent }}
                />
                {layer.title}
              </th>
              <td>{formatCompactNumber(layer.total)}</td>
              <td>{formatPercent((layer.total / burn.total) * 100)}</td>
              <td>{formatCompactNumber(layer.input)}</td>
              <td>{formatCompactNumber(layer.output)}</td>
              <td>{formatPercent((layer.cache / layer.total) * 100)}</td>
              <td>{layer.activeDays}</td>
              <td>
                {layer.peak ? (
                  <>
                    {formatCompactNumber(layer.peak.total)}{" "}
                    <span className="burn-table__muted">
                      {formatShortDate(layer.peak.date)}
                    </span>
                  </>
                ) : null}
              </td>
              <td>
                {layer.currentStreak} / {layer.longestStreak}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">All</th>
            <td>{formatCompactNumber(burn.total)}</td>
            <td>{formatPercent(100)}</td>
            <td>{formatCompactNumber(input)}</td>
            <td>{formatCompactNumber(output)}</td>
            <td>{formatPercent((cache / burn.total) * 100)}</td>
            <td>{burn.activeDays}</td>
            <td>
              {burn.peak ? (
                <>
                  {formatCompactNumber(burn.peak.total)}{" "}
                  <span className="burn-table__muted">
                    {formatShortDate(burn.peak.date)}
                  </span>
                </>
              ) : null}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DetailsView({ analytics }: { analytics: DetailsAnalytics }) {
  const [group, setGroup] = useState<"harness" | "model" | "family">("harness");
  const groupLabel = { harness: "Harness", model: "Model", family: "Family" }[
    group
  ];
  const [rangeDays, setRangeDays] = useState<BurnRangeDays>(30);
  const burn = useMemo(() => {
    if (group === "harness") {
      return buildDailyBurn(analytics.providers, rangeDays);
    }

    return buildSeriesBurn(
      group === "model" ? analytics.models : analytics.families,
      rangeDays,
      analytics.latestUsageDate,
    );
  }, [analytics, group, rangeDays]);

  return (
    <section className="burn-view">
      <header className="burn-view__header">
        <h2 className="burn-view__title">Daily burn</h2>
        <div className="burn-view__controls">
          <div className="view-toggle" role="group" aria-label="Usage grouping">
            {(["harness", "model", "family"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={group === value}
                className={`view-toggle__button${group === value ? " is-active" : ""}`}
                onClick={() => setGroup(value)}
              >
                {
                  { harness: "Harnesses", model: "Models", family: "Families" }[
                    value
                  ]
                }
              </button>
            ))}
          </div>
          <div className="view-toggle" role="group" aria-label="Range">
            {burnRanges.map((range) => (
              <button
                key={range.days}
                type="button"
                aria-pressed={rangeDays === range.days}
                className={
                  rangeDays === range.days
                    ? "view-toggle__button is-active"
                    : "view-toggle__button"
                }
                onClick={() => setRangeDays(range.days)}
              >
                {range.label}
              </button>
            ))}
          </div>
          <div className="burn-view__peak">
            <span className="burn-view__peak-label">Peak</span>
            <span className="burn-view__peak-value">
              {formatCompactNumber(burn.peak?.total ?? 0)}
            </span>
            {burn.peak ? (
              <span className="burn-view__peak-date">
                {formatShortDate(burn.peak.date)}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      <BurnChart burn={burn} groupLabel={groupLabel} />
      <BurnTable burn={burn} groupLabel={groupLabel} />
    </section>
  );
}

function buildBucketTooltipNote(
  vendor: VendorModelsAnalytics,
  scale: ModelsTimeScale,
) {
  return `${vendor.name} · ${modelScaleLabels[scale]}`;
}

function parseBucketDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function getBucketYear(scale: ModelsTimeScale, bucketKey: string) {
  if (scale === "week") {
    const date = parseBucketDate(bucketKey);

    date.setUTCDate(date.getUTCDate() + 3);

    return String(date.getUTCFullYear());
  }

  if (scale === "day") {
    return bucketKey.slice(0, 4);
  }

  return null;
}

function ModelsView({
  vendors,
  scale,
  onScaleChange,
}: {
  vendors: VendorModelsAnalytics[];
  scale: ModelsTimeScale;
  onScaleChange: (nextScale: ModelsTimeScale) => void;
}) {
  const supportsYearSelection = scale === "week" || scale === "day";
  const availableYears = supportsYearSelection
    ? [
        ...new Set(
          vendors.flatMap((vendor) =>
            vendor.scales[scale]
              .map((bucket) => getBucketYear(scale, bucket.key))
              .filter((year): year is string => year !== null),
          ),
        ),
      ].sort((left, right) => right.localeCompare(left))
    : [];
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  useEffect(() => {
    if (!supportsYearSelection || availableYears.length === 0) {
      return;
    }

    if (!selectedYear || !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0] ?? null);
    }
  }, [availableYears, selectedYear, supportsYearSelection]);

  return (
    <section className={`models-view models-view--${scale}`}>
      <div className="models-view__controls">
        <div className="view-toggle" role="tablist" aria-label="Model period">
          {modelScaleOrder.map((option) => (
            <button
              key={option}
              type="button"
              className={
                scale === option
                  ? "view-toggle__button is-active"
                  : "view-toggle__button"
              }
              onClick={() => onScaleChange(option)}
            >
              {modelScaleLabels[option]}
            </button>
          ))}
        </div>
      </div>
      {supportsYearSelection && selectedYear ? (
        <div className="models-view__year-controls">
          <div className="view-toggle" role="tablist" aria-label="Model year">
            {availableYears.map((year) => (
              <button
                key={year}
                type="button"
                className={
                  selectedYear === year
                    ? "view-toggle__button is-active"
                    : "view-toggle__button"
                }
                onClick={() => setSelectedYear(year)}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="models-grid">
        {vendors.map((vendor) => {
          const buckets = supportsYearSelection
            ? vendor.scales[scale].filter(
                (bucket) => getBucketYear(scale, bucket.key) === selectedYear,
              )
            : vendor.scales[scale];
          const legendModels = vendor.modelColors.slice(0, 8);
          const hiddenModelCount = Math.max(
            vendor.modelColors.length - legendModels.length,
            0,
          );
          const visibleTotal = buckets.reduce(
            (sum, bucket) => sum + bucket.total,
            0,
          );
          const maxTotal = Math.max(
            ...buckets.map((bucket) => bucket.total),
            0,
          );

          return (
            <section key={vendor.vendor} className="models-row">
              <div className="models-row__header">
                <div>
                  <div className="models-row__title">{vendor.name}</div>
                  <div className="models-row__total">
                    {formatCompactNumber(
                      supportsYearSelection ? visibleTotal : vendor.total,
                    )}
                  </div>
                </div>
                <div className="models-row__legend">
                  {legendModels.map((model) => (
                    <div
                      key={model.name}
                      className="models-row__legend-item"
                      data-details-tooltip={createDetailsTooltip(
                        model.name,
                        `${buildBucketTooltipNote(vendor, scale)} total`,
                        `${formatExactNumber(
                          vendor.topModels.find(
                            (entry) => entry.name === model.name,
                          )?.total ?? 0,
                        )} tokens`,
                      )}
                    >
                      <span
                        className="models-row__legend-swatch"
                        style={{ background: model.color }}
                      />
                      <span className="models-row__legend-name">
                        {model.name}
                      </span>
                    </div>
                  ))}
                  {hiddenModelCount > 0 ? (
                    <div className="models-row__legend-more">
                      +{hiddenModelCount} more
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                className={
                  scale === "day"
                    ? "models-row__chart models-row__chart--day"
                    : scale === "week"
                      ? "models-row__chart models-row__chart--week"
                      : "models-row__chart models-row__chart--compact"
                }
              >
                <div
                  className={
                    scale === "day"
                      ? "models-row__bars models-row__bars--day"
                      : scale === "week"
                        ? "models-row__bars models-row__bars--week"
                        : "models-row__bars models-row__bars--compact"
                  }
                  style={
                    scale === "week" || scale === "day"
                      ? ({
                          "--bucket-count": Math.max(buckets.length, 1),
                        } as CSSProperties)
                      : undefined
                  }
                >
                  {buckets.map((bucket) => {
                    const stackHeight =
                      maxTotal > 0 ? (bucket.total / maxTotal) * 100 : 0;
                    const bucketNote = [
                      bucket.description,
                      ...bucket.segments.map(
                        (segment) =>
                          `${segment.name}: ${formatCompactNumber(segment.total)}`,
                      ),
                    ].join("\n");

                    return (
                      <div
                        key={bucket.key}
                        className="models-bar"
                        data-details-tooltip={createDetailsTooltip(
                          bucket.label,
                          `${formatExactNumber(bucket.total)} tokens`,
                          bucketNote,
                        )}
                      >
                        <div className="models-bar__track">
                          <div
                            className="models-bar__stack"
                            style={{ height: `${stackHeight}%` }}
                          >
                            {bucket.segments.map((segment) => (
                              <span
                                key={`${bucket.key}-${segment.name}`}
                                className="models-bar__segment"
                                style={{
                                  height: `${
                                    bucket.total > 0
                                      ? (segment.total / bucket.total) * 100
                                      : 0
                                  }%`,
                                  background: segment.color,
                                }}
                                data-details-tooltip={createDetailsTooltip(
                                  segment.name,
                                  `${formatExactNumber(segment.total)} tokens`,
                                  `${bucket.description}\n${buildBucketTooltipNote(
                                    vendor,
                                    scale,
                                  )}`,
                                )}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="models-bar__label">{bucket.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function compareCostRows(
  rankMode: CostRankMode,
  left: CostEntityAnalytics,
  right: CostEntityAnalytics,
) {
  if (rankMode === "tokens") {
    return (
      right.totalTokens - left.totalTokens ||
      left.label.localeCompare(right.label)
    );
  }

  if (rankMode === "rate") {
    return (
      (right.costPerMillionTokens ?? -1) - (left.costPerMillionTokens ?? -1) ||
      left.label.localeCompare(right.label)
    );
  }

  return (
    (right.totalCostUsd ?? -1) - (left.totalCostUsd ?? -1) ||
    left.label.localeCompare(right.label)
  );
}

function filterCostRows({
  rows,
  rankMode,
  showZeroCost,
}: {
  rows: CostEntityAnalytics[];
  rankMode: CostRankMode;
  showZeroCost: boolean;
}) {
  return rows
    .filter((row) => {
      if (row.totalCostUsd === null) {
        return showZeroCost && rankMode !== "cost";
      }

      if (row.totalCostUsd <= 0) {
        return showZeroCost;
      }

      return true;
    })
    .sort((left, right) => compareCostRows(rankMode, left, right));
}

function getVisibleCostRows({
  rows,
  visibleLimit,
  hiddenIds,
}: {
  rows: CostEntityAnalytics[];
  visibleLimit: CostVisibleLimit;
  hiddenIds: Set<string>;
}) {
  const limitedRows =
    visibleLimit === "all" ? rows : rows.slice(0, visibleLimit);

  return limitedRows.filter((row) => !hiddenIds.has(row.id));
}

function buildCostChartBuckets({
  monthKeys,
  rows,
}: {
  monthKeys: string[];
  rows: CostEntityAnalytics[];
}) {
  return monthKeys.map((month) => {
    const segments = rows
      .map((row) => {
        const monthly = row.monthly.find((entry) => entry.month === month);
        const value = monthly?.costUsd ?? 0;

        if (value <= 0) {
          return null;
        }

        return {
          id: row.id,
          label: row.label,
          value,
          color: row.color,
        };
      })
      .filter((segment) => segment !== null);

    return {
      month,
      label: formatMonthLabel(month),
      totalCostUsd: segments.reduce((sum, segment) => sum + segment.value, 0),
      segments,
    };
  });
}

function CostSummary({ cost }: { cost: CostAnalytics }) {
  return (
    <div className="cost-summary">
      <div>
        <div className="cost-summary__label">Harness spend</div>
        <div className="cost-summary__value">
          {formatCurrency(cost.harnessTotalCostUsd)}
        </div>
      </div>
      <div>
        <div className="cost-summary__label">Latest month</div>
        <div className="cost-summary__value">
          {cost.latestMonth
            ? formatCurrency(cost.latestMonth.costUsd)
            : "No cost data"}
        </div>
        <div className="cost-summary__subtle">
          {cost.latestMonth ? formatMonthLabel(cost.latestMonth.month) : ""}
        </div>
      </div>
      <div>
        <div className="cost-summary__label">Top harness</div>
        <div className="cost-summary__value">
          {cost.topHarness?.label ?? "No cost data"}
        </div>
        <div className="cost-summary__subtle">
          {cost.topHarness ? formatCurrency(cost.topHarness.totalCostUsd) : ""}
        </div>
      </div>
      <div>
        <div className="cost-summary__label">Model subtotal</div>
        <div className="cost-summary__value">
          {formatCurrency(cost.modelTotalCostUsd)}
        </div>
      </div>
    </div>
  );
}

function CostStackedChart({
  monthKeys,
  rows,
}: {
  monthKeys: string[];
  rows: CostEntityAnalytics[];
}) {
  const buckets = buildCostChartBuckets({ monthKeys, rows });
  const maxTotal = Math.max(...buckets.map((bucket) => bucket.totalCostUsd), 0);

  return (
    <div className="cost-chart">
      <div
        className="cost-chart__bars"
        style={
          {
            "--bucket-count": Math.max(buckets.length, 1),
          } as CSSProperties
        }
      >
        {buckets.map((bucket) => {
          const stackHeight =
            maxTotal > 0 ? (bucket.totalCostUsd / maxTotal) * 100 : 0;
          const stackStyle =
            bucket.totalCostUsd > 0
              ? `max(${stackHeight}%, ${minimumVisibleCostBarPixels}px)`
              : "0%";
          const tooltipNote = bucket.segments
            .map(
              (segment) => `${segment.label}: ${formatCurrency(segment.value)}`,
            )
            .join("\n");

          return (
            <div
              key={bucket.month}
              className="cost-chart__bar"
              data-details-tooltip={createDetailsTooltip(
                bucket.label,
                formatCurrency(bucket.totalCostUsd),
                tooltipNote,
              )}
            >
              <div className="cost-chart__track">
                <div
                  className="cost-chart__stack"
                  style={{ height: stackStyle }}
                >
                  {bucket.segments.map((segment) => (
                    <span
                      key={`${bucket.month}-${segment.id}`}
                      className="cost-chart__segment"
                      style={{
                        height: `${
                          bucket.totalCostUsd > 0
                            ? (segment.value / bucket.totalCostUsd) * 100
                            : 0
                        }%`,
                        background: segment.color,
                      }}
                      data-details-tooltip={createDetailsTooltip(
                        segment.label,
                        formatCurrency(segment.value),
                        bucket.label,
                      )}
                    />
                  ))}
                </div>
              </div>
              <div className="cost-chart__label">{bucket.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CostRankedRows({
  rows,
  hiddenIds,
  onToggleHidden,
}: {
  rows: CostEntityAnalytics[];
  hiddenIds: Set<string>;
  onToggleHidden: (rowId: string) => void;
}) {
  return (
    <div className="cost-drivers">
      {rows.map((row) => {
        const isHidden = hiddenIds.has(row.id);

        return (
          <button
            key={row.id}
            type="button"
            className={
              isHidden ? "cost-visible-toggle is-hidden" : "cost-visible-toggle"
            }
            onClick={() => onToggleHidden(row.id)}
            data-details-tooltip={createDetailsTooltip(
              row.label,
              formatCurrency(row.totalCostUsd),
              `${row.groupLabel}\n${formatExactNumber(
                row.totalTokens,
              )} tokens\n${formatCostRate(row.costPerMillionTokens)}`,
            )}
          >
            <span
              className="cost-visible-toggle__swatch"
              style={{ background: row.color }}
            />
            <span className="cost-visible-toggle__main">
              <span className="cost-visible-toggle__label">{row.label}</span>
              <span className="cost-visible-toggle__meta">
                {row.groupLabel}
              </span>
            </span>
            <span className="cost-visible-toggle__value">
              {formatCurrency(row.totalCostUsd)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CostView({ cost }: { cost: CostAnalytics }) {
  const [groupMode, setGroupMode] = useState<CostGroupMode>("model");
  const [rankMode, setRankMode] = useState<CostRankMode>("cost");
  const [visibleLimit, setVisibleLimit] = useState<CostVisibleLimit>("all");
  const [showZeroCost, setShowZeroCost] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const sourceRows = groupMode === "harness" ? cost.harnesses : cost.models;
  const rankedRows = useMemo(
    () => filterCostRows({ rows: sourceRows, rankMode, showZeroCost }),
    [rankMode, showZeroCost, sourceRows],
  );
  const visibleRows = useMemo(
    () => getVisibleCostRows({ rows: rankedRows, visibleLimit, hiddenIds }),
    [hiddenIds, rankedRows, visibleLimit],
  );

  return (
    <section className="cost-view">
      <CostSummary cost={cost} />

      <div className="cost-controls">
        <div className="cost-controls__group">
          <div className="view-toggle" role="tablist" aria-label="Cost group">
            {costGroupModes.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  groupMode === option
                    ? "view-toggle__button is-active"
                    : "view-toggle__button"
                }
                onClick={() => setGroupMode(option)}
              >
                {costGroupLabels[option]}
              </button>
            ))}
          </div>
        </div>
        <div className="cost-controls__group">
          <div className="view-toggle" role="tablist" aria-label="Cost ranking">
            {costRankModes.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  rankMode === option
                    ? "view-toggle__button is-active"
                    : "view-toggle__button"
                }
                onClick={() => setRankMode(option)}
              >
                {costRankLabels[option]}
              </button>
            ))}
          </div>
        </div>
        <div className="cost-controls__group">
          <div
            className="view-toggle"
            role="tablist"
            aria-label="Visible costs"
          >
            {costVisibleLimits.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  visibleLimit === option
                    ? "view-toggle__button is-active"
                    : "view-toggle__button"
                }
                onClick={() => setVisibleLimit(option)}
              >
                {option === "all" ? "All" : `Top ${option}`}
              </button>
            ))}
          </div>
        </div>
        <div className="cost-controls__group">
          <label className="cost-checkbox">
            <input
              type="checkbox"
              checked={showZeroCost}
              onChange={(event) => setShowZeroCost(event.currentTarget.checked)}
            />
            <span>Show zero-cost</span>
          </label>
        </div>
      </div>

      <div className="cost-layout">
        <CostStackedChart monthKeys={cost.monthKeys} rows={visibleRows} />
        <aside className="cost-panel">
          <div className="cost-panel__header">
            <div className="cost-panel__title">Cost drivers</div>
            <div className="cost-panel__subtle">
              Updated {formatGeneratedAt(cost.generatedAt)}
            </div>
          </div>
          <CostRankedRows
            rows={rankedRows}
            hiddenIds={hiddenIds}
            onToggleHidden={(rowId) =>
              setHiddenIds((current) => {
                const next = new Set(current);

                if (next.has(rowId)) {
                  next.delete(rowId);
                } else {
                  next.add(rowId);
                }

                return next;
              })
            }
          />
        </aside>
      </div>

      <p className="cost-note">{cost.coverageNote}</p>
    </section>
  );
}

function CursorTooltipContent({ tooltip }: { tooltip: TooltipState }) {
  if (tooltip.kind === "heatmap") {
    return (
      <>
        <div className="cursor-tooltip__eyebrow">{tooltip.provider}</div>
        <div className="cursor-tooltip__date">{tooltip.date}</div>
        <div className="cursor-tooltip__metrics">
          {tooltip.metrics.map((metric) => (
            <div key={metric.label} className="cursor-tooltip__metric">
              <span className="cursor-tooltip__label">{metric.label}</span>
              <span className="cursor-tooltip__value">{metric.value}</span>
            </div>
          ))}
        </div>
        {tooltip.topModel ? (
          <div className="cursor-tooltip__model">
            <span className="cursor-tooltip__label">Top model</span>
            <span className="cursor-tooltip__value">
              {tooltip.topModel}
              {tooltip.topModelTokens ? ` (${tooltip.topModelTokens})` : ""}
            </span>
          </div>
        ) : null}
        {tooltip.note ? (
          <div className="cursor-tooltip__note">{tooltip.note}</div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="cursor-tooltip__eyebrow">{tooltip.label}</div>
      <div className="cursor-tooltip__details-value">{tooltip.value}</div>
      {tooltip.note ? (
        <div className="cursor-tooltip__details-note">{tooltip.note}</div>
      ) : null}
    </>
  );
}

const HeatmapView = memo(function HeatmapView({
  className,
  svgMarkup,
  containerRef,
}: {
  className: string;
  svgMarkup: string;
  containerRef: RefObject<HTMLElement | null>;
}) {
  return (
    <main
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
});

function isViewAvailable(view: UsageViewId, analytics: DetailsAnalytics | null) {
  switch (view) {
    case "heatmap":
      return true;
    case "models":
      return Boolean(analytics?.vendors.length);
    case "cost":
      return Boolean(analytics?.cost);
    case "details":
      return analytics !== null;
  }
}

export function SvgUsage({ svgMarkup, analytics, children }: SvgUsageProps) {
  const containerRef = useRef<HTMLElement>(null);
  const detailsTooltipTargetRef = useRef<Element | null>(null);
  const cursorTargetRef = useRef<Element | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  // `null` means the URL is not a tab (the not-found page renders as children).
  const activeView =
    findUsageViewBySegment(useSelectedLayoutSegment())?.id ?? null;
  const [modelsScale, setModelsScale] = useState<ModelsTimeScale>("month");
  const showAntigravityNoData =
    analytics !== null &&
    !analytics.providers.some((provider) => provider.provider === "agy");

  useEffect(() => {
    cursorTargetRef.current = null;

    detailsTooltipTargetRef.current = null;
    setTooltip(null);
  }, [activeView, modelsScale]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    function setCursorTarget(nextTarget: Element | null) {
      if (cursorTargetRef.current === nextTarget) {
        return;
      }

      cursorTargetRef.current = nextTarget;
    }

    function hideTooltip() {
      setCursorTarget(null);
      detailsTooltipTargetRef.current = null;
      setTooltip((current) => (current ? null : current));
    }

    function handleHeatmapPointerMove(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof SVGRectElement)) {
        hideTooltip();

        return;
      }

      if (cursorTargetRef.current === target) {
        return;
      }

      const nextTooltip = readTooltipState(
        target,
        event.clientX,
        event.clientY,
      );

      if (!nextTooltip) {
        hideTooltip();

        return;
      }

      setCursorTarget(target);
      setTooltip(nextTooltip);
    }

    function handleDetailsPointerOver(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const nextTooltip = readDetailsTooltipState(
        target,
        event.clientX,
        event.clientY,
      );

      if (!nextTooltip) {
        return;
      }

      detailsTooltipTargetRef.current = target.closest(
        "[data-details-tooltip]",
      );
      setCursorTarget(target);
      setTooltip(nextTooltip);
    }

    function handleDetailsPointerMove(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const nextTarget = target.closest("[data-details-tooltip]");

      if (!nextTarget) {
        if (detailsTooltipTargetRef.current) {
          hideTooltip();
        }

        return;
      }

      if (detailsTooltipTargetRef.current !== nextTarget) {
        const nextTooltip = readDetailsTooltipState(
          target,
          event.clientX,
          event.clientY,
        );

        if (!nextTooltip) {
          hideTooltip();

          return;
        }

        detailsTooltipTargetRef.current = nextTarget;
        setCursorTarget(target);
        setTooltip(nextTooltip);

        return;
      }

      setCursorTarget(target);
    }

    function handleDetailsPointerOut(event: PointerEvent) {
      const relatedTarget = event.relatedTarget;

      if (
        relatedTarget instanceof Element &&
        relatedTarget.closest("[data-details-tooltip]") ===
          detailsTooltipTargetRef.current
      ) {
        return;
      }

      hideTooltip();
    }

    if (activeView === "heatmap") {
      container.addEventListener("pointermove", handleHeatmapPointerMove);
    } else {
      container.addEventListener("pointerover", handleDetailsPointerOver);
      container.addEventListener("pointermove", handleDetailsPointerMove);
      container.addEventListener("pointerout", handleDetailsPointerOut);
    }

    container.addEventListener("pointerleave", hideTooltip);

    return () => {
      setCursorTarget(null);
      container.removeEventListener("pointermove", handleHeatmapPointerMove);
      container.removeEventListener("pointerover", handleDetailsPointerOver);
      container.removeEventListener("pointermove", handleDetailsPointerMove);
      container.removeEventListener("pointerout", handleDetailsPointerOut);
      container.removeEventListener("pointerleave", hideTooltip);
    };
  }, [activeView]);

  return (
    <div className="page-root">
      <div className="page-header">
        <nav className="view-toggle" aria-label="Page view">
          {usageViews.map((view) =>
            isViewAvailable(view.id, analytics) ? (
              <Link
                key={view.id}
                href={getUsageViewHref(view)}
                scroll={false}
                aria-current={activeView === view.id ? "page" : undefined}
                className={
                  activeView === view.id
                    ? "view-toggle__button is-active"
                    : "view-toggle__button"
                }
              >
                {view.label}
              </Link>
            ) : null,
          )}
        </nav>
      </div>
      {activeView === "heatmap" && showAntigravityNoData ? (
        <AntigravityNoDataCard />
      ) : null}
      {activeView === null ? null : activeView === "heatmap" || !analytics ? (
        <HeatmapView
          containerRef={containerRef}
          className="page-shell"
          svgMarkup={svgMarkup}
        />
      ) : activeView === "details" ? (
        <main ref={containerRef} className="page-shell page-shell--details">
          <DetailsView analytics={analytics} />
        </main>
      ) : activeView === "cost" && analytics.cost ? (
        <main ref={containerRef} className="page-shell page-shell--cost">
          <CostView cost={analytics.cost} />
        </main>
      ) : (
        <main ref={containerRef} className="page-shell page-shell--models">
          <ModelsView
            vendors={analytics.vendors}
            scale={modelsScale}
            onScaleChange={setModelsScale}
          />
        </main>
      )}
      {children}
      <Cursor
        active
        accentColor={tooltip?.accentColor ?? "#111111"}
        showTooltip={tooltip !== null}
        className="cursor-tooltip"
      >
        {tooltip ? <CursorTooltipContent tooltip={tooltip} /> : null}
      </Cursor>
    </div>
  );
}
