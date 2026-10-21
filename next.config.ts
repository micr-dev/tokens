import type { NextConfig } from "next";

const configuredBasePath = process.env.SLOPMETER_WEB_BASE_PATH?.trim();
const basePath =
  !configuredBasePath || configuredBasePath === "/"
    ? undefined
    : configuredBasePath.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
    // Prefetch per segment so tab links share the root layout's data payload
    // instead of downloading the full page payload once per tab.
    clientSegmentCache: true,
  },
  outputFileTracingRoot: process.cwd(),
  basePath,
};

export default nextConfig;
