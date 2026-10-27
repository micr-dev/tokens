import { getPublishedUsagePayload } from "../../../../lib/usage";

// The dashboard and API must use the same published snapshot.
export async function GET() {
  const usage = await getPublishedUsagePayload();
  if (!usage) {
    return Response.json(
      { error: "Published usage is unavailable" },
      { status: 503 },
    );
  }
  return Response.json({ schemaVersion: 1, ...usage });
}
