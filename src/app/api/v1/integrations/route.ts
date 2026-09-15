import { withWorkspaceRequest } from "@/lib/platform/request";
import {
  integrationReadiness,
  connectionStatus,
  integrationUser,
} from "@/lib/integrations/composio";
import { fail, ok } from "@/lib/api/http";
import { isLocalMutation } from "@/lib/api/local-request";
import { getStore } from "@/lib/store/store";
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    return ok({ items: integrationReadiness() });
  });
}

// Read-only remote verification uses the same workspace access guard as OAuth.
// Partial upstream failure must not erase a healthy connection or claim readiness.
export async function POST(request: Request) {
  return withWorkspaceRequest(request, async () => {
    if (!isLocalMutation(request))
      return fail(
        "Authenticated workspace access is required. This installation is local-only.",
        403,
      );
    const { workspace } = getStore();
    const userId = integrationUser(workspace.tenantId, workspace.id);
    const catalogue = integrationReadiness();
    const items = new Array(catalogue.length);
    let next = 0;
    // Bound parallel requests when many tools are configured.
    await Promise.all(
      Array.from({ length: Math.min(6, catalogue.length) }, async () => {
        while (next < catalogue.length) {
          const index = next++;
          const item = catalogue[index];
          items[index] = await (async () => {
            if (!item.configured) return { ...item, status: "not_configured" };
            try {
              return {
                ...item,
                ...(await connectionStatus(userId, item.slug)),
              };
            } catch {
              return { ...item, status: "error" };
            }
          })();
        }
      }),
    );
    return ok({ items, checkedAt: new Date().toISOString() });
  });
}
