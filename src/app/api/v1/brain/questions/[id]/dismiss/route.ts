import { withWorkspaceRequest } from "@/lib/platform/request";
import { dismissQuestion } from "@/lib/brain/service";
import { brainUnavailable, UUID } from "../../../gate";

export const runtime = "nodejs";
/** « Pas pertinent » : the question is closed without creating a fact. Owner/admin. */
export async function POST(
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
        return Response.json({ error: "Question introuvable." }, { status: 404 });
      return Response.json(await dismissQuestion(id));
    },
    { requireRole: ["owner", "admin"] },
  );
}
