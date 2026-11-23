import { createJsonExportPayload } from "../packages/cli/src/lib/export";
import { loadOpenCodeRows } from "../packages/cli/src/lib/open-code";
import { loadAntigravityRows } from "../packages/cli/src/lib/antigravity";

// Use the publisher's UTC day boundaries on every machine.
process.env.TZ = "UTC";
async function main() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  const provider = process.argv[3];
  if (provider !== "opencode" && provider !== "agy")
    throw new Error("Expected opencode or agy provider");
  const usage =
    provider === "opencode"
      ? await loadOpenCodeRows(start, end)
      : await loadAntigravityRows(start, end);
  if (usage.daily.length === 0)
    throw new Error(
      `No ${provider} usage found; preserving the previous machine export.`,
    );
  process.stdout.write(
    JSON.stringify({
      exportVersion: 1,
      machine: process.argv[2],
      exportedAt: end.toISOString(),
      payload: createJsonExportPayload(start, end, [usage]),
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
