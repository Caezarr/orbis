import type { PoolClient } from "pg";
import {
  applyUsage,
  entitlementsEnforced,
  planWindow,
  type Entitlement,
  type SubscriptionFacts,
  type TrialFacts,
} from "./entitlements";
import { normalizePlanKey, planCatalog, PLAN_CONFIG_VERSION } from "./plans";

/**
 * PostgreSQL adapter of the entitlement service. Every function runs inside a
 * transaction that already carries the workspace's own app.* RLS context
 * (request `withWorkspaceRequest` or worker `scoped`). Workspace = tenant
 * (workspaces.tenant_id is UNIQUE, migration 001).
 */
type Ids = { workspaceId: string; tenantId: string };
type Db = Pick<PoolClient, "query">;

export async function loadSubscription(db: Db, ids: Ids): Promise<SubscriptionFacts | null> {
  const row = (
    await db.query<{
      plan: string;
      status: string;
      current_period_start: Date | null;
      current_period_end: Date | null;
      cancel_at_period_end: boolean;
    }>(
      "SELECT plan,status,current_period_start,current_period_end,cancel_at_period_end FROM stripe_subscriptions WHERE tenant_id=$1",
      [ids.tenantId],
    )
  ).rows?.[0];
  const plan = normalizePlanKey(row?.plan);
  if (!row || !plan) return null;
  return {
    plan,
    status: row.status,
    periodStart: row.current_period_start,
    periodEnd: row.current_period_end,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
  };
}

export async function loadTrial(db: Db, ids: Ids): Promise<TrialFacts | null> {
  const row = (
    await db.query<{ started_at: Date; ends_at: Date; draft_limit: number }>(
      "SELECT started_at,ends_at,draft_limit FROM billing_trials WHERE workspace_id=$1 AND tenant_id=$2",
      [ids.workspaceId, ids.tenantId],
    )
  ).rows?.[0];
  return row ? { startedAt: row.started_at, endsAt: row.ends_at, draftLimit: Number(row.draft_limit) } : null;
}

/** Reply drafts created (real or simulated in test mode) in [start, end). */
export async function countDrafts(db: Db, ids: Ids, start: Date | null, end: Date | null) {
  if (!start) return 0;
  const row = (
    await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 AND draft_state IN ('created','simulated') AND drafted_at>=$3 AND ($4::timestamptz IS NULL OR drafted_at<$4)",
      [ids.workspaceId, ids.tenantId, start, end],
    )
  ).rows?.[0];
  return Number(row?.n ?? 0);
}

export async function loadEntitlement(db: Db, ids: Ids, now = new Date()): Promise<Entitlement> {
  const [subscription, trial] = [await loadSubscription(db, ids), await loadTrial(db, ids)];
  const window = planWindow({ subscription, trial, now });
  const used = await countDrafts(db, ids, window.periodStart, window.periodEnd);
  return applyUsage(window, used, now);
}

/** Open entitlement used when enforcement is explicitly disabled (internal pilot). */
export function unenforcedEntitlement(): Entitlement {
  return {
    state: "active",
    plan: "equipe",
    periodStart: null,
    periodEnd: null,
    includedDrafts: Number.MAX_SAFE_INTEGER,
    monthlyCapCents: 0,
    mailboxes: 50,
    cancelAtPeriodEnd: false,
    draftsUsed: 0,
    draftsRemaining: Number.MAX_SAFE_INTEGER,
    canProcess: true,
  };
}
export async function currentEntitlement(db: Db, ids: Ids, now = new Date()) {
  return entitlementsEnforced() ? loadEntitlement(db, ids, now) : unenforcedEntitlement();
}

/**
 * Trial starts at the workspace's first mailbox batch (first use of a connected
 * mailbox), not at sign-up: a company that never connects a mailbox does not
 * burn its trial. Insert-only (runtime role has no UPDATE/DELETE on
 * billing_trials): a trial can never be restarted or extended by the app.
 * The trial cost cap is applied through the privileged sync function.
 */
export async function ensureTrialStarted(db: Db, ids: Ids, now = new Date()) {
  const trial = planCatalog().trial;
  const inserted = await db.query(
    `INSERT INTO billing_trials(workspace_id,tenant_id,started_at,ends_at,draft_limit,config_version)
     VALUES($1,$2,$3,$3::timestamptz + make_interval(days => $4),$5,$6) ON CONFLICT(workspace_id) DO NOTHING`,
    [ids.workspaceId, ids.tenantId, now, trial.trialDays ?? 14, trial.includedDrafts, PLAN_CONFIG_VERSION],
  );
  if (inserted.rowCount && !(await loadSubscription(db, ids)))
    await syncPlanCap(db, ids.tenantId, "trial", trial.monthlyCapCents);
  return !!inserted.rowCount;
}

/**
 * Sets the workspace monthly cap through `orbis_sync_workspace_plan_cap`
 * (migration 010): SECURITY DEFINER, owned by the NOLOGIN cap-admin role, clamps
 * to a per-plan ceiling the runtime role cannot change. Returns the applied cap.
 */
export async function syncPlanCap(db: Db, tenantId: string, plan: "trial" | "solo" | "equipe" | "none", cents: number) {
  const row = (
    await db.query<{ cap: number | null }>("SELECT orbis_sync_workspace_plan_cap($1,$2,$3) AS cap", [tenantId, plan, cents])
  ).rows?.[0];
  return row?.cap ?? null;
}

/** Distinct mailboxes used by this workspace in the last 31 days (plan mailbox limit). */
export async function mailboxesInUse(db: Db, ids: Ids) {
  return (
    await db.query<{ connected_account_id: string }>(
      "SELECT DISTINCT connected_account_id FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 AND created_at>now()-interval '31 days'",
      [ids.workspaceId, ids.tenantId],
    )
  ).rows.map((r) => r.connected_account_id);
}
