"use client";

import { useEffect } from "react";

const SIZE = 32;
const FRAME_MS = 140;
const FRAME_COUNT = 61;
const SPRITE_URL = "/favicon-sprite.png";

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
    const sprite = new Image();

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let frameIndex = 0;
    let intervalId: number | undefined;

    const drawFrame = () => {
      context.clearRect(0, 0, SIZE, SIZE);
      context.drawImage(
        sprite,
        frameIndex * SIZE,
        0,
        SIZE,
        SIZE,
        0,
        0,
        SIZE,
        SIZE,
      );

      const frameUrl = canvas.toDataURL("image/png");

      // Next can insert metadata icon tags after hydration. Re-scan each frame
      // so the browser never keeps a later static icon link selected.
      for (const favicon of getFaviconLinks()) {
        favicon.type = "image/png";
        favicon.sizes.value = `${SIZE}x${SIZE}`;
        favicon.href = frameUrl;
      }

      frameIndex = (frameIndex + 1) % FRAME_COUNT;
    };

    const handleSpriteLoad = () => {
      drawFrame();
      intervalId = window.setInterval(drawFrame, FRAME_MS);
    };

    sprite.addEventListener("load", handleSpriteLoad, { once: true });
    sprite.src = SPRITE_URL;

    return () => {
      sprite.removeEventListener("load", handleSpriteLoad);

      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }

      for (const original of originalFavicons) {
        original.favicon.href = original.href;
        original.favicon.type = original.type;
        original.favicon.sizes.value = original.sizes;
      }
    };
  }, []);

  return null;
}
