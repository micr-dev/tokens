"use client";

import { useEffect, useRef, useState } from "react";

interface SvgUsageProps {
  svgMarkup: string;
}

interface TooltipMetric {
  label: string;
  value: string;
}

interface TooltipState {
  provider: string;
  date: string;
  metrics: TooltipMetric[];
  topModel: string | null;
  topModelTokens: string | null;
  note: string | null;
  x: number;
  y: number;
}

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
  } satisfies TooltipState;
}

export function SvgUsage({ svgMarkup }: SvgUsageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

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

      if (!(target instanceof SVGRectElement)) {
        hideTooltip();

        return;
      }

      const nextTooltip = readTooltipState(
        target,
        event.clientX + 18,
        event.clientY + 18,
      );

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
  }, []);

  return (
    <>
      <main
        ref={containerRef}
        className="page-shell"
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
      {tooltip ? (
        <div
          className="heatmap-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
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
        </div>
      ) : null}
    </>
  );
}
