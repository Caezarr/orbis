import { withWorkspaceRequest } from "@/lib/platform/request";
import { weeklyReport } from "@/lib/followups/service";
import { requestsUnavailable } from "../requests/gate";

export const runtime = "nodejs";
/** Measured weekly report (`?week=YYYY-MM-DD`, a Monday; default: current Paris week). JSON = digest data. */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const off = requestsUnavailable();
    if (off) return off;
    const week = new URL(request.url).searchParams.get("week") ?? undefined;
    return Response.json(await weeklyReport(week || undefined));
  });
}
