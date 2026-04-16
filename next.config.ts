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
  },
  outputFileTracingRoot: process.cwd(),
  basePath,
};

export default nextConfig;
