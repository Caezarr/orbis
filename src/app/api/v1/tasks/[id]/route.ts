import { withWorkspaceRequest } from "@/lib/platform/request";
import { getTask, decideTask } from "@/lib/operations/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return withWorkspaceRequest(request, async () =>
    Response.json(await getTask((await context.params).id)),
  );
}
export async function POST(request: Request, context: Context) {
  return withWorkspaceRequest(
    request,
    async () => {
      const body = await request.json().catch(() => null);
      if (!body || !["accept", "reject", "cancel"].includes(body.decision))
        return Response.json(
          { error: "Choose accept, reject or cancel." },
          { status: 400 },
        );
      return Response.json(
        await decideTask(
          (await context.params).id,
          body.decision,
          body.reviewToken,
        ),
      );
    },
    { requireRole: ["owner", "admin", "operator"] },
  );
}
