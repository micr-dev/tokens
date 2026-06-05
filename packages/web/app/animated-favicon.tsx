"use client";

import { useEffect } from "react";

const SIZE = 32;
const FRAME_MS = 140;
const LOGO_WIDTH = 23;
const LOGO_HEIGHT = 8;

function getFaviconLink() {
  const existingLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  );
  const faviconLink =
    existingLinks.find((link) => link.href.includes("/favicon.ico")) ??
    existingLinks[0];

  if (faviconLink) {
    return faviconLink;
  }

  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
}

export function AnimatedFavicon() {
  useEffect(() => {
    const favicon = getFaviconLink();
    const originalHref = favicon.href;
    const originalType = favicon.type;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    favicon.type = "image/png";

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

      favicon.href = canvas.toDataURL("image/png");

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
      favicon.href = originalHref;
      favicon.type = originalType;
    };
  }, []);

  return null;
}
