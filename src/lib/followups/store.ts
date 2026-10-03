import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { DraftLedger, DraftReceipt } from "@/lib/integrations/mailbox";
import { RECONCILE_INTERVAL, workspaceBudgetAllows, type Scoped } from "@/lib/inbox/store";
import type { ModelUsage } from "@/lib/runtime/inbox-replies";
import type { PipelineStatus } from "./detect";
import type { FollowupSettings, FollowupStore, RequestStore, TrackedItem, UsageKind } from "./tracker";

/*
 * PostgreSQL adapters of levels 6/7. Every function runs in a tenant-scoped
 * transaction (worker `scoped()` or `withWorkspaceRequest`) and filters on
 * workspace_id/tenant_id on top of FORCE RLS (migration 011).
 */
export type Ids = { workspaceId: string; tenantId: string };
const p = (ids: Ids) => [ids.workspaceId, ids.tenantId];

export const DEFAULT_SETTINGS = { enabled: true, businessDays: 5, maxStages: 2, replyBaselineMinutes: null as number | null };
export async function loadPipelineSettings(db: Pick<PoolClient, "query">, ids: Ids) {
  const row = (
    await db.query<{
      followups_enabled: boolean;
      followup_business_days: number;
      followup_max_stages: number;
      reply_baseline_minutes: number | null;
    }>(
      "SELECT followups_enabled,followup_business_days,followup_max_stages,reply_baseline_minutes FROM pipeline_settings WHERE workspace_id=$1 AND tenant_id=$2",
      p(ids),
    )
  ).rows?.[0];
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    enabled: row.followups_enabled,
    businessDays: row.followup_business_days,
    maxStages: row.followup_max_stages,
    replyBaselineMinutes: row.reply_baseline_minutes,
  };
}

/** Same monthly cap as tasks, inbox drafts and the brain; reservation in pipeline_usage. */
export async function reservePipelineBudget(db: PoolClient, ids: Ids, kind: UsageKind, refId: string, cents: number) {
  if (!(await workspaceBudgetAllows(db, ids, cents))) return null;
  const id = randomUUID();
  await db.query(
    "INSERT INTO pipeline_usage(id,workspace_id,tenant_id,kind,ref_id,est_cost_cents) VALUES($1,$2,$3,$4,$5,$6)",
    [id, ...p(ids), kind, refId, cents],
  );
  return id;
}
export async function addPipelineUsage(db: PoolClient, ids: Ids, usageId: string, usage: ModelUsage) {
  await db.query(
    "UPDATE pipeline_usage SET input_tokens=input_tokens+$4, output_tokens=output_tokens+$5 WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
    [usageId, ...p(ids), usage.inputTokens, usage.outputTokens],
  );
}

/** Retention: contact data nulled 24 months after the last activity; follow-up previews after 30 days. */
export async function purgePipeline(db: PoolClient, ids: Ids) {
  await db.query(
    "UPDATE pipeline_items SET contact_name=NULL, contact_email=NULL, need_summary=NULL, budget_text=NULL, deadline_text=NULL, contact_erased_at=now(), updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2 AND purge_after<now() AND contact_erased_at IS NULL",
    p(ids),
  );
  await db.query(
    "UPDATE followups SET draft_preview=NULL, questions='[]'::jsonb, updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2 AND purge_after<now() AND draft_preview IS NOT NULL",
    p(ids),
  );
}

export function postgresRequestStore(run: Scoped, ids: Ids & { provider: "gmail" | "outlook"; connectedAccountId: string }): RequestStore {
  return {
    upsertItem: (input) =>
      run(async (db) => {
        const id = randomUUID();
        const inserted = await db.query<{ id: string }>(
          `INSERT INTO pipeline_items(id,workspace_id,tenant_id,provider,connected_account_id,thread_id,first_message_row_id,kind,contact_name,contact_email,contact_domain,first_customer_at,last_customer_at,next_check_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,now()+interval '6 hours')
           ON CONFLICT(workspace_id,connected_account_id,thread_id) DO NOTHING RETURNING id`,
          [
            id,
            ...p(ids),
            ids.provider,
            ids.connectedAccountId,
            input.threadId,
            input.rowId,
            input.kind,
            input.contact.name,
            input.contact.email,
            input.contact.domain,
            input.receivedAt,
          ],
        );
        if (inserted.rowCount) return id;
        // Existing thread: a later customer message. A quote request upgrades the kind.
        await db.query(
          `UPDATE pipeline_items SET last_customer_at=GREATEST(last_customer_at,$5::timestamptz), awaiting_customer=false,
             kind=CASE WHEN $6='quote_request' THEN 'quote_request' ELSE kind END,
             next_check_at=CASE WHEN status IN ('gagne','perdu') THEN next_check_at ELSE LEAST(COALESCE(next_check_at, now()+interval '6 hours'), now()+interval '6 hours') END,
             purge_after=GREATEST(purge_after, now()+interval '24 months'), updated_at=now()
           WHERE workspace_id=$1 AND tenant_id=$2 AND connected_account_id=$3 AND thread_id=$4`,
          [...p(ids), ids.connectedAccountId, input.threadId, input.receivedAt, input.kind],
        );
        return null;
      }),
    saveExtraction: (itemId, value) =>
      run(async (db) => {
        await db.query(
          "UPDATE pipeline_items SET need_summary=$4, budget_text=$5, deadline_text=$6, extraction_state=$7, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND contact_erased_at IS NULL",
          [itemId, ...p(ids), value.need?.slice(0, 160) ?? null, value.budget?.slice(0, 80) ?? null, value.deadline?.slice(0, 80) ?? null, value.state],
        );
      }),
    reserve: (kind, refId, cents) => run((db) => reservePipelineBudget(db, ids, kind, refId, cents)),
    addUsage: (usageId, usage) => run((db) => addPipelineUsage(db, ids, usageId, usage)),
  };
}

