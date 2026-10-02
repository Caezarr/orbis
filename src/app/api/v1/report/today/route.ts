import { withWorkspaceRequest } from "@/lib/platform/request";
import { todaySummary } from "@/lib/followups/service";
import { requestsUnavailable } from "../../requests/gate";

export const runtime = "nodejs";
/** Today card: this week's measured counts and follow-ups waiting for review. */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const off = requestsUnavailable();
    if (off) return off;
    return Response.json(await todaySummary());
  });
}
