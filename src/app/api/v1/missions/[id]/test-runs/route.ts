import { fail, ok } from "@/lib/api/http";
import { runTest } from "@/lib/runtime/engine";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    caseId?: string;
    text?: string;
    mode?: "test" | "supervised" | "scoped_autonomy";
  };
  const idempotency = request.headers.get("idempotency-key") ?? undefined;
  try {
    const result = runTest({
      missionId: id,
      caseId: body.caseId,
      text: body.text,
      mode: body.mode,
      idempotencyKey: idempotency,
    });
    return ok(result, 201);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Test run failed");
  }
}
