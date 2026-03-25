import assert from "node:assert/strict";
import test from "node:test";
import { getProviderDetailTheme } from "../lib/analytics";
import { normalizePublishedSvgMarkup } from "../lib/usage";

test("normalizePublishedSvgMarkup replaces merged provider lists with All Providers", () => {
  const input =
    '<svg><text x="0" y="0">TOTAL USAGE FROM</text><text x="0" y="14">Claude Code, Codex, Hermes Agent, Helios</text><text x="120" y="0">TOTAL INPUT</text></svg>';

  assert.equal(
    normalizePublishedSvgMarkup(input),
    '<svg><text x="0" y="0">TOTAL USAGE FROM</text><text x="0" y="14">All Providers</text><text x="120" y="0">TOTAL INPUT</text></svg>',
  );
});

test("getProviderDetailTheme keeps Hermes aligned with the heatmap palette", () => {
  assert.deepEqual(getProviderDetailTheme("hermes"), {
    accent: "#ffc107",
    accentSoft: "#fffde7",
  });
});

test("getProviderDetailTheme exposes Droid slate gray colors for details cards", () => {
  assert.deepEqual(getProviderDetailTheme("droid"), {
    accent: "#475569",
    accentSoft: "#f8fafc",
  });
});

test("getProviderDetailTheme exposes Gemini CLI colors for details cards", () => {
  assert.deepEqual(getProviderDetailTheme("gemini"), {
    accent: "#ef4444",
    accentSoft: "#fef2f2",
  });
});
