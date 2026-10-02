import { withWorkspaceRequest } from "@/lib/platform/request";
import { requestExtraction } from "@/lib/brain/service";
import { brainUnavailable } from "../gate";

export const runtime = "nodejs";
/** Manual re-run: read recent SENT mail again (read-only) and propose new candidate facts. Owner/admin. */
export async function POST(request: Request) {
  return withWorkspaceRequest(
    request,
    async () =>
      brainUnavailable() ??
      Response.json(
        await requestExtraction(request.headers.get("Idempotency-Key") ?? ""),
        { status: 202 },
      ),
    { requireRole: ["owner", "admin"] },
  );
}
