import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  noExternal: ["ccusage", "svg-builder"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  outDir: "dist",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
