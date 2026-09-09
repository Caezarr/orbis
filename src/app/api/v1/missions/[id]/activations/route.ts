import { fail, ok } from "@/lib/api/http";
import { activateMission } from "@/lib/runtime/engine";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const result = activateMission(id);
    if (!result.ok) return ok(result, 409);
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Activation failed");
  }
}
