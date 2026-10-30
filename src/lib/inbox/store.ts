import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { DraftLedger, DraftReceipt } from "@/lib/integrations/mailbox";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import type { Classification } from "@/lib/runtime/inbox-replies";
import { recordQuestionsWithGrouping, type QuestionGrouper } from "@/lib/brain/grouping";
import type { InboxBatch, InboxStore, MessageStatus } from "./pipeline";

/** Runs fn in a short tenant-scoped transaction (worker `scoped`). */
export type Scoped = <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>;
export const RECONCILE_INTERVAL = "10 minutes";

function positiveCents(name: string) {
  const cap = Number(process.env[name]);
  return Number.isSafeInteger(cap) && cap > 0 ? cap : null;
}
/** Hard ceiling per workspace and month (also the activation switch). */
export function monthlyCapCents() {
  return positiveCents("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS");
}
/**
 * Effective monthly cap of one workspace: its stored cap (operator/plan set),
 * else ORBIS_WORKSPACE_MONTHLY_CAP_CENTS, else the global cap — never above the
 * global ORBIS_OPERATIONS_MONTHLY_CAP_CENTS ceiling. null = not configured.
 */
export function effectiveMonthlyCap(stored: number | null | undefined) {
  const ceiling = monthlyCapCents();
  if (!ceiling) return null;
  const chosen =
    stored !== null &&
    stored !== undefined &&
    Number.isSafeInteger(stored) &&
    stored >= 0
      ? stored
      : (positiveCents("ORBIS_WORKSPACE_MONTHLY_CAP_CENTS") ?? ceiling);
  return Math.min(chosen, ceiling);
}
/**
 * Same monthly budget as durable tasks: reserved task quotes + estimated inbox
 * company-brain and follow-up/pipeline model cost this month, against the workspace's effective
 * cap. Takes the per-tenant budget lock (held until the caller's transaction
 * ends) so concurrent workers cannot both pass the check; the caller records
 * its reservation in the same transaction.
 */
export async function workspaceBudgetAllows(
  db: PoolClient,
  ids: { workspaceId: string; tenantId: string },
  cents: number,
) {
  if (!monthlyCapCents()) return false;
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `orbis-budget:${ids.tenantId}`,
  ]);
  const stored = (
    await db.query<{ monthly_cap_cents: number | null }>(
      "SELECT monthly_cap_cents FROM inbox_settings WHERE workspace_id=$1 AND tenant_id=$2",
      [ids.workspaceId, ids.tenantId],
    )
  ).rows?.[0]?.monthly_cap_cents;
  const cap = effectiveMonthlyCap(stored);
  if (cap === null) return false;
  const spend = await db.query<{ reserved: string }>(
    `SELECT (
      (SELECT COALESCE(sum(total_cents),0) FROM operational_tasks WHERE workspace_id=$1 AND tenant_id=$2 AND (status IN ('queued','running','needs_review') OR (status='completed' AND completed_at>=date_trunc('month',now()))))
      + (SELECT COALESCE(sum(est_cost_cents),0) FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 AND created_at>=date_trunc('month',now()))
      + (SELECT COALESCE(sum(est_cost_cents),0) FROM brain_usage WHERE workspace_id=$1 AND tenant_id=$2 AND created_at>=date_trunc('month',now()))
      + (SELECT COALESCE(sum(est_cost_cents),0) FROM pipeline_usage WHERE workspace_id=$1 AND tenant_id=$2 AND created_at>=date_trunc('month',now()))
    )::text AS reserved`,
    [ids.workspaceId, ids.tenantId],
  );
  return Number(spend.rows[0]?.reserved ?? 0) + cents <= cap;
}
export async function reserveInboxBudget(
  db: PoolClient,
  ids: { workspaceId: string; tenantId: string },
  rowId: string,
  cents: number,
) {
  if (!(await workspaceBudgetAllows(db, ids, cents))) return false;
  const updated = await db.query(
    "UPDATE inbox_messages SET est_cost_cents=est_cost_cents+$4, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
    [rowId, ids.workspaceId, ids.tenantId, cents],
  );
  return updated.rowCount === 1;
}

