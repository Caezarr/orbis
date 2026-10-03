import { withWorkspaceRequest } from "@/lib/platform/request";
import { answerQuestion, answerSchema } from "@/lib/brain/service";
import { brainUnavailable, UUID } from "../../gate";

export const runtime = "nodejs";
/** Answer once: creates an approved fact (source = this answer). Body `{answer, conditional?}`; owner/admin. */
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
      const parsed = answerSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return Response.json({ error: "Écrivez une réponse (400 caractères max)." }, { status: 400 });
      return Response.json(await answerQuestion(id, parsed.data), { status: 201 });
    },
    { requireRole: ["owner", "admin"] },
  );
}
