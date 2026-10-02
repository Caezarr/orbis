import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { StoreState } from "@/lib/domain/types";
import { replyContext } from "@/lib/inbox/context";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import { monthlyCapCents } from "@/lib/inbox/store";
import {
  mailboxClient,
  MailboxPolicyError,
  MailboxUncertainError,
  type DraftLedger,
  type MailboxMode,
} from "@/lib/integrations/mailbox";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import {
  guardDraft,
  providerInboxModel,
  replyRecipient,
  replyToDiverges,
  type InboxModel,
} from "@/lib/runtime/inbox-replies";
import { providerStatus } from "@/lib/runtime/provider";
import { scoped, type Identity } from "@/lib/operations/worker";
import { currentEntitlement } from "@/lib/billing/entitlements-store";
import { blockMessage, brainJobBlock, type Entitlement } from "@/lib/billing/entitlements";
import { processExtraction, type ExtractionStats } from "./extract";
import { factSources } from "./facts";
import { providerBrainModel, type BrainModel } from "./model";
import type { OutcomeStore } from "./outcomes";
import { draftQuestions } from "./questions";
import {
  addBrainUsage,
  loadActiveFacts,
  recordDraftQuestions,
  reserveBrainBudget,
  saveCandidates,
  type Ids,
} from "./store";