export function postgresInboxStore(
  scoped: Scoped,
  batch: InboxBatch,
  lease: { token: string },
  /** Model grouping of « Questions d'Orbi » (opt-in, ORBIS_BRAIN_QUESTION_GROUPING). */
  options: { questionGrouper?: QuestionGrouper } = {},
): InboxStore {
  const ids = [batch.workspaceId, batch.tenantId];
  const ledger = (rowId: string): DraftLedger => ({
    async claim(key, payloadHash) {
      return scoped(async (db) => {
        const claimed = await db.query(
          `UPDATE inbox_messages SET draft_idempotency_key=$4, draft_state='claimed', draft_payload_hash=$5,
           draft_claimed_at=now(), draft_attempts=draft_attempts+1, updated_at=now()
           WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state='none' RETURNING id`,
          [rowId, ...ids, key, payloadHash],
        );
        if (claimed.rowCount) return { state: "claimed" as const };
        const row = (
          await db.query<{
            draft_state: string;
            draft_id: string | null;
            thread_id: string;
            draft_payload_hash: string | null;
            draft_policy_hash: string | null;
            draft_reconciled: boolean;
            draft_claimed_at: Date | null;
            draft_attempts: number;
          }>(
            "SELECT draft_state,draft_id,thread_id,draft_payload_hash,draft_policy_hash,draft_reconciled,draft_claimed_at,draft_attempts FROM inbox_messages WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3",
            [key, ...ids],
          )
        ).rows[0];
        if (!row) throw new Error("Draft ledger row unavailable");
        if (
          (row.draft_state === "created" || row.draft_state === "simulated") &&
          row.draft_id
        )
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
        return {
          state: "uncertain" as const,
          claimedAt: row.draft_claimed_at ?? new Date(0),
          attempts: row.draft_attempts,
        };
      });
    },
    async retry(key) {
      return scoped(async (db) => {
        const result = await db.query(
          `UPDATE inbox_messages SET draft_state='claimed', draft_claimed_at=now(), draft_attempts=draft_attempts+1, updated_at=now()
           WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state IN ('claimed','uncertain')
           AND draft_attempts<3 AND draft_claimed_at < now() - interval '${RECONCILE_INTERVAL}' RETURNING id`,
          [key, ...ids],
        );
        return result.rowCount === 1;
      });
    },
    async record(key, receipt) {
      await scoped((db) =>
        db.query(
          `UPDATE inbox_messages SET draft_state=$4, draft_id=$5, draft_policy_hash=$6, draft_reconciled=$7,
           drafted_at=now(), updated_at=now() WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3`,
          [
            key,
            ...ids,
            receipt.simulated ? "simulated" : "created",
            receipt.draftId,
            receipt.policyHash,
            receipt.reconciled,
          ],
        ),
      );
    },
    async markUncertain(key) {
      await scoped((db) =>
        db.query(
          "UPDATE inbox_messages SET draft_state='uncertain', updated_at=now() WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state='claimed'",
          [key, ...ids],
        ),
      );
    },
  });
  return {
    async upsertMessage(message: MailMessage, contentHash: string) {
      return scoped(async (db) => {
        const values = [
          randomUUID(),
          ...ids,
          batch.id,
          batch.provider,
          batch.connectedAccountId,
          message.id,
          message.threadId,
          batch.missionVersion,
          contentHash,
          message.receivedAt || null,
          message.subject.slice(0, 120),
        ];
        await db.query(
          `INSERT INTO inbox_messages(id,workspace_id,tenant_id,batch_id,provider,connected_account_id,message_id,thread_id,mission_version,content_hash,received_at,subject_preview,status)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'seen')
           ON CONFLICT(workspace_id,connected_account_id,message_id,mission_version) DO NOTHING`,
          values,
        );
        const row = (
          await db.query<{
            id: string;
            status: MessageStatus;
            classification: Classification | null;
          }>(
            "SELECT id,status,classification FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 AND connected_account_id=$3 AND message_id=$4 AND mission_version=$5",
            [
              ...ids,
              batch.connectedAccountId,
              message.id,
              batch.missionVersion,
            ],
          )
        ).rows[0];
        if (!row) throw new Error("Inbox message row unavailable");
        return {
          rowId: row.id,
          status: row.status,
          classification: row.classification,
        };
      });
    },
    async update(rowId, update) {
      await scoped((db) =>
        db.query(
          `UPDATE inbox_messages SET
            status=COALESCE($4,status), classification=COALESCE($5,classification), skip_reason=COALESCE($6,skip_reason),
            flags=COALESCE($7::jsonb,flags), draft_preview=COALESCE($8,draft_preview), questions=COALESCE($9::jsonb,questions),
            citations=COALESCE($10::jsonb,citations), batch_id=$11,
            proposed_slots=COALESCE($12::jsonb,proposed_slots), updated_at=now()
           WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3`,
          [
            rowId,
            ...ids,
            update.status ?? null,
            update.classification ?? null,
            update.skipReason ?? null,
            update.flags ? JSON.stringify(update.flags) : null,
            update.draftPreview?.slice(0, 1200) ?? null,
            update.questions ? JSON.stringify(update.questions) : null,
            update.citations ? JSON.stringify(update.citations) : null,
            batch.id,
            update.proposedSlots
              ? JSON.stringify(update.proposedSlots.slice(0, 3))
              : null,
          ],
        ),
      );
    },
    async reserveBudget(rowId, cents) {
      return scoped((db) =>
        reserveInboxBudget(
          db,
          { workspaceId: batch.workspaceId, tenantId: batch.tenantId },
          rowId,
          cents,
        ),
      );
    },
    async addUsage(rowId, usage) {
      await scoped((db) =>
        db.query(
          "UPDATE inbox_messages SET input_tokens=input_tokens+$4, output_tokens=output_tokens+$5, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
          [rowId, ...ids, usage.inputTokens, usage.outputTokens],
        ),
      );
    },
    ledger,
    async recordQuestions(rowId, questions) {
      return recordQuestionsWithGrouping(
        scoped,
        { workspaceId: batch.workspaceId, tenantId: batch.tenantId },
        rowId,
        questions,
        options.questionGrouper,
      );
    },
    async heartbeat() {
      return scoped(async (db) => {
        const result = await db.query(
          "UPDATE inbox_batches SET lease_until=now()+interval '5 minutes' WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND lease_token=$4 AND status='running'",
          [batch.id, ...ids, lease.token],
        );
        return result.rowCount === 1;
      });
    },
  };
}
