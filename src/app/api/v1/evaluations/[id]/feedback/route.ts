import { fail, ok } from "@/lib/api/http";
import { applyFeedback } from "@/lib/runtime/engine";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    correction?: string;
    scope?: "this_result" | "this_customer" | "general_rule";
    accepted?: boolean;
  } | null;
  try {
    const result = applyFeedback({
      evaluationId: id,
      correction: body?.correction ?? "",
      scope: body?.scope ?? "this_result",
      accepted: body?.accepted ?? false,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Feedback failed");
  }
}