export function brainCents(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
export const BRAIN_COSTS = {
  extract: () => brainCents("ORBIS_BRAIN_EST_CENTS_EXTRACT", 3),
  explain: () => brainCents("ORBIS_BRAIN_EST_CENTS_EXPLAIN", 1),
  regenerate: () => brainCents("ORBIS_INBOX_EST_CENTS_DRAFT", 5),
};

type JobRow = {
  id: string;
  workspace_id: string;
  tenant_id: string;
  kind: "extract_sent" | "regenerate_draft";
  provider: "gmail" | "outlook";
  connected_account_id: string;
  mode: MailboxMode;
  window_days: number;
  max_messages: number;
  inbox_message_id: string | null;
  attempts: number;
  lease_token: string;
};
type Mailbox = {
  listSent(input: { windowDays: number; maxMessages: number }): Promise<MailMessage[]>;
  readThread(threadId: string): Promise<MailMessage[]>;
  listThreadSent(threadId: string): Promise<MailMessage[]>;
  createReplyDraft: ReturnType<typeof mailboxClient>["createReplyDraft"];
};
export type BrainWorkerDeps = {
  model?: BrainModel;
  inboxModel?: InboxModel;
  mailbox?: (...args: Parameters<typeof mailboxClient>) => Mailbox;
  deadline?: number;
  /** Plan entitlement loader (tests); defaults to the PostgreSQL entitlement service. */
  entitlement?: (db: PoolClient, identity: Identity) => Promise<Entitlement>;
};
/** A blocked extraction is deferred (not failed) so it resumes after a plan change. */
export const BRAIN_PLAN_RETRY_MINUTES = 360;

/** Workspace snapshot + approved facts, read under the worker's RLS context. */
export async function loadWorkspaceContext(db: PoolClient, identity: Identity) {
  const { rows } = await db.query<{ state: StoreState }>(
    "SELECT state FROM workspace_state WHERE workspace_id=$1 AND tenant_id=$2",
    [identity.workspaceId, identity.tenantId],
  );
  const state = rows[0]?.state;
  if (
    !state ||
    state.workspace.id !== identity.workspaceId ||
    state.workspace.tenantId !== identity.tenantId
  )
    throw new Error("Workspace state unavailable");
  const facts = await loadActiveFacts(db, identity);
  return { state, facts };
}
export function trustedProfileText(state: StoreState) {
  const profile = state.profile;
  if (!profile || profile.tenantId !== state.workspace.tenantId) return "";
  return [profile.summary, ...profile.claims.map((c) => `${c.label}: ${c.value}`)].join("\n");
}

/** Postgres OutcomeStore for checkDraftOutcomes (inbox incremental batches). */
export function postgresOutcomeStore(
  run: <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>,
  ids: Ids,
  actor: string,
): OutcomeStore {
  const p = [ids.workspaceId, ids.tenantId];
  return {
    dueDrafts: (limit) =>
      run(async (db) =>
        (
          await db.query<{ id: string; thread_id: string; drafted_at: Date; draft_preview: string }>(
            `SELECT m.id,m.thread_id,m.drafted_at,m.draft_preview FROM inbox_messages m
             LEFT JOIN brain_draft_outcomes o ON o.inbox_message_id=m.id AND o.workspace_id=m.workspace_id AND o.tenant_id=m.tenant_id
             WHERE m.workspace_id=$1 AND m.tenant_id=$2 AND m.status='drafted' AND m.draft_state='created' AND m.draft_preview IS NOT NULL
               AND m.drafted_at < now()-interval '30 minutes' AND m.drafted_at > now()-interval '14 days'
               AND (o.id IS NULL OR (o.outcome='pending' AND (o.checked_at IS NULL OR o.checked_at < now()-interval '1 hour')))
             ORDER BY o.checked_at NULLS FIRST, m.drafted_at LIMIT $3`,
            [...p, limit],
          )
        ).rows.map((r) => ({
          rowId: r.id,
          threadId: r.thread_id,
          draftedAt: new Date(r.drafted_at).toISOString(),
          draftPreview: r.draft_preview,
        })),
      ),
    recordOutcome: (rowId, record) =>
      run(async (db) => {
        await db.query(
          `INSERT INTO brain_draft_outcomes(id,workspace_id,tenant_id,inbox_message_id,outcome,similarity,draft_chars,sent_chars,proposals,checks,checked_at,decided_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,now(),CASE WHEN $5='pending' THEN NULL ELSE now() END)
           ON CONFLICT(inbox_message_id) DO UPDATE SET outcome=EXCLUDED.outcome, similarity=EXCLUDED.similarity, draft_chars=EXCLUDED.draft_chars,
             sent_chars=EXCLUDED.sent_chars, proposals=EXCLUDED.proposals, checks=brain_draft_outcomes.checks+1, checked_at=now(), decided_at=EXCLUDED.decided_at
           WHERE brain_draft_outcomes.workspace_id=$2 AND brain_draft_outcomes.tenant_id=$3 AND brain_draft_outcomes.outcome='pending'`,
          [
            randomUUID(),
            ...p,
            rowId,
            record.outcome,
            record.similarity ?? null,
            record.draftChars,
            record.sentChars ?? null,
            record.proposals,
          ],
        );
      }),
    reserve: (rowId, cents) =>
      run((db) => reserveBrainBudget(db, ids, "explain_edit", rowId, cents)),
    addUsage: (usageId, usage) => run((db) => addBrainUsage(db, ids, usageId, usage)),
    saveCandidates: (candidates) => run((db) => saveCandidates(db, ids, candidates, { actor })),
  };
}

/**
 * Brain job type of the operations worker (same lease/backoff/yield contract as
 * inbox batches): `extract_sent` builds candidate facts from sent mail,
 * `regenerate_draft` prepares a NEW draft after new info (the old Orbis draft
 * is left untouched: deleting mail is outside the mailbox policy).
 */
export async function runOneBrainJob(identity: Identity, deps: BrainWorkerDeps = {}) {
  if (!inboxDraftsEnabled()) return { processed: false, reason: "disabled" };
  if (!providerStatus().configured) throw new Error("AI provider not configured");
  if (!monthlyCapCents()) throw new Error("Configure ORBIS_OPERATIONS_MONTHLY_CAP_CENTS first");
  const run = <T>(fn: (db: PoolClient) => Promise<T>) => scoped<T>(identity, fn);
  const ids = [identity.workspaceId, identity.tenantId];
  const claimed = await run(async (db) => {
    await db.query(
      "UPDATE brain_jobs SET status='failed',error='Worker lease expired after three attempts.',lease_token=NULL,lease_until=NULL WHERE workspace_id=$1 AND tenant_id=$2 AND status='running' AND lease_until<now() AND attempts>=3",
      ids,
    );
    await db.query(
      "UPDATE brain_jobs SET draft_preview=NULL WHERE workspace_id=$1 AND tenant_id=$2 AND purge_after<now() AND draft_preview IS NOT NULL",
      ids,
    );
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `orbis-brain-claim:${identity.tenantId}:${identity.workspaceId}`,
    ]);
    const row = (
      await db.query<JobRow>(
        "SELECT * FROM brain_jobs WHERE workspace_id=$1 AND tenant_id=$2 AND available_at<=now() AND attempts<3 AND (status='queued' OR (status='running' AND lease_until<now())) AND NOT EXISTS (SELECT 1 FROM brain_jobs live WHERE live.workspace_id=$1 AND live.tenant_id=$2 AND live.status='running' AND live.lease_until>=now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
        ids,
      )
    ).rows[0];
    if (!row) return null;
    return (
      await db.query<JobRow>(
        "UPDATE brain_jobs SET status='running',started_at=COALESCE(started_at,now()),attempts=attempts+1,lease_token=$4,lease_until=now()+interval '5 minutes' WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 RETURNING *",
        [row.id, ...ids, randomUUID()],
      )
    ).rows[0];
  });
  if (!claimed) return { processed: false };
  if (claimed.workspace_id !== identity.workspaceId || claimed.tenant_id !== identity.tenantId)
    throw new Error("Job identity mismatch");
  // Plan gate BEFORE any mailbox or model call (see brainJobBlock): blocked
  // extraction is deferred without consuming an attempt; a blocked regeneration
  // ends `failed` with the plan message (the owner asked for it now, not later).
  const entitlement = await run((db) =>
    (deps.entitlement ?? ((d, i) => currentEntitlement(d, i)))(db, identity),
  );
  const blocked = brainJobBlock(entitlement, claimed.kind);
  if (blocked) {
    await run((db) =>
      db.query(
        claimed.kind === "extract_sent"
          ? `UPDATE brain_jobs SET status='queued', error=$5, lease_token=NULL, lease_until=NULL, attempts=greatest(attempts-1,0),
             available_at=now()+make_interval(mins => $6::int) WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND lease_token=$4 AND status='running'`
          : `UPDATE brain_jobs SET status='failed', error=$5, lease_token=NULL, lease_until=NULL, completed_at=now(), stats=jsonb_build_object('outcome','plan_blocked')
             WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND lease_token=$4 AND status='running'`,
        [
          claimed.id,
          ...ids,
          claimed.lease_token,
          blockMessage(blocked),
          ...(claimed.kind === "extract_sent" ? [BRAIN_PLAN_RETRY_MINUTES] : []),
        ],
      ),
    );
    return { processed: true, jobId: claimed.id, kind: claimed.kind, stats: null, failure: null, blocked };
  }
  const heartbeat = () =>
    run(async (db) => {
      const r = await db.query(
        "UPDATE brain_jobs SET lease_until=now()+interval '5 minutes' WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND lease_token=$4 AND status='running'",
        [claimed.id, ...ids, claimed.lease_token],
      );
      return r.rowCount === 1;
    });
  const shouldYield =
    deps.deadline === undefined ? undefined : () => Date.now() >= deps.deadline!;
  let stats: (Partial<ExtractionStats> & Record<string, unknown>) | null = null;
  let failure: "policy" | "transient" | null = null;
  try {
    const { state, facts } = await run((db) => loadWorkspaceContext(db, identity));
    const mailbox = (deps.mailbox ?? mailboxClient)(
      claimed.provider,
      {
        tenantId: identity.tenantId,
        workspaceId: identity.workspaceId,
        connectedAccountId: claimed.connected_account_id,
      },
      { mode: claimed.mode },
    );
    if (claimed.kind === "extract_sent")
      stats = await processExtraction({
        job: { windowDays: claimed.window_days, maxMessages: claimed.max_messages },
        mailbox,
        model: deps.model ?? providerBrainModel,
        company: state.profile?.name,
        trustedText: trustedProfileText(state),
        cents: BRAIN_COSTS.extract(),
        shouldYield,
        store: {
          upsertSent: (message, hash) =>
            run(async (db) => {
              await db.query(
                `INSERT INTO brain_sent_messages(id,workspace_id,tenant_id,job_id,connected_account_id,message_id,sent_at,content_hash,status)
                 VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending') ON CONFLICT(workspace_id,connected_account_id,message_id) DO NOTHING`,
                [
                  randomUUID(),
                  ...ids,
                  claimed.id,
                  claimed.connected_account_id,
                  message.id,
                  message.receivedAt || null,
                  hash,
                ],
              );
              const row = (
                await db.query<{ id: string; status: "pending" | "processed" | "skipped" }>(
                  "SELECT id,status FROM brain_sent_messages WHERE workspace_id=$1 AND tenant_id=$2 AND connected_account_id=$3 AND message_id=$4",
                  [...ids, claimed.connected_account_id, message.id],
                )
              ).rows[0];
              if (!row) throw new Error("Sent message row unavailable");
              return { rowId: row.id, status: row.status };
            }),
          markSent: (rowIds, status, detail) =>
            run(async (db) => {
              for (const rowId of rowIds)
                await db.query(
                  "UPDATE brain_sent_messages SET status=$4, skip_reason=$5, facts_found=$6, job_id=$7, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
                  [
                    rowId,
                    ...ids,
                    status,
                    detail?.reason ?? null,
                    detail?.factsFound?.[rowId] ?? 0,
                    claimed.id,
                  ],
                );
            }),
          reserve: (cents) =>
            run((db) => reserveBrainBudget(db, identity, "extract", claimed.id, cents)),
          addUsage: (usageId, usage) => run((db) => addBrainUsage(db, identity, usageId, usage)),
          saveCandidates: (candidates) =>
            run((db) =>
              saveCandidates(db, identity, candidates, { jobId: claimed.id, actor: "orbi" }),
            ),
          heartbeat,
        },
      });
    else
      stats = await regenerate({
        job: claimed,
        identity,
        run,
        mailbox,
        model: deps.inboxModel ?? providerInboxModel,
        sources: replyContext(state, factSources(facts)),
        heartbeat,
      });
  } catch (error) {
    failure = error instanceof MailboxPolicyError ? "policy" : "transient";
  }
  await run(async (db) => {
    const yielded = !failure && !!stats?.yielded && !stats.leaseLost;
    const status =
      failure === "transient" && claimed.attempts < 3
        ? "queued"
        : failure
          ? "failed"
          : stats?.leaseLost
            ? null
            : yielded
              ? "queued"
              : stats?.budgetExhausted
                ? "budget_exhausted"
                : "completed";
    if (!status) return;
    await db.query(
      `UPDATE brain_jobs SET status=$4, stats=$5::jsonb, error=$6, lease_token=NULL, lease_until=NULL,
       attempts=CASE WHEN $8::boolean THEN greatest(attempts-1,0) ELSE attempts END,
       available_at=CASE WHEN $8::boolean THEN now() WHEN $4='queued' THEN now()+make_interval(mins => power(4, greatest(attempts-1,0))::int) ELSE available_at END,
       completed_at=CASE WHEN $4 IN ('completed','failed','budget_exhausted') THEN now() ELSE NULL END
       WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND lease_token=$7 AND status='running'`,
      [
        claimed.id,
        ...ids,
        status,
        JSON.stringify(stats ?? {}),
        failure === "policy"
          ? "Mailbox connection or policy check failed. Reconnect the mailbox, then start again."
          : failure
            ? "Company sheet job failed. It will be retried; nothing was sent."
            : null,
        claimed.lease_token,
        yielded,
      ],
    );
  });
  return { processed: true, jobId: claimed.id, kind: claimed.kind, stats, failure };
}

