import type { NextConfig } from "next";

const configuredBasePath = process.env.SLOPMETER_WEB_BASE_PATH?.trim() || "/tokens";
const basePath =
  configuredBasePath === "/"
    ? undefined
    : configuredBasePath.replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath,
};

export default nextConfig;
