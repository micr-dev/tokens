"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SVGProps,
} from "react";

const viewportPadding = 12;
const fallbackTooltipWidth = 320;
const fallbackTooltipHeight = 220;
const pointerHotspot = { x: 3, y: 3 };
const tooltipOffset = { x: 18, y: 18 };

export interface CursorProps {
  active: boolean;
  accentColor?: string | null;
  children: ReactNode;
  className?: string;
  position?: { x: number; y: number } | null;
  showTooltip?: boolean;
}

function parseColor(color: string) {
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hex) {
    const value = hex[1];
    const normalized =
      value.length === 3
        ? value
            .split("")
            .map((part) => `${part}${part}`)
            .join("")
        : value;

    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  }

  const rgb = color
    .trim()
    .match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:,\s*[\d.]+)?\)$/i);

  if (rgb) {
    return {
      r: Number.parseInt(rgb[1], 10),
      g: Number.parseInt(rgb[2], 10),
      b: Number.parseInt(rgb[3], 10),
    };
  }

  return null;
}

function withAlpha(color: string, alpha: number) {
  const parsed = parseColor(color);

  if (!parsed) {
    return color;
  }

  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}

function getContrastColor(color: string) {
  const parsed = parseColor(color);

  if (!parsed) {
    return "#f8fafc";
  }

  const channels = [parsed.r, parsed.g, parsed.b].map((value) => {
    const normalized = value / 255;

    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;

  return luminance > 0.45 ? "#0f172a" : "#f8fafc";
}

function MouseIcon(props: Readonly<SVGProps<SVGSVGElement>>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={26}
      height={31}
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <g clipPath="url(#cursor-clip)">
        <path
          fill="currentColor"
          fillRule="evenodd"
          stroke="var(--cursor-outline)"
          strokeLinecap="square"
          strokeWidth={2}
          d="M21.993 14.425 2.549 2.935l4.444 23.108 4.653-10.002z"
          clipRule="evenodd"
        />
      </g>
      <defs>
        <clipPath id="cursor-clip">
          <path fill="currentColor" d="M0 0h26v31H0z" />
        </clipPath>
      </defs>
    </svg>
  );
}

function clampTooltipPosition(
  x: number,
  y: number,
  element: HTMLDivElement | null,
) {
  const width = element?.offsetWidth ?? fallbackTooltipWidth;
  const height = element?.offsetHeight ?? fallbackTooltipHeight;

  return {
    x: Math.max(
      viewportPadding,
      Math.min(x, window.innerWidth - width - viewportPadding),
    ),
    y: Math.max(
      viewportPadding,
      Math.min(y, window.innerHeight - height - viewportPadding),
    ),
  };
}

export function Cursor({
  active,
  accentColor,
  children,
  className,
  position,
  showTooltip = false,
}: Readonly<CursorProps>) {
  const frameRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<{ x: number; y: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [trackedPosition, setTrackedPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const resolvedPosition = position ?? trackedPosition;

  useEffect(() => {
    function flushPointerPosition() {
      frameRef.current = null;
      setTrackedPosition(pendingPositionRef.current);
    }

    function handlePointerMove(event: PointerEvent) {
      pendingPositionRef.current = { x: event.clientX, y: event.clientY };

      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(flushPointerPosition);
      }
    }

    function clearPointer() {
      pendingPositionRef.current = null;

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      setTrackedPosition(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("blur", clearPointer);
    document.documentElement.addEventListener("mouseleave", clearPointer);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("blur", clearPointer);
      document.documentElement.removeEventListener("mouseleave", clearPointer);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!active || !resolvedPosition || !showTooltip) {
      setTooltipPosition(null);
      return;
    }

    setTooltipPosition(
      clampTooltipPosition(
        resolvedPosition.x + tooltipOffset.x,
        resolvedPosition.y + tooltipOffset.y,
        tooltipRef.current,
      ),
    );
  }, [active, children, resolvedPosition, showTooltip]);

  if (!active || !resolvedPosition) {
    return null;
  }

  const accent = accentColor?.trim() || "#111111";
  const foreground = getContrastColor(accent);

  const shellStyle = {
    "--cursor-accent": accent,
    "--cursor-foreground": foreground,
    "--cursor-muted": withAlpha(foreground, 0.78),
    "--cursor-outline": withAlpha("#ffffff", foreground === "#0f172a" ? 0.7 : 0.96),
    "--cursor-note": withAlpha(foreground, 0.14),
  } as CSSProperties;

  const iconStyle = {
    left: resolvedPosition.x - pointerHotspot.x,
    top: resolvedPosition.y - pointerHotspot.y,
  } satisfies CSSProperties;

  const bubbleStyle = {
    left: tooltipPosition?.x ?? resolvedPosition.x + tooltipOffset.x,
    top: tooltipPosition?.y ?? resolvedPosition.y + tooltipOffset.y,
  } satisfies CSSProperties;

  return (
    <div className="cursor-shell" style={shellStyle}>
      <MouseIcon className="cursor-shell__icon" style={iconStyle} />
      {showTooltip ? (
        <div ref={tooltipRef} className={className} style={bubbleStyle}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
