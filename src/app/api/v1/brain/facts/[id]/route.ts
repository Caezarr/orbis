import { withWorkspaceRequest } from "@/lib/platform/request";
import { factReviewSchema, reviewFact } from "@/lib/brain/service";
import { brainUnavailable, UUID } from "../../gate";

export const runtime = "nodejs";
/** Approve (optionally edited) or reject one fact. Body `{action, statement?, expectedVersion}`; owner/admin. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withWorkspaceRequest(
    request,
    async () => {
      const off = brainUnavailable();
      if (off) return off;
      const { id } = await context.params;
      if (!UUID.test(id))
        return Response.json({ error: "Fait introuvable." }, { status: 404 });
      const parsed = factReviewSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return Response.json({ error: "Action invalide." }, { status: 400 });
      return Response.json(await reviewFact(id, parsed.data));
    },
    { requireRole: ["owner", "admin"] },
  );
}
