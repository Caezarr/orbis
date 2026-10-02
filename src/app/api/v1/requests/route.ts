import { withWorkspaceRequest } from "@/lib/platform/request";
import { listRequests, listSchema } from "@/lib/followups/service";
import { requestsUnavailable } from "./gate";

export const runtime = "nodejs";
/** « Demandes »: the workspace's request pipeline. Query `status`, `kind`, `q`, `followup=ready`. */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const off = requestsUnavailable();
    if (off) return off;
    const params = Object.fromEntries(
      [...new URL(request.url).searchParams].filter(([, v]) => v !== ""),
    );
    const parsed = listSchema.safeParse(params);
    if (!parsed.success)
      return Response.json({ error: "Filtres invalides." }, { status: 400 });
    return Response.json(await listRequests(parsed.data));
  });
}
