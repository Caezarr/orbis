import { withWorkspaceRequest } from "@/lib/platform/request";
import { regenerationSchema, requestRegeneration } from "@/lib/brain/service";
import { brainUnavailable } from "../gate";

export const runtime = "nodejs";
/**
 * One-click "nouvelle info disponible" → queue a NEW draft for that thread.
 * The old Orbis draft is never deleted (mailbox policy). Body `{inboxMessageId}`.
 */
export async function POST(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      const off = brainUnavailable();
      if (off) return off;
      const parsed = regenerationSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return Response.json({ error: "Brouillon invalide." }, { status: 400 });
      return Response.json(
        await requestRegeneration(parsed.data.inboxMessageId),
        { status: 202 },
      );
    },
    { requireRole: ["owner", "admin", "operator"] },
  );
}
