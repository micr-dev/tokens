"use client";

import { useEffect } from "react";

const SIZE = 32;
const FRAME_MS = 140;
const LOGO_WIDTH = 23;
const LOGO_HEIGHT = 8;

function getFaviconLinks() {
  const existingLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  );

  if (existingLinks.length > 0) {
    return existingLinks;
  }

  const link = document.createElement("link");
  link.rel = "icon";
  link.type = "image/png";
  document.head.appendChild(link);
  return [link];
}

export function AnimatedFavicon() {
  useEffect(() => {
    const favicons = getFaviconLinks();
    const originalFavicons = favicons.map((favicon) => ({
      favicon,
      href: favicon.href,
      type: favicon.type,
      sizes: favicon.sizes.value,
    }));
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let x = 1;
    let y = 5;
    let xVelocity = 1;
    let yVelocity = 1;

    const drawFrame = () => {
      context.clearRect(0, 0, SIZE, SIZE);
      context.fillStyle = "#16a34a";
      context.font = "bold 9px Arial, sans-serif";
      context.textBaseline = "top";
      context.fillText("DVD", x, y);

      const frameUrl = canvas.toDataURL("image/png");

      // Next can insert metadata icon tags after hydration. Re-scan each frame
      // so the browser never keeps a later static icon link selected.
      for (const favicon of getFaviconLinks()) {
        favicon.type = "image/png";
        favicon.sizes.value = `${SIZE}x${SIZE}`;
        favicon.href = frameUrl;
      }

      const nextX = x + xVelocity;
      const nextY = y + yVelocity;

      if (nextX <= 0 || nextX + LOGO_WIDTH >= SIZE) {
        xVelocity *= -1;
      } else {
        x = nextX;
      }

      if (nextY <= 0 || nextY + LOGO_HEIGHT >= SIZE) {
        yVelocity *= -1;
      } else {
        y = nextY;
      }
    };

    drawFrame();
    const intervalId = window.setInterval(drawFrame, FRAME_MS);

    return () => {
      window.clearInterval(intervalId);

      for (const original of originalFavicons) {
        original.favicon.href = original.href;
        original.favicon.type = original.type;
        original.favicon.sizes.value = original.sizes;
      }
    };
  }, []);

  return null;
}