type ItemRow = {
  id: string;
  thread_id: string;
  kind: TrackedItem["kind"];
  contact_email: string | null;
  status: PipelineStatus;
  first_customer_at: Date | null;
  first_replied_at: Date | null;
  relance_at: Date | null;
  created_at: Date;
  snoozed_until: Date | null;
  followups_dismissed: boolean;
  followups: { stage: number; status: string; drafted_at: string | null; owner_message_at: string; draft_state: string }[] | null;
};
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function postgresFollowupStore(
  run: Scoped,
  ids: Ids & { connectedAccountId: string },
  lease: { heartbeat: () => Promise<boolean> },
): FollowupStore {
  const ledger = (followupId: string): DraftLedger => ({
    claim: (key, payloadHash) =>
      run(async (db) => {
        const claimed = await db.query(
          `UPDATE followups SET draft_idempotency_key=$4, draft_state='claimed', draft_payload_hash=$5, draft_claimed_at=now(), draft_attempts=draft_attempts+1, updated_at=now()
           WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state='none' RETURNING id`,
          [followupId, ...p(ids), key, payloadHash],
        );
        if (claimed.rowCount) return { state: "claimed" as const };
        const row = (
          await db.query<{
            draft_state: string;
            draft_id: string | null;
            draft_payload_hash: string | null;
            draft_policy_hash: string | null;
            draft_reconciled: boolean;
            draft_claimed_at: Date | null;
            draft_attempts: number;
            thread_id: string;
          }>(
            `SELECT f.draft_state,f.draft_id,f.draft_payload_hash,f.draft_policy_hash,f.draft_reconciled,f.draft_claimed_at,f.draft_attempts,i.thread_id
             FROM followups f JOIN pipeline_items i ON i.id=f.pipeline_item_id AND i.workspace_id=f.workspace_id AND i.tenant_id=f.tenant_id
             WHERE f.draft_idempotency_key=$1 AND f.workspace_id=$2 AND f.tenant_id=$3`,
            [key, ...p(ids)],
          )
        ).rows[0];
        if (!row) throw new Error("Follow-up ledger row unavailable");
        if ((row.draft_state === "created" || row.draft_state === "simulated") && row.draft_id)
          return {
            state: "done" as const,
            receipt: {
              draftId: row.draft_id,
              threadId: row.thread_id,
              payloadHash: row.draft_payload_hash ?? "",
              policyHash: row.draft_policy_hash ?? "",
              simulated: row.draft_state === "simulated",
              reconciled: row.draft_reconciled,
            } satisfies DraftReceipt,
          };
        return { state: "uncertain" as const, claimedAt: row.draft_claimed_at ?? new Date(0), attempts: row.draft_attempts };
      }),
    retry: (key) =>
      run(async (db) => {
        const r = await db.query(
          `UPDATE followups SET draft_state='claimed', draft_claimed_at=now(), draft_attempts=draft_attempts+1, updated_at=now()
           WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state IN ('claimed','uncertain') AND draft_attempts<3
           AND draft_claimed_at < now() - interval '${RECONCILE_INTERVAL}' RETURNING id`,
          [key, ...p(ids)],
        );
        return r.rowCount === 1;
      }),
    record: (key, receipt) =>
      run(async (db) => {
        await db.query(
          `UPDATE followups SET draft_state=$4, draft_id=$5, draft_policy_hash=$6, draft_reconciled=$7, drafted_at=now(), updated_at=now()
           WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3`,
          [key, ...p(ids), receipt.simulated ? "simulated" : "created", receipt.draftId, receipt.policyHash, receipt.reconciled],
        );
      }),
    markUncertain: (key) =>
      run(async (db) => {
        await db.query(
          "UPDATE followups SET draft_state='uncertain', updated_at=now() WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state='claimed'",
          [key, ...p(ids)],
        );
      }),
  });
  return {
    settings: () => run((db) => loadPipelineSettings(db, ids)) as Promise<FollowupSettings>,
    dueItems: (limit) =>
      run(async (db) => {
        await purgePipeline(db, ids);
        const rows = (
          await db.query<ItemRow>(
            `SELECT i.id,i.thread_id,i.kind,i.contact_email,i.status,i.first_customer_at,i.first_replied_at,i.relance_at,i.created_at,i.snoozed_until,i.followups_dismissed,
               (SELECT jsonb_agg(jsonb_build_object('stage',f.stage,'status',f.status,'drafted_at',f.drafted_at,'owner_message_at',f.owner_message_at,'draft_state',f.draft_state) ORDER BY f.stage)
                FROM followups f WHERE f.pipeline_item_id=i.id AND f.workspace_id=i.workspace_id AND f.tenant_id=i.tenant_id) AS followups
             FROM pipeline_items i
             WHERE i.workspace_id=$1 AND i.tenant_id=$2 AND i.connected_account_id=$3 AND i.next_check_at IS NOT NULL AND i.next_check_at<=now()
               AND i.contact_erased_at IS NULL
             ORDER BY i.next_check_at LIMIT $4`,
            [...p(ids), ids.connectedAccountId, limit],
          )
        ).rows;
        return rows.map(
          (r): TrackedItem => ({
            id: r.id,
            threadId: r.thread_id,
            kind: r.kind,
            contactEmail: r.contact_email,
            status: r.status,
            firstCustomerAt: iso(r.first_customer_at),
            firstRepliedAt: iso(r.first_replied_at),
            relanceAt: iso(r.relance_at),
            createdAt: iso(r.created_at)!,
            snoozedUntil: iso(r.snoozed_until),
            followupsDismissed: r.followups_dismissed,
            followups: (r.followups ?? []).map((f) => ({
              stage: f.stage,
              status: f.status,
              draftedAt: iso(f.drafted_at),
              ownerMessageAt: iso(f.owner_message_at)!,
              draftState: f.draft_state,
            })),
          }),
        );
      }),
    saveObservation: (itemId, obs) =>
      run(async (db) => {
        await db.query(
          `UPDATE pipeline_items SET status=CASE WHEN status IN ('gagne','perdu') THEN status ELSE $4 END,
             first_replied_at=COALESCE(first_replied_at,$5::timestamptz), last_owner_at=COALESCE($6::timestamptz,last_owner_at),
             last_customer_at=GREATEST(last_customer_at,$7::timestamptz), relance_at=COALESCE(relance_at,$8::timestamptz),
             awaiting_customer=$9, next_check_at=$10::timestamptz, checks=checks+1, updated_at=now(),
             purge_after=GREATEST(purge_after, COALESCE($6::timestamptz,now()) + interval '24 months')
           WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3`,
          [itemId, ...p(ids), obs.status, obs.firstRepliedAt, obs.lastOwnerAt, obs.lastCustomerAt, obs.relanceAt, obs.awaitingCustomer, obs.nextCheckAt],
        );
      }),
    beginFollowup: (itemId, input) =>
      run(async (db) => {
        const id = randomUUID();
        // New stage, or reclaim a stage row that produced no draft (failed /
        // not needed for an older owner message). Never touches a drafted row.
        const r = await db.query<{ id: string }>(
          `INSERT INTO followups(id,workspace_id,tenant_id,pipeline_item_id,stage,status,owner_message_at,due_at)
           VALUES($1,$2,$3,$4,$5,'drafting',$6,$7)
           ON CONFLICT(pipeline_item_id,stage) DO UPDATE SET status='drafting', owner_message_at=EXCLUDED.owner_message_at, due_at=EXCLUDED.due_at, reason=NULL, updated_at=now()
           WHERE followups.workspace_id=$2 AND followups.tenant_id=$3 AND followups.draft_state='none' AND followups.drafted_at IS NULL
             AND (followups.status='failed' OR (followups.status='not_needed' AND followups.owner_message_at<EXCLUDED.owner_message_at))
           RETURNING id`,
          [id, ...p(ids), itemId, input.stage, input.ownerMessageAt, input.dueAt],
        );
        return r.rows[0]?.id ?? null;
      }),
    finishFollowup: (followupId, update) =>
      run(async (db) => {
        await db.query(
          `UPDATE followups SET status=$4, reason=COALESCE($5,reason), draft_preview=COALESCE($6,draft_preview), questions=COALESCE($7::jsonb,questions),
             flags=COALESCE($8::jsonb,flags), updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3`,
          [
            followupId,
            ...p(ids),
            update.status,
            update.reason?.slice(0, 40) ?? null,
            update.draftPreview?.slice(0, 1200) ?? null,
            update.questions ? JSON.stringify(update.questions) : null,
            update.flags ? JSON.stringify(update.flags) : null,
          ],
        );
      }),
    reserve: (kind, refId, cents) => run((db) => reservePipelineBudget(db, ids, kind, refId, cents)),
    addUsage: (usageId, usage) => run((db) => addPipelineUsage(db, ids, usageId, usage)),
    ledger,
    heartbeat: lease.heartbeat,
  };
}
