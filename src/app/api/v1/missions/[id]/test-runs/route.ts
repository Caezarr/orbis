import { fail, ok } from "@/lib/api/http";
import { runTest } from "@/lib/runtime/agent-engine";
import { z } from "zod";
import { isLocalMutation } from "@/lib/api/local-request";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isLocalMutation(request))
    return fail(
      "Live runs are restricted to the local workspace. Production authentication is not configured.",
      403,
    );
  const { id } = await context.params;
  const parsed = z
    .object({
      caseId: z.string().max(200).optional(),
      text: z.string().trim().min(10).max(20000).optional(),
      mode: z.literal("test").optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return fail(
      "Provide a request of 10–20,000 characters. This endpoint only supports test mode.",
      400,
    );
  const body = parsed.data;
  const idempotency = request.headers.get("idempotency-key") ?? undefined;
  try {
    const result = await runTest({
      missionId: id,
      caseId: body.caseId,
      text: body.text,
      idempotencyKey: idempotency,
    });
    return ok(result, 201);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Test run failed");
  }
}
