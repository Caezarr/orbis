import { withWorkspaceRequest } from "@/lib/platform/request";
import { exportRequestsCsv } from "@/lib/followups/service";
import { requestsUnavailable } from "../gate";

export const runtime = "nodejs";
/** CSV export of the workspace's own request list (owner/admin). */
export async function GET(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      const off = requestsUnavailable();
      if (off) return off;
      return new Response(await exportRequestsCsv(), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="orbis-demandes-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    },
    { requireRole: ["owner", "admin"] },
  );
}
