import type { Metadata } from "next";
import { AnimatedFavicon } from "./animated-favicon";
import { UsageShell } from "./usage-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Daily Usage", template: "%s · Daily Usage" },
  description: "Merged daily coding-agent usage heatmap.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AnimatedFavicon />
        <UsageShell>{children}</UsageShell>
      </body>
    </html>
  );
}
