import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { recordEvent } from "@/lib/analytics/events";
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
  type MailboxClient,
  type MailboxMode,
} from "@/lib/integrations/mailbox";
import {
  providerInboxModel,
  type InboxModel,
} from "@/lib/runtime/inbox-replies";
import { providerStatus } from "@/lib/runtime/provider";
import { advanceCursor, pauseContinuous } from "@/lib/inbox/schedule";
import { enqueueExtraction } from "@/lib/brain/store";
import { factSources } from "@/lib/brain/facts";
import { providerBrainModel, type BrainModel } from "@/lib/brain/model";
import {
  providerQuestionGrouper,
  questionGroupingEnabled,
  type QuestionGrouper,
} from "@/lib/brain/grouping";
import { checkDraftOutcomes, type OutcomeStats } from "@/lib/brain/outcomes";
import {
  BRAIN_COSTS,
  loadWorkspaceContext,
  postgresOutcomeStore,
  trustedProfileText,
} from "@/lib/brain/worker";
import { currentEntitlement } from "@/lib/billing/entitlements-store";
import { blockMessage, brainJobBlock, type Entitlement } from "@/lib/billing/entitlements";
import { providerFollowupModel, type FollowupModel } from "@/lib/followups/model";
import { postgresFollowupStore, postgresRequestStore } from "@/lib/followups/store";
import { runFollowups, trackRequest, type FollowupStats } from "@/lib/followups/tracker";
import { scoped, type Identity } from "./worker";
import {
  calendarClient,
  calendarFor,
  workspaceCalendarAccounts,
} from "@/lib/integrations/calendar";
import { labelClient } from "@/lib/integrations/mailbox-labels";
import { isActive } from "@/lib/brain/facts";
import { workingHours } from "@/lib/calendar/slots";
import {
  calendarFeatureEnabled,
  DEFAULT_FEATURES,
  labelsFeatureEnabled,
  loadFeatures,
  type InboxFeatures,
} from "@/lib/inbox/features";
import { heldSlots, meetingPlanner } from "@/lib/inbox/meetings";
import { applyLabels, postgresLabelStore } from "@/lib/inbox/labels";

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
  since_at: Date | null;
};
export type InboxWorkerDeps = {
  model?: InboxModel;
  /** Company brain model (draft-vs-sent explanations). */
  brainModel?: BrainModel;
  /** Question grouping model (tests); used only when ORBIS_BRAIN_QUESTION_GROUPING=true. */
  questionGrouper?: QuestionGrouper;
  mailbox?: (
    ...args: Parameters<typeof mailboxClient>
  ) => Parameters<typeof processMailboxBatch>[0]["mailbox"] &
    Partial<Pick<MailboxClient, "listThreadSent">>;
  /** Epoch ms after which no new message is started (serverless time budget). */
  deadline?: number;
  /** Plan entitlement loader (tests); defaults to the PostgreSQL entitlement service. */
  entitlement?: (db: PoolClient, identity: Identity) => Promise<Entitlement>;
  /** Follow-ups / request pipeline model (levels 6 and 7). */
  followupModel?: FollowupModel;
  /** Calendar broker (tests): account discovery and free/busy client. */
  calendarAccounts?: typeof workspaceCalendarAccounts;
  calendar?: typeof calendarClient;
  /** Label broker (tests). */
  labels?: typeof labelClient;
};

