import { entitlementSummary } from "@/lib/billing/summary";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import { workspaceContext } from "@/lib/platform/context";
import { withWorkspaceRequest } from "@/lib/platform/request";

export const runtime = "nodejs";

/** Plan status, drafts used/included and trial time left for the session workspace (any member). */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const context = workspaceContext();
    // Quotas are about inbox drafts: no banner on deployments where they are off.
    if (!context?.db || !inboxDraftsEnabled()) return Response.json({ entitlement: null });
    return Response.json({
      entitlement: await entitlementSummary(context.db, {
        workspaceId: context.workspaceId,
        tenantId: context.tenantId,
      }),
    });
  });
}
