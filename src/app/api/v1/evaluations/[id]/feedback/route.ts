import { fail, ok } from "@/lib/api/http";
import { applyFeedback } from "@/lib/runtime/engine";
import { z } from "zod";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsed = z
    .object({
      correction: z.string().max(8000).default(""),
      scope: z
        .enum(["this_result", "this_customer", "general_rule"])
        .default("this_result"),
      accepted: z.boolean().default(false),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid feedback.");
  const body = parsed.data;
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
