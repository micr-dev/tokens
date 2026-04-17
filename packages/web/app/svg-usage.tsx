"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Cursor } from "../components/cursor";
import {
  formatCompactNumber,
  formatPercent,
  getProviderDetailTheme,
  getProviderTitle,
} from "../lib/analytics";
import type {
  DetailsAnalytics,
  ModelsTimeScale,
  ProviderAnalytics,
  VendorModelsAnalytics,
} from "../lib/types";

interface SvgUsageProps {
  svgMarkup: string;
  analytics: DetailsAnalytics | null;
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
type ActiveView = "heatmap" | "details" | "models";

const exactNumberFormatter = new Intl.NumberFormat("en-US");
const modelScaleOrder: ModelsTimeScale[] = ["year", "month", "week", "day"];
const defaultCursorAccent = "#22c55e";
const modelScaleLabels: Record<ModelsTimeScale, string> = {
  year: "Year",
  month: "Month",
  week: "Week",
  day: "Day",
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

function formatMonthLabel(value: string) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function formatPeakMonthLabel(value: string) {
  return new Date(`${value}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function formatExactNumber(value: number) {
  return exactNumberFormatter.format(value);
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
    ".models-row__legend-swatch, .models-bar__segment, .series-bars__fill, .model-share__fill",
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

function SeriesBars({
  points,
  formatter,
  noteFormatter,
}: {
  points: Array<{ label: string; value: number }>;
  formatter: (value: number) => string;
  noteFormatter?: (value: number) => string;
}) {
  const maxValue = Math.max(...points.map((point) => point.value), 0);

  return (
    <div className="series-bars">
      {points.map((point) => (
        <div
          key={point.label}
          className="series-bars__item"
          data-details-tooltip={createDetailsTooltip(
            point.label,
            formatter(point.value),
            noteFormatter?.(point.value),
          )}
        >
          <div className="series-bars__track">
            <div
              className="series-bars__fill"
              style={{
                height: `${maxValue > 0 ? (point.value / maxValue) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="series-bars__label">{point.label}</div>
        </div>
      ))}
    </div>
  );
}

