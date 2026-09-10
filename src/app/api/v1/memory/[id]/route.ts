import { fail, ok } from "@/lib/api/http";
import { mutateStore } from "@/lib/store/store";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || !["approved", "rejected"].includes(body.status))
    return fail("Choose approved or rejected.");
  try {
    return ok(
      mutateStore((state) => {
        const memory = state.memory.find(
          (m) => m.id === id && m.tenantId === state.workspace.tenantId,
        );
        if (!memory || !memory.missionId || memory.scope !== "general_rule")
          throw new Error("Only mission-scoped rules can be promoted here.");
        memory.status = body.status;
        const mission = state.missions.find((m) => m.id === memory.missionId);
        if (mission) mission.state = "testing";
        return memory;
      }),
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not update rule",
    );
  }
}
