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

test("normalizePublishedSvgMarkup preserves dark heatmap colors and applies reference fonts", () => {
  const input =
    '<svg><rect fill="#171717"></rect><rect fill="#262626"></rect><rect fill="#bbf7d0"></rect><text font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif">Jun</text></svg>';

  assert.equal(
    normalizePublishedSvgMarkup(input),
    '<svg><rect fill="#171717"></rect><rect fill="#262626"></rect><rect fill="#bbf7d0"></rect><text font-family="helveticaNeue, Helvetica Neue, sans-serif">Jun</text></svg>',
  );
});

test("getProviderDetailTheme keeps Hermes aligned with the heatmap palette", () => {
  assert.deepEqual(getProviderDetailTheme("hermes"), {
    accent: "#ffc107",
    accentSoft: "#fffde7",
  });
});

test("getProviderDetailTheme exposes Droid red colors for details cards", () => {
  assert.deepEqual(getProviderDetailTheme("droid"), {
    accent: "#ef4444",
    accentSoft: "#fef2f2",
  });
});

test("getProviderDetailTheme exposes legacy Gemini CLI colors for details cards", () => {
  assert.deepEqual(getProviderDetailTheme("gemini"), {
    accent: "#a3a3a3",
    accentSoft: "#202020",
  });
});
