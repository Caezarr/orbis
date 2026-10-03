import { withWorkspaceRequest } from "@/lib/platform/request";
import { isOfflineMode } from "@/lib/platform/context";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import { cleanupWorkspaceLabels } from "@/lib/inbox/features";
import { inboxMode } from "@/lib/inbox/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * « Retirer les libellés Orbi »: turns labels off and removes, in bounded
 * steps, the labels Orbis applied (ledger only). Call again while
 * `remaining` > 0. Owner/admin. No body.
 */
export async function POST(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      if (!inboxDraftsEnabled() || isOfflineMode())
        return Response.json(
          { error: "Inbox drafts are not enabled for this deployment." },
          { status: 503 },
        );
      return Response.json(await cleanupWorkspaceLabels(inboxMode()));
    },
    { requireRole: ["owner", "admin"] },
  );
}
