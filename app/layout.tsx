import type { Metadata } from "next";
import { AnimatedFavicon } from "../packages/web/app/animated-favicon";
import { UsageShell } from "../packages/web/app/usage-shell";
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
