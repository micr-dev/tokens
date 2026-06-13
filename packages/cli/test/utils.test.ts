import assert from "node:assert/strict";
import test from "node:test";
import { normalizeModelName } from "../src/lib/utils";

test("normalizeModelName strips CLIProxy wrappers and date suffixes", () => {
  assert.equal(normalizeModelName("custom:gpt-5.4-[CLIProxy]-24"), "gpt-5.4");
  assert.equal(normalizeModelName("custom:glm-5-[CLIProxy]"), "glm-5");
  assert.equal(
    normalizeModelName("claude-3-5-sonnet-20241022"),
    "claude-3-5-sonnet",
  );
});
