import type { Metadata } from "next";
import { AnimatedFavicon } from "./animated-favicon";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Usage",
  description: "Merged daily coding-agent usage heatmap.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AnimatedFavicon />
        {children}
      </body>
    </html>
  );
}
