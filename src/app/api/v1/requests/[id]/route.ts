import { withWorkspaceRequest } from "@/lib/platform/request";
import { actionSchema, requestAction } from "@/lib/followups/service";
import { requestsUnavailable, UUID } from "../gate";

export const runtime = "nodejs";
/**
 * Owner decisions on one request: `{action: "won"|"lost"|"reopen"|"snooze"(days)|
 * "dismiss_followups"|"resume_followups"|"erase_contact"}` (strict). Owner/admin/operator;
 * erase_contact owner/admin only.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withWorkspaceRequest(
    request,
    async () => {
      const off = requestsUnavailable();
      if (off) return off;
      const { id } = await context.params;
      if (!UUID.test(id))
        return Response.json({ error: "Demande introuvable." }, { status: 404 });
      const parsed = actionSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return Response.json({ error: "Action invalide." }, { status: 400 });
      return Response.json(await requestAction(id, parsed.data));
    },
    { requireRole: ["owner", "admin", "operator"] },
  );
}
