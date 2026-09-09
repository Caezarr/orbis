import { fail, ok } from "@/lib/api/http";
import { decideAction } from "@/lib/runtime/engine";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    decision?: "approved" | "rejected";
  } | null;
  if (!body?.decision) return fail("decision required");
  try {
    return ok(decideAction({ actionId: id, decision: body.decision }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Decision failed");
  }
}