function ModelShareBars({
  models,
}: {
  models: ProviderAnalytics["topModels"];
}) {
  return (
    <div className="model-share">
      {models.map((model) => (
        <div
          key={model.name}
          className="model-share__row"
          data-details-tooltip={createDetailsTooltip(
            model.name,
            `${formatExactNumber(model.total)} tokens`,
            `${formatPercent(model.share * 100)} of provider total`,
          )}
        >
          <div className="model-share__meta">
            <span className="model-share__name">{model.name}</span>
            <span className="model-share__value">
              {formatCompactNumber(model.total)} ·{" "}
              {formatPercent(model.share * 100)}
            </span>
          </div>
          <div className="model-share__track">
            <div
              className="model-share__fill"
              style={{ width: `${model.share * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function LegacyProviderCards({
  providers,
}: {
  providers: ProviderAnalytics[];
}) {
  return (
    <section className="details-grid">
      {providers.map((provider) => {
        const theme = getProviderDetailTheme(provider.provider);
        const cardStyle = {
          "--provider-accent": theme.accent,
          "--provider-accent-soft": theme.accentSoft,
        } as CSSProperties;

        return (
          <section
            key={provider.provider}
            className={`provider-card provider-card--${provider.provider}`}
            style={cardStyle}
          >
            <header className="provider-card__header">
              <h2 className="provider-card__title">
                {getProviderTitle(provider.provider)}
              </h2>
              <div className="provider-card__total">
                {formatCompactNumber(provider.total)}
              </div>
            </header>

            <div className="provider-card__stats">
              <div>
                <span className="provider-card__stat-label">Input</span>
                <span className="provider-card__stat-value">
                  {formatCompactNumber(provider.input)}
                </span>
              </div>
              <div>
                <span className="provider-card__stat-label">Output</span>
                <span className="provider-card__stat-value">
                  {formatCompactNumber(provider.output)}
                </span>
              </div>
              <div>
                <span className="provider-card__stat-label">Cache share</span>
                <span className="provider-card__stat-value">
                  {formatPercent(provider.cacheShare)}
                </span>
              </div>
              <div>
                <span className="provider-card__stat-label">Active days</span>
                <span className="provider-card__stat-value">
                  {provider.activeDays}
                </span>
              </div>
              <div>
                <span className="provider-card__stat-label">
                  Longest streak
                </span>
                <span className="provider-card__stat-value">
                  {provider.longestStreak}
                </span>
              </div>
              <div>
                <span className="provider-card__stat-label">
                  Current streak
                </span>
                <span className="provider-card__stat-value">
                  {provider.currentStreak}
                </span>
              </div>
            </div>

            <div className="provider-card__highlights">
              <div>
                <div className="provider-card__eyebrow">Peak day</div>
                <div className="provider-card__highlight">
                  {provider.topDay
                    ? formatFullDate(provider.topDay.date)
                    : "None"}
                </div>
                <div className="provider-card__subtle">
                  {provider.topDay
                    ? formatCompactNumber(provider.topDay.total)
                    : ""}
                </div>
              </div>
              <div>
                <div className="provider-card__eyebrow">Peak month</div>
                <div className="provider-card__highlight">
                  {provider.topMonth
                    ? formatPeakMonthLabel(provider.topMonth.label)
                    : "None"}
                </div>
                <div className="provider-card__subtle">
                  {provider.topMonth
                    ? formatCompactNumber(provider.topMonth.total)
                    : ""}
                </div>
              </div>
              <div>
                <div className="provider-card__eyebrow">Most used model</div>
                <div className="provider-card__highlight provider-card__highlight--truncate">
                  {provider.mostUsedModel?.name ?? "None"}
                </div>
                <div className="provider-card__subtle">
                  {provider.mostUsedModel
                    ? formatCompactNumber(provider.mostUsedModel.total)
                    : ""}
                </div>
              </div>
              <div>
                <div className="provider-card__eyebrow">Recent model</div>
                <div className="provider-card__highlight provider-card__highlight--truncate">
                  {provider.recentMostUsedModel?.name ?? "None"}
                </div>
                <div className="provider-card__subtle">
                  {provider.recentMostUsedModel
                    ? formatCompactNumber(provider.recentMostUsedModel.total)
                    : ""}
                </div>
              </div>
            </div>

            <div className="provider-card__section">
              <div className="provider-card__section-title">Monthly totals</div>
              <SeriesBars
                points={provider.monthly.map((point) => ({
                  ...point,
                  label: formatMonthLabel(point.label),
                }))}
                formatter={formatCompactNumber}
                noteFormatter={(value) => `${formatExactNumber(value)} tokens`}
              />
            </div>

            <div className="provider-card__section">
              <div className="provider-card__section-title">Weekday shape</div>
              <SeriesBars
                points={provider.weekdays}
                formatter={formatCompactNumber}
                noteFormatter={(value) => `${formatExactNumber(value)} tokens`}
              />
            </div>

            <div className="provider-card__section">
              <div className="provider-card__section-title">Top models</div>
              <ModelShareBars models={provider.topModels} />
            </div>
          </section>
        );
      })}
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

export function SvgUsage({ svgMarkup, analytics }: SvgUsageProps) {
  const containerRef = useRef<HTMLElement>(null);
  const detailsTooltipTargetRef = useRef<Element | null>(null);
  const cursorTargetRef = useRef<Element | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("heatmap");
  const [modelsScale, setModelsScale] = useState<ModelsTimeScale>("month");

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
        <div className="view-toggle" role="tablist" aria-label="Page view">
          <button
            type="button"
            className={
              activeView === "heatmap"
                ? "view-toggle__button is-active"
                : "view-toggle__button"
            }
            onClick={() => setActiveView("heatmap")}
          >
            Harnesses
          </button>
          {analytics?.vendors.length ? (
            <button
              type="button"
              className={
                activeView === "models"
                  ? "view-toggle__button is-active"
                  : "view-toggle__button"
              }
              onClick={() => setActiveView("models")}
            >
              Models
            </button>
          ) : null}
          {analytics ? (
            <button
              type="button"
              className={
                activeView === "details"
                  ? "view-toggle__button is-active"
                  : "view-toggle__button"
              }
              onClick={() => setActiveView("details")}
            >
              Details
            </button>
          ) : null}
        </div>
      </div>
      {activeView === "heatmap" || !analytics ? (
        <HeatmapView
          containerRef={containerRef}
          className="page-shell"
          svgMarkup={svgMarkup}
        />
      ) : activeView === "details" ? (
        <main
          ref={containerRef}
          className="page-shell page-shell--details"
        >
          <LegacyProviderCards providers={analytics.providers} />
        </main>
      ) : (
        <main
          ref={containerRef}
          className="page-shell page-shell--models"
        >
          <ModelsView
            vendors={analytics.vendors}
            scale={modelsScale}
            onScaleChange={setModelsScale}
          />
        </main>
      )}
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
