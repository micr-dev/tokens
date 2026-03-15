import type { Metadata } from "next";
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
      <body>{children}</body>
    </html>
  );
}
