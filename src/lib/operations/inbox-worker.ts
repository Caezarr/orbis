import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { recordEvent } from "@/lib/analytics/events";
import type { StoreState } from "@/lib/domain/types";
import { replyContext } from "@/lib/inbox/context";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import {
  processMailboxBatch,
  type BatchStats,
  type InboxBatch,
} from "@/lib/inbox/pipeline";
import { monthlyCapCents, postgresInboxStore } from "@/lib/inbox/store";
import {
  mailboxClient,
  MailboxPolicyError,
  type MailboxMode,
} from "@/lib/integrations/mailbox";
import {
  providerInboxModel,
  type InboxModel,
} from "@/lib/runtime/inbox-replies";
import { providerStatus } from "@/lib/runtime/provider";
import { scoped, type Identity } from "./worker";

export { inboxDraftsEnabled };
function estimatedCents(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
type BatchRow = {
  id: string;
  workspace_id: string;
  tenant_id: string;
  kind: "first_run" | "incremental";
  provider: "gmail" | "outlook";
  connected_account_id: string;
  mission_version: string;
  mode: MailboxMode;
  window_days: number;
  max_messages: number;
  max_drafts: number;
  attempts: number;
  lease_token: string;
};
export type InboxWorkerDeps = {
  model?: InboxModel;
  mailbox?: (
    ...args: Parameters<typeof mailboxClient>
  ) => Parameters<typeof processMailboxBatch>[0]["mailbox"];
};

/**
 * Inbox job type of the operations worker: one mailbox batch per invocation,
 * leased (5 min, renewed per message), at most 3 attempts. Model and mailbox
 * calls happen outside database transactions.
 */
export async function runOneInboxBatch(
  identity: Identity,
  deps: InboxWorkerDeps = {},
) {
  if (!inboxDraftsEnabled()) return { processed: false, reason: "disabled" };
  if (!providerStatus().configured)
    throw new Error("AI provider not configured");
  if (!monthlyCapCents())
    throw new Error("Configure ORBIS_OPERATIONS_MONTHLY_CAP_CENTS first");
  const run = <T>(fn: (db: PoolClient) => Promise<T>) =>
    scoped<T>(identity, fn);
  const claimed = await run(async (db) => {
    await db.query(
      "UPDATE inbox_batches SET status='failed',error='Worker lease expired after three attempts.',lease_token=NULL,lease_until=NULL WHERE workspace_id=$1 AND tenant_id=$2 AND status='running' AND lease_until<now() AND attempts>=3",
      [identity.workspaceId, identity.tenantId],
    );
    // Retention: inbound subjects and draft previews are short-lived.
    await db.query(
      "UPDATE inbox_messages SET subject_preview=NULL,draft_preview=NULL,updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2 AND purge_after<now() AND (subject_preview IS NOT NULL OR draft_preview IS NOT NULL)",
      [identity.workspaceId, identity.tenantId],
    );
    const row = (
      await db.query<BatchRow>(
        "SELECT * FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 AND available_at<=now() AND attempts<3 AND (status='queued' OR (status='running' AND lease_until<now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        [identity.workspaceId, identity.tenantId],
      )
    ).rows[0];
    if (!row) return null;
    return (
      await db.query<BatchRow>(
        "UPDATE inbox_batches SET status='running',started_at=COALESCE(started_at,now()),attempts=attempts+1,lease_token=$2,lease_until=now()+interval '5 minutes' WHERE id=$1 RETURNING *",
        [row.id, randomUUID()],
      )
    ).rows[0];
  });
  if (!claimed) return { processed: false };
  const batch: InboxBatch = {
    id: claimed.id,
    tenantId: claimed.tenant_id,
    workspaceId: claimed.workspace_id,
    provider: claimed.provider,
    connectedAccountId: claimed.connected_account_id,
    missionVersion: claimed.mission_version,
    windowDays: claimed.window_days,
    maxMessages: claimed.max_messages,
    maxDrafts: claimed.max_drafts,
  };
  if (
    batch.tenantId !== identity.tenantId ||
    batch.workspaceId !== identity.workspaceId
  )
    throw new Error("Batch identity mismatch");
  let stats: BatchStats | null = null;
  let failure: "policy" | "transient" | null = null;
  try {
    const state = await run(async (db) => {
      const { rows } = await db.query<{ state: StoreState }>(
        "SELECT state FROM workspace_state WHERE workspace_id=$1 AND tenant_id=$2",
        [identity.workspaceId, identity.tenantId],
      );
      const value = rows[0]?.state;
      if (
        !value ||
        value.workspace.id !== identity.workspaceId ||
        value.workspace.tenantId !== identity.tenantId
      )
        throw new Error("Workspace state unavailable");
      return value;
    });
    stats = await processMailboxBatch({
      batch,
      mailbox: (deps.mailbox ?? mailboxClient)(
        batch.provider,
        {
          tenantId: batch.tenantId,
          workspaceId: batch.workspaceId,
          connectedAccountId: batch.connectedAccountId,
        },
        { mode: claimed.mode },
      ),
      model: deps.model ?? providerInboxModel,
      store: postgresInboxStore(run, batch, { token: claimed.lease_token }),
      context: replyContext(state),
      costs: {
        classifyCents: estimatedCents("ORBIS_INBOX_EST_CENTS_CLASSIFY", 1),
        draftCents: estimatedCents("ORBIS_INBOX_EST_CENTS_DRAFT", 5),
      },
    });
  } catch (error) {
    failure = error instanceof MailboxPolicyError ? "policy" : "transient";
  }
  await run(async (db) => {
    const retry =
      failure === "transient" && claimed.attempts < 3
        ? "queued"
        : failure
          ? "failed"
          : null;
    const status =
      retry ??
      (stats?.leaseLost
        ? null
        : stats?.budgetExhausted
          ? "budget_exhausted"
          : "completed");
    if (!status) return; // Lease lost: the new owner finalizes the batch.
    const result = await db.query(
      `UPDATE inbox_batches SET status=$4, stats=$5::jsonb, error=$6, lease_token=NULL, lease_until=NULL,
       available_at=CASE WHEN $4='queued' THEN now()+interval '1 minute' ELSE available_at END,
       completed_at=CASE WHEN $4 IN ('completed','failed','budget_exhausted') THEN now() ELSE NULL END
       WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND lease_token=$7 AND status='running'`,
      [
        batch.id,
        identity.workspaceId,
        identity.tenantId,
        status,
        JSON.stringify(stats ?? {}),
        failure === "policy"
          ? "Mailbox connection or policy check failed. Reconnect the mailbox, then start again."
          : failure
            ? "Mailbox batch failed. It will be retried; nothing was sent."
            : null,
        claimed.lease_token,
      ],
    );
    if (result.rowCount && status !== "queued") {
      await recordEvent(db, identity, "inbox_batch_completed", {
        task_id: batch.id,
        success: status === "completed",
      });
      if (claimed.kind === "first_run" && (stats?.drafted ?? 0) > 0)
        await recordEvent(db, identity, "first_draft_ready", {
          task_id: batch.id,
        });
    }
  });
  return { processed: true, batchId: batch.id, stats, failure };
}
