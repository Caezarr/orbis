import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { workspaceContext } from "@/lib/platform/context";

export type EventName =
  | "task_queued"
  | "task_started"
  | "task_ready"
  | "task_failed"
  | "task_accepted"
  | "task_rejected"
  | "task_cancelled"
  | "company_analyzed"
  | "orbi_answered"
  | "knowledge_source_added"
  | "knowledge_selected"
  | "memory_reviewed"
  | "connection_started"
  | "workflow_installed"
  | "inbox_batch_queued"
  | "inbox_batch_completed"
  | "first_draft_ready"
  | "site_analyzed"
  | "account_created"
  | "mailbox_connected"
  | "preview_shown";
type Properties = {
  task_id?: string;
  workflow_id?: string;
  duration_ms?: number;
  amount_cents?: number;
  attempt?: number;
  baseline_minutes?: number;
  success?: boolean;
  /** preview_shown: true when the model preview was shown, false for quote-only. */
  ai?: boolean;
};
export type EventIdentity = {
  workspaceId: string;
  tenantId: string;
  userId: string;
};
export async function recordEvent(
  db: PoolClient,
  identity: EventIdentity,
  event: EventName,
  properties: Properties = {},
) {
  // No free text, document names, URLs, prompts or provider responses cross this boundary.
  const safe: Properties = {};
  for (const key of [
    "task_id",
    "workflow_id",
    "duration_ms",
    "amount_cents",
    "attempt",
    "baseline_minutes",
    "success",
    "ai",
  ] as const) {
    const value = properties[key];
    if (value !== undefined) Object.assign(safe, { [key]: value });
  }
  await db.query(
    "INSERT INTO product_events(id,workspace_id,tenant_id,actor_id,event,properties) VALUES($1,$2,$3,$4,$5,$6::jsonb)",
    [
      randomUUID(),
      identity.workspaceId,
      identity.tenantId,
      identity.userId,
      event,
      JSON.stringify(safe),
    ],
  );
}
export async function track(event: EventName, properties: Properties = {}) {
  const ctx = workspaceContext();
  if (ctx?.db && !ctx.closed) await recordEvent(ctx.db, ctx, event, properties);
}
/**
 * Records a funnel milestone at most once per workspace. Requests of one user
 * are serialized by the provisioning advisory lock, so check-then-insert holds.
 */
export async function trackOnce(event: EventName, properties: Properties = {}) {
  const ctx = workspaceContext();
  if (!ctx?.db || ctx.closed) return false;
  const { rows } = await ctx.db.query(
    "SELECT 1 FROM product_events WHERE workspace_id=$1 AND tenant_id=$2 AND event=$3 LIMIT 1",
    [ctx.workspaceId, ctx.tenantId, event],
  );
  if (rows.length) return false;
  await recordEvent(ctx.db, ctx, event, properties);
  return true;
}
export function pseudonym(value: string) {
  return createHash("sha256")
    .update(`orbis:analytics:v1:${value}`)
    .digest("hex");
}
export function posthogEvent(row: {
  id: string;
  workspace_id: string;
  actor_id: string;
  event: string;
  properties: Properties;
  occurred_at: Date;
}) {
  return {
    event: row.event,
    timestamp: row.occurred_at.toISOString(),
    properties: {
      ...row.properties,
      distinct_id: pseudonym(`${row.workspace_id}:${row.actor_id}`),
      workspace_id: pseudonym(row.workspace_id),
      $insert_id: row.id,
      $process_person_profile: false,
    },
  };
}
