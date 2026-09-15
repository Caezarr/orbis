import { transaction, setTenantContext } from "@/lib/platform/db";
import { posthogEvent, type EventIdentity } from "./events";

/** Durable batch delivery. A failed/uncertain delivery retains the same insert IDs. */
export async function exportPosthog(identity: EventIdentity) {
  if (process.env.POSTHOG_ENABLED !== "true")
    return { exported: 0, enabled: false };
  const host = process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com";
  if (
    !["https://eu.i.posthog.com", "https://us.i.posthog.com"].includes(host) ||
    !process.env.POSTHOG_PROJECT_KEY
  )
    throw new Error(
      "Configure PostHog project key and EU or US ingestion host",
    );
  return transaction(async (db) => {
    await setTenantContext(db, identity);
    const member = await db.query(
      "SELECT 1 FROM memberships WHERE workspace_id=$1 AND tenant_id=$2 AND user_id=$3 AND role IN ('owner','admin')",
      [identity.workspaceId, identity.tenantId, identity.userId],
    );
    if (!member.rowCount) throw new Error("Workspace administrator required");
    const { rows } = await db.query(
      "SELECT * FROM product_events WHERE workspace_id=$1 AND tenant_id=$2 AND exported_at IS NULL ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT 100",
      [identity.workspaceId, identity.tenantId],
    );
    if (!rows.length) return { exported: 0, enabled: true };
    const response = await fetch(`${host}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.POSTHOG_PROJECT_KEY,
        batch: rows.map(posthogEvent),
      }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        `PostHog ingestion rejected (${response.status}); batch retained`,
      );
    await db.query(
      "UPDATE product_events SET exported_at=now() WHERE id=ANY($1::uuid[]) AND workspace_id=$2 AND tenant_id=$3",
      [rows.map((r) => r.id), identity.workspaceId, identity.tenantId],
    );
    return { exported: rows.length, enabled: true };
  });
}
