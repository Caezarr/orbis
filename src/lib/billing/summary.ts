import type { PoolClient } from "pg";
import { entitlementsEnforced } from "./entitlements";
import { loadEntitlement } from "./entitlements-store";
import { entitlementView, type EntitlementView } from "./view";

/** Session-scoped entitlement summary (runs under the request's RLS context). */
export async function entitlementSummary(
  db: Pick<PoolClient, "query">,
  ids: { workspaceId: string; tenantId: string },
): Promise<EntitlementView> {
  const entitlement = await loadEntitlement(db, ids);
  const settings = (
    await db.query<{ continuous_enabled: boolean }>(
      "SELECT continuous_enabled FROM inbox_settings WHERE workspace_id=$1 AND tenant_id=$2",
      [ids.workspaceId, ids.tenantId],
    )
  ).rows?.[0];
  return entitlementView(entitlement, {
    enforced: entitlementsEnforced(),
    continuousEnabled: !!settings?.continuous_enabled,
  });
}
