"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  formatCompactNumber,
  formatPercent,
  getProviderDetailTheme,
  getProviderTitle,
} from "../lib/analytics";
import type { ProviderAnalytics } from "../lib/types";

interface SvgUsageProps {
  svgMarkup: string;
  analytics: ProviderAnalytics[] | null;
}

interface TooltipMetric {
  label: string;
  value: string;
}

interface HeatmapTooltipState {
  kind: "heatmap";
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
  label: string;
  value: string;
  note: string | null;
  x: number;
  y: number;
}

type TooltipState = HeatmapTooltipState | DetailsTooltipState;
type ActiveView = "heatmap" | "details";
const exactNumberFormatter = new Intl.NumberFormat("en-US");

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

  if (!provider || !date || !total || !input || !output || !cacheInput || !cacheOutput) {
    return null;
  }

  return {
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

function readDetailsTooltipState(target: HTMLElement, x: number, y: number) {
  const source = target.closest<HTMLElement>("[data-details-tooltip]");
  const payload = source?.dataset.detailsTooltip?.trim();

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

function clampTooltipPosition(
  x: number,
  y: number,
  tooltipElement: HTMLDivElement | null,
) {
  const viewportPadding = 12;
  const tooltipWidth = tooltipElement?.offsetWidth ?? 280;
  const tooltipHeight = tooltipElement?.offsetHeight ?? 220;

  return {
    left: Math.max(
      viewportPadding,
      Math.min(x, window.innerWidth - tooltipWidth - viewportPadding),
    ),
    top: Math.max(
      viewportPadding,
      Math.min(y, window.innerHeight - tooltipHeight - viewportPadding),
    ),
  };
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

function ModelShareBars({ models }: { models: ProviderAnalytics["topModels"] }) {
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
              {formatCompactNumber(model.total)} · {formatPercent(model.share * 100)}
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

function DetailsView({ analytics }: { analytics: ProviderAnalytics[] }) {
  return (
    <section className="details-grid">
      {analytics.map((provider) => {
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
                <span className="provider-card__stat-value">{provider.activeDays}</span>
              </div>
              <div>
                <span className="provider-card__stat-label">Longest streak</span>
                <span className="provider-card__stat-value">
                  {provider.longestStreak}
                </span>
              </div>
              <div>
                <span className="provider-card__stat-label">Current streak</span>
                <span className="provider-card__stat-value">
                  {provider.currentStreak}
                </span>
              </div>
            </div>

            <div className="provider-card__highlights">
              <div>
                <div className="provider-card__eyebrow">Peak day</div>
                <div className="provider-card__highlight">
                  {provider.topDay ? formatFullDate(provider.topDay.date) : "None"}
                </div>
                <div className="provider-card__subtle">
                  {provider.topDay ? formatCompactNumber(provider.topDay.total) : ""}
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

export function SvgUsage({ svgMarkup, analytics }: SvgUsageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("heatmap");

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    function hideTooltip() {
      setTooltip((current) => (current ? null : current));
    }

    function handlePointerMove(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        hideTooltip();

        return;
      }

      const nextTooltip =
        activeView === "heatmap" && target instanceof SVGRectElement
          ? readTooltipState(target, event.clientX + 18, event.clientY + 18)
          : target instanceof HTMLElement
            ? readDetailsTooltipState(target, event.clientX + 18, event.clientY + 18)
            : null;

      if (!nextTooltip) {
        hideTooltip();

        return;
      }

      setTooltip(nextTooltip);
    }

    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", hideTooltip);

    return () => {
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", hideTooltip);
    };
  }, [activeView]);

  const tooltipPosition = tooltip
    ? clampTooltipPosition(tooltip.x, tooltip.y, tooltipRef.current)
    : null;

  return (
    <>
      <div className="page-header">
        <div className="view-toggle" role="tablist" aria-label="Page view">
          <button
            type="button"
            className={activeView === "heatmap" ? "view-toggle__button is-active" : "view-toggle__button"}
            onClick={() => setActiveView("heatmap")}
          >
            Heatmap
          </button>
          {analytics ? (
            <button
              type="button"
              className={activeView === "details" ? "view-toggle__button is-active" : "view-toggle__button"}
              onClick={() => setActiveView("details")}
            >
              Details
            </button>
          ) : null}
        </div>
      </div>
      {activeView === "heatmap" || !analytics ? (
        <main
          ref={containerRef}
          className="page-shell"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      ) : (
        <main ref={containerRef} className="page-shell page-shell--details">
          <DetailsView analytics={analytics} />
        </main>
      )}
      {tooltip ? (
        <div
          ref={tooltipRef}
          className="heatmap-tooltip"
          style={{
            left: tooltipPosition?.left ?? tooltip.x,
            top: tooltipPosition?.top ?? tooltip.y,
          }}
        >
          {tooltip.kind === "heatmap" ? (
            <>
              <div className="heatmap-tooltip__eyebrow">{tooltip.provider}</div>
              <div className="heatmap-tooltip__date">{tooltip.date}</div>
              <div className="heatmap-tooltip__metrics">
                {tooltip.metrics.map((metric) => (
                  <div key={metric.label} className="heatmap-tooltip__metric">
                    <span className="heatmap-tooltip__label">{metric.label}</span>
                    <span className="heatmap-tooltip__value">{metric.value}</span>
                  </div>
                ))}
              </div>
              {tooltip.topModel ? (
                <div className="heatmap-tooltip__model">
                  <span className="heatmap-tooltip__label">Top model</span>
                  <span className="heatmap-tooltip__value">
                    {tooltip.topModel}
                    {tooltip.topModelTokens ? ` (${tooltip.topModelTokens})` : ""}
                  </span>
                </div>
              ) : null}
              {tooltip.note ? (
                <div className="heatmap-tooltip__note">{tooltip.note}</div>
              ) : null}
            </>
          ) : (
            <>
              <div className="heatmap-tooltip__eyebrow">{tooltip.label}</div>
              <div className="heatmap-tooltip__date">{tooltip.value}</div>
              {tooltip.note ? (
                <div className="heatmap-tooltip__note">{tooltip.note}</div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
