"use client";

import { useEffect, useRef, useState } from "react";

interface SvgUsageProps {
  svgMarkup: string;
}

interface TooltipState {
  text: string;
  x: number;
  y: number;
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

      const title = target.querySelector("title")?.textContent?.trim();

      if (!title) {
        hideTooltip();

        return;
      }

      setTooltip({
        text: title,
        x: event.clientX + 16,
        y: event.clientY + 16,
      });
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
          {tooltip.text}
        </div>
      ) : null}
    </>
  );
}