/**
 * Inbox job type of the operations worker: one mailbox batch per invocation,
 * leased (5 min, renewed per message), at most 3 attempts with exponential
 * backoff (1, 4 min), at most one running batch per workspace. Model and
 * mailbox calls happen outside database transactions. With `deps.deadline` the
 * batch yields between messages and is re-queued without consuming an attempt.
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
    // One running batch per workspace (mailbox rate limits, fairness): claims of
    // the same workspace are serialized, then refused while a live lease exists.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `orbis-inbox-claim:${identity.tenantId}:${identity.workspaceId}`,
    ]);
    const row = (
      await db.query<BatchRow>(
        "SELECT * FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 AND available_at<=now() AND attempts<3 AND (status='queued' OR (status='running' AND lease_until<now())) AND NOT EXISTS (SELECT 1 FROM inbox_batches live WHERE live.workspace_id=$1 AND live.tenant_id=$2 AND live.status='running' AND live.lease_until>=now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",
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
    ...(claimed.kind === "incremental" && claimed.since_at
      ? { since: new Date(claimed.since_at).toISOString() }
      : {}),
  };
  if (
    batch.tenantId !== identity.tenantId ||
    batch.workspaceId !== identity.workspaceId
  )
    throw new Error("Batch identity mismatch");
  // Plan gate BEFORE any mailbox or model call. Inactive plan or no draft left:
  // the batch ends with an explicit state, earlier results stay readable.
  const entitlement = await run((db) =>
    (deps.entitlement ?? ((d, i) => currentEntitlement(d, i)))(db, identity),
  );
  if (!entitlement.canProcess) {
    const status =
      entitlement.reason === "quota_reached" ||
      entitlement.reason === "trial_drafts_used"
        ? "quota_reached"
        : "plan_inactive";
    await run(async (db) => {
      const result = await db.query(
        `UPDATE inbox_batches SET status=$4, error=$5, lease_token=NULL, lease_until=NULL, completed_at=now()
         WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND lease_token=$6 AND status='running'`,
        [
          batch.id,
          identity.workspaceId,
          identity.tenantId,
          status,
          blockMessage(entitlement.reason!),
          claimed.lease_token,
        ],
      );
      if (result.rowCount)
        await recordEvent(db, identity, "inbox_batch_completed", {
          task_id: batch.id,
          success: false,
        });
    });
    return {
      processed: true,
      batchId: batch.id,
      workspaceId: batch.workspaceId,
      stats: null,
      failure: null,
      blocked: status,
    };
  }
  let stats: BatchStats | null = null;
  let failure: "policy" | "transient" | null = null;
  let mailbox: ReturnType<NonNullable<InboxWorkerDeps["mailbox"]>> | null =
    null;
  let trustedText = "";
  let followups: FollowupStats | undefined;
  const loadEntitlement = (db: PoolClient) =>
    (deps.entitlement ?? ((d, i) => currentEntitlement(d, i)))(db, identity);
  try {
    // Workspace snapshot + owner-approved company sheet facts (never candidates).
    const { state, facts } = await run((db) =>
      loadWorkspaceContext(db, identity),
    );
    trustedText = trustedProfileText(state);
    mailbox = (deps.mailbox ?? mailboxClient)(
      batch.provider,
      {
        tenantId: batch.tenantId,
        workspaceId: batch.workspaceId,
        connectedAccountId: batch.connectedAccountId,
      },
      { mode: claimed.mode },
    );
    const inboxStore = postgresInboxStore(
      run,
      batch,
      { token: claimed.lease_token },
      {
        questionGrouper: questionGroupingEnabled()
          ? (deps.questionGrouper ?? providerQuestionGrouper)
          : undefined,
      },
    );
    const followupModel = deps.followupModel ?? providerFollowupModel;
    const context = replyContext(state, factSources(facts));
    // Opt-ins (migration 014). Deployment flags off → nothing changes.
    let features: InboxFeatures = DEFAULT_FEATURES;
    if (calendarFeatureEnabled() || labelsFeatureEnabled(batch.provider))
      features = await run((db) => loadFeatures(db, identity));
    const ids = {
      tenantId: batch.tenantId,
      workspaceId: batch.workspaceId,
    };
    const meetings = calendarFeatureEnabled()
      ? meetingPlanner({
          calendarEnabled: features.calendarEnabled,
          mode: claimed.mode,
          timezone: features.timezone,
          // Owner-approved hours only (company sheet); defaults are flagged.
          hours: workingHours(
            facts
              .filter((f) => f.category === "hours" && isActive(f))
              .map((f) => f.statement),
          ),
          calendar:
            features.calendarEnabled && claimed.mode !== "test"
              ? async () => {
                  const provider = calendarFor(batch.provider);
                  const accounts = await (
                    deps.calendarAccounts ?? workspaceCalendarAccounts
                  )(provider, ids.tenantId, ids.workspaceId);
                  return accounts[0]
                    ? (deps.calendar ?? calendarClient)(provider, {
                        ...ids,
                        connectedAccountId: accounts[0],
                      })
                    : null;
                }
              : null,
          held: features.calendarEnabled
            ? await run((db) => heldSlots(db, identity))
            : [],
        })
      : undefined;
    const requestStore = postgresRequestStore(run, {
      workspaceId: batch.workspaceId,
      tenantId: batch.tenantId,
      provider: batch.provider,
      connectedAccountId: batch.connectedAccountId,
    });
    stats = await processMailboxBatch({
      batch,
      mailbox,
      model: deps.model ?? providerInboxModel,
      store: inboxStore,
      context,
      requests: {
        track: (input) =>
          trackRequest(
            {
              store: requestStore,
              model: followupModel,
              cents: estimatedCents("ORBIS_PIPELINE_EST_CENTS_EXTRACT", 1),
            },
            input,
          ),
      },
      costs: {
        classifyCents: estimatedCents("ORBIS_INBOX_EST_CENTS_CLASSIFY", 1),
        draftCents: estimatedCents("ORBIS_INBOX_EST_CENTS_DRAFT", 5),
      },
      shouldYield:
        deps.deadline === undefined
          ? undefined
          : () => Date.now() >= deps.deadline!,
      draftQuota: entitlement.draftsRemaining,
      ...(meetings ? { meetings } : {}),
    });
    // Visible triage (opt-in): label what this account's runs classified.
    // Best effort, never fails or re-queues the batch.
    if (
      labelsFeatureEnabled(batch.provider) &&
      features.labelsEnabled &&
      !stats.leaseLost &&
      (deps.deadline === undefined || deps.deadline - Date.now() > 5_000)
    )
      stats.labels = await applyLabels({
        ids: { ...ids, connectedAccountId: batch.connectedAccountId },
        mode: claimed.mode,
        client: () =>
          (deps.labels ?? labelClient)(batch.provider, {
            ...ids,
            connectedAccountId: batch.connectedAccountId,
          }),
        store: postgresLabelStore(run, {
          ...ids,
          provider: batch.provider,
          connectedAccountId: batch.connectedAccountId,
          mode: claimed.mode,
        }),
        shouldYield:
          deps.deadline === undefined
            ? undefined
            : () => Date.now() >= deps.deadline!,
      }).catch(() => ({ failed: true }));
    // Levels 6/7 on continuous (incremental) batches that finished cleanly:
    // read due request threads, update the pipeline, propose follow-up drafts.
    // Still under this batch's lease; bounded; best effort except policy errors.
    if (
      claimed.kind === "incremental" &&
      !stats.leaseLost &&
      !stats.yielded &&
      !stats.budgetExhausted &&
      (deps.deadline === undefined || deps.deadline - Date.now() > 5_000)
    ) {
      try {
        followups = await runFollowups({
          ids: {
            tenantId: batch.tenantId,
            workspaceId: batch.workspaceId,
            connectedAccountId: batch.connectedAccountId,
          },
          mailbox,
          model: followupModel,
          store: postgresFollowupStore(
            run,
            {
              workspaceId: batch.workspaceId,
              tenantId: batch.tenantId,
              connectedAccountId: batch.connectedAccountId,
            },
            { heartbeat: () => inboxStore.heartbeat() },
          ),
          context,
          // A follow-up draft is a draft: fresh plan + quota check each time.
          canDraft: async () =>
            brainJobBlock(await run(loadEntitlement), "regenerate_draft") ===
            null,
          costs: {
            classifyCents: estimatedCents("ORBIS_INBOX_EST_CENTS_CLASSIFY", 1),
            draftCents: estimatedCents("ORBIS_INBOX_EST_CENTS_DRAFT", 5),
          },
          shouldYield:
            deps.deadline === undefined
              ? undefined
              : () => Date.now() >= deps.deadline!,
          maxThreads: estimatedCents("ORBIS_FOLLOWUP_MAX_THREADS", 10),
        });
        stats.followups = followups;
      } catch (error) {
        if (error instanceof MailboxPolicyError) throw error;
      }
    }
  } catch (error) {
    failure = error instanceof MailboxPolicyError ? "policy" : "transient";
  }
  let finalStatus = null as string | null;
  await run(async (db) => {
    const retry =
      failure === "transient" && claimed.attempts < 3
        ? "queued"
        : failure
          ? "failed"
          : null;
    // Time budget reached between messages: resume soon, attempt not consumed.
    const yielded = !failure && !!stats?.yielded && !stats.leaseLost;
    const status =
      retry ??
      (stats?.leaseLost
        ? null
        : yielded
          ? "queued"
          : stats?.budgetExhausted
            ? "budget_exhausted"
            : stats?.quotaReached
              ? "quota_reached"
              : "completed");
    if (!status) return; // Lease lost: the new owner finalizes the batch.
    finalStatus = status;
    const result = await db.query(
      `UPDATE inbox_batches SET status=$4, stats=$5::jsonb, error=$6, lease_token=NULL, lease_until=NULL,
       attempts=CASE WHEN $8::boolean THEN greatest(attempts-1,0) ELSE attempts END,
       available_at=CASE WHEN $8::boolean THEN now() WHEN $4='queued' THEN now()+make_interval(mins => power(4, greatest(attempts-1,0))::int) ELSE available_at END,
       completed_at=CASE WHEN $4 IN ('completed','failed','budget_exhausted','quota_reached') THEN now() ELSE NULL END
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
            : status === "quota_reached"
              ? blockMessage(
                  entitlement.plan === "trial"
                    ? "trial_drafts_used"
                    : "quota_reached",
                )
              : null,
        claimed.lease_token,
        yielded,
      ],
    );
    if (result.rowCount && status === "completed")
      await advanceCursor(db, identity, {
        id: batch.id,
        connectedAccountId: batch.connectedAccountId,
      });
    if (result.rowCount && failure === "policy")
      await pauseContinuous(db, identity, batch.connectedAccountId);
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
    // Company brain: read the owner's sent mail ONCE after the first completed
    // run of a mailbox (manual re-runs from the company sheet page).
    // A first run stopped by the draft quota still learns from sent mail when
    // the plan allows it (the brain worker re-checks the entitlement).
    if (
      result.rowCount &&
      (status === "completed" || status === "quota_reached") &&
      claimed.kind === "first_run"
    )
      await enqueueExtraction(db, identity, {
        provider: batch.provider,
        connectedAccountId: batch.connectedAccountId,
        mode: claimed.mode,
        requestKey: `extract:auto:${batch.connectedAccountId}`,
      });
  });
  // Level 5: on completed incremental batches, check a few earlier real drafts
  // against what the owner actually sent (best effort, budgeted, bounded).
  let outcomes: OutcomeStats | undefined;
  const timeLeft =
    deps.deadline === undefined ? Infinity : deps.deadline - Date.now();
  if (
    finalStatus === "completed" &&
    claimed.kind === "incremental" &&
    mailbox?.listThreadSent &&
    timeLeft > 5_000
  ) {
    const listThreadSent = mailbox.listThreadSent.bind(mailbox);
    outcomes = await checkDraftOutcomes({
      mailbox: { listThreadSent },
      model: deps.brainModel ?? providerBrainModel,
      store: postgresOutcomeStore(run, identity, "orbi"),
      trustedText,
      cents: BRAIN_COSTS.explain(),
      shouldYield:
        deps.deadline === undefined
          ? undefined
          : () => Date.now() >= deps.deadline!,
    }).catch(() => undefined);
  }
  return {
    outcomes,
    processed: true,
    batchId: batch.id,
    workspaceId: batch.workspaceId,
    stats,
    failure,
  };
}