/** New draft for one thread, grounded in the CURRENT approved facts. Never deletes the old one. */
async function regenerate(params: {
  job: JobRow;
  identity: Identity;
  run: <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>;
  mailbox: Mailbox;
  model: InboxModel;
  sources: ReturnType<typeof replyContext>;
  heartbeat: () => Promise<boolean>;
}) {
  const { job, identity, run, mailbox } = params;
  const ids = [identity.workspaceId, identity.tenantId];
  const target = await run(async (db) =>
    (
      await db.query<{ id: string; message_id: string; thread_id: string; connected_account_id: string }>(
        "SELECT id,message_id,thread_id,connected_account_id FROM inbox_messages WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
        [job.inbox_message_id, ...ids],
      )
    ).rows[0],
  );
  if (!target || target.connected_account_id !== job.connected_account_id)
    return { outcome: "target_unavailable" };
  const thread = await mailbox.readThread(target.thread_id);
  const message = thread.find((m) => m.id === target.message_id && !m.fromOwner);
  if (!message) return { outcome: "message_unavailable" };
  if (thread.some((m) => m.fromOwner && !m.isDraft && m.receivedAt > message.receivedAt))
    return { outcome: "already_replied" };
  const recipient = replyRecipient(message);
  if (!recipient || replyToDiverges(message)) return { outcome: "needs_review" };
  const usageId = await run((db) =>
    reserveBrainBudget(db, identity, "regenerate", job.id, BRAIN_COSTS.regenerate()),
  );
  if (!usageId) return { outcome: "budget", budgetExhausted: true };
  const sources = params.sources.sourcesFor(`${message.subject}\n${message.text}`.slice(0, 2000));
  const generated = await params.model.draft({
    message,
    thread,
    company: params.sources.company,
    sources,
    toneSamples: [],
  });
  await run((db) => addBrainUsage(db, identity, usageId, generated.usage));
  const guarded = guardDraft(generated.output, { sources, message });
  if (!(await params.heartbeat())) return { leaseLost: true };
  const ledger: DraftLedger = {
    claim: (key, payloadHash) =>
      run(async (db) => {
        const claimed = await db.query(
          `UPDATE brain_jobs SET draft_idempotency_key=$4, draft_state='claimed', draft_payload_hash=$5, draft_claimed_at=now(), draft_attempts=draft_attempts+1
           WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state='none' RETURNING id`,
          [job.id, ...ids, key, payloadHash],
        );
        if (claimed.rowCount) return { state: "claimed" as const };
        const row = (
          await db.query<{ draft_state: string; draft_id: string | null; draft_payload_hash: string | null; draft_policy_hash: string | null; draft_reconciled: boolean; draft_claimed_at: Date | null; draft_attempts: number }>(
            "SELECT draft_state,draft_id,draft_payload_hash,draft_policy_hash,draft_reconciled,draft_claimed_at,draft_attempts FROM brain_jobs WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
            [job.id, ...ids],
          )
        ).rows[0];
        if (row && (row.draft_state === "created" || row.draft_state === "simulated") && row.draft_id)
          return {
            state: "done" as const,
            receipt: {
              draftId: row.draft_id,
              threadId: target.thread_id,
              payloadHash: row.draft_payload_hash ?? "",
              policyHash: row.draft_policy_hash ?? "",
              simulated: row.draft_state === "simulated",
              reconciled: row.draft_reconciled,
            },
          };
        return {
          state: "uncertain" as const,
          claimedAt: row?.draft_claimed_at ?? new Date(0),
          attempts: row?.draft_attempts ?? 3,
        };
      }),
    retry: (key) =>
      run(async (db) => {
        const r = await db.query(
          `UPDATE brain_jobs SET draft_state='claimed', draft_claimed_at=now(), draft_attempts=draft_attempts+1
           WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state IN ('claimed','uncertain') AND draft_attempts<3 AND draft_claimed_at < now() - interval '10 minutes' RETURNING id`,
          [key, ...ids],
        );
        return r.rowCount === 1;
      }),
    record: (key, receipt) =>
      run(async (db) => {
        await db.query(
          `UPDATE brain_jobs SET draft_state=$4, draft_id=$5, draft_policy_hash=$6, draft_reconciled=$7, drafted_at=now(), draft_preview=$8
           WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3`,
          [
            key,
            ...ids,
            receipt.simulated ? "simulated" : "created",
            receipt.draftId,
            receipt.policyHash,
            receipt.reconciled,
            guarded.body.slice(0, 1200),
          ],
        );
      }),
    markUncertain: (key) =>
      run(async (db) => {
        await db.query(
          "UPDATE brain_jobs SET draft_state='uncertain' WHERE draft_idempotency_key=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state='claimed'",
          [key, ...ids],
        );
      }),
  };
  try {
    const receipt = await mailbox.createReplyDraft(
      {
        idempotencyKey: createHash("sha256")
          .update(
            JSON.stringify([
              "brain-regenerate",
              identity.tenantId,
              identity.workspaceId,
              job.connected_account_id,
              message.id,
              job.id,
            ]),
          )
          .digest("hex"),
        threadId: message.threadId,
        messageId: message.id,
        recipient,
        body: guarded.body,
      },
      ledger,
    );
    const mismatch =
      receipt.recipients !== undefined &&
      (receipt.recipients.length !== 1 || receipt.recipients[0] !== recipient);
    const questions = draftQuestions(guarded.body, guarded.questions, {
      thirdParties: [recipient, ...(message.from?.name ? [message.from.name] : [])],
    });
    await run((db) => recordDraftQuestions(db, identity, target.id, questions));
    return {
      outcome: mismatch ? "recipient_mismatch" : receipt.simulated ? "simulated" : "drafted",
      questions: questions.length,
    };
  } catch (error) {
    if (error instanceof MailboxUncertainError) return { outcome: "uncertain" };
    throw error;
  }
}
