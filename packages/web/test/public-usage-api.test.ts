import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/v1/usage.json/route";
import { getPublishedUsagePayload } from "../lib/usage";

test("public usage feed returns the dashboard snapshot with a versioned schema", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), {
    schemaVersion: 1,
    ...(await getPublishedUsagePayload()),
  });
});
