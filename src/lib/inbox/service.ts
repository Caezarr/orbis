import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { track } from "@/lib/analytics/events";
import {
  mailboxProviders,
  workspaceMailboxAccounts,
  type MailboxMode,
} from "@/lib/integrations/mailbox";
import { PlatformError } from "@/lib/platform/auth";
import { workspaceContext } from "@/lib/platform/context";
import { INBOX_CONTRACT } from "@/lib/runtime/inbox-replies";
import { monthlyCapCents } from "./store";
import { blockMessage, entitlementsEnforced } from "@/lib/billing/entitlements";
import {
  currentEntitlement,
  ensureTrialStarted,
  mailboxesInUse,
} from "@/lib/billing/entitlements-store";

export const triggerSchema = z
  .object({
    provider: z.enum(mailboxProviders),
    connectedAccountId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_\-]+$/)
      .optional(),
    windowDays: z.number().int().min(1).max(31).default(14),
    maxMessages: z.number().int().min(1).max(50).default(50),
  })
  .strict();
export type TriggerInput = z.infer<typeof triggerSchema>;

function context() {
  const ctx = workspaceContext();
  if (!ctx?.db || ctx.closed)
    throw new PlatformError(
      "Inbox drafts require an authenticated database workspace",
      503,
    );
  return { ...ctx, db: ctx.db };
}
export function inboxMode(): MailboxMode {
  // Fail safe: drafts are only written to the real mailbox when explicitly set.
  return process.env.ORBIS_INBOX_MODE === "scoped_autonomy"
    ? "scoped_autonomy"
    : "test";
}
const digest = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");

type BatchRow = {
  id: string;
  request_hash: string;
  kind: string;
  provider: string;
  mode: string;
  status: string;
  stats: Record<string, unknown>;
  error: string | null;
  window_days: number;
  max_messages: number;
  max_drafts: number;
  created_at: Date;
  completed_at: Date | null;
};
function publicBatch(row: BatchRow) {
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    stats: row.stats,
    error: row.error ?? undefined,
    windowDays: row.window_days,
    maxMessages: row.max_messages,
    maxDrafts: row.max_drafts,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    scope:
      "Reads recent inbound mail and creates reply drafts in your mailbox. Nothing is ever sent.",
  };
}

/** "First run": queue one mailbox batch for the session workspace. */
export async function enqueueFirstRun(
  input: TriggerInput,
  requestKey: string,
  deps: { accounts?: typeof workspaceMailboxAccounts } = {},
) {
  const ctx = context();
  if (!requestKey.trim() || requestKey.length > 200)
    throw new PlatformError(
      "Idempotency-Key of 1–200 characters required",
      400,
    );
  const requestHash = digest(input);
  const prior = (
    await ctx.db.query<BatchRow>(
      "SELECT * FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 AND request_key=$3",
      [ctx.workspaceId, ctx.tenantId, requestKey],
    )
  ).rows[0];
  if (prior) {
    if (prior.request_hash !== requestHash)
      throw new PlatformError(
        "Idempotency key already used for a different request",
        409,
      );
    return publicBatch(prior);
  }
  if (!monthlyCapCents())
    throw new PlatformError(
      "Configure a monthly budget before enabling inbox drafts",
      503,
    );
  // Plan gate: no new batch without an active plan/trial and drafts left (402).
  const ids = { workspaceId: ctx.workspaceId, tenantId: ctx.tenantId };
  const entitlement = await currentEntitlement(ctx.db, ids);
  if (!entitlement.canProcess)
    throw new PlatformError(blockMessage(entitlement.reason!), 402);
  let accounts: string[];
  try {
    accounts = await (deps.accounts ?? workspaceMailboxAccounts)(
      input.provider,
      ctx.tenantId,
      ctx.workspaceId,
    );
  } catch {
    throw new PlatformError(
      "Mailbox connection is not configured. Ask an administrator to enable it.",
      503,
    );
  }
  const account = input.connectedAccountId
    ? accounts.find((a) => a === input.connectedAccountId)
    : accounts.length === 1
      ? accounts[0]
      : undefined;
  if (!account)
    throw new PlatformError(
      accounts.length > 1
        ? "Choose which connected mailbox to use."
        : "Connect your mailbox first.",
      409,
    );
  if (entitlementsEnforced()) {
    const inUse = await mailboxesInUse(ctx.db, ids);
    if (!inUse.includes(account) && inUse.length >= entitlement.mailboxes)
      throw new PlatformError(
        `Votre formule couvre ${entitlement.mailboxes} boîte${entitlement.mailboxes > 1 ? "s" : ""} mail. Passez à la formule Équipe pour en ajouter.`,
        402,
      );
  }
  const firstRunDrafts = Number(process.env.ORBIS_INBOX_FIRST_RUN_MAX_DRAFTS);
  const batchDrafts = Math.min(
    Number.isSafeInteger(firstRunDrafts) &&
      firstRunDrafts >= 0 &&
      firstRunDrafts <= 50
      ? firstRunDrafts
      : 5,
    entitlement.draftsRemaining,
  );
  const result = await ctx.db.query<BatchRow>(
    `INSERT INTO inbox_batches(id,workspace_id,tenant_id,created_by,request_key,request_hash,kind,provider,connected_account_id,mission_version,mode,window_days,max_messages,max_drafts)
     VALUES($1,$2,$3,$4,$5,$6,'first_run',$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT(workspace_id,request_key) DO NOTHING RETURNING *`,
    [
      randomUUID(),
      ctx.workspaceId,
      ctx.tenantId,
      ctx.userId,
      requestKey,
      requestHash,
      input.provider,
      account,
      INBOX_CONTRACT.version,
      inboxMode(),
      input.windowDays,
      input.maxMessages,
      batchDrafts,
    ],
  );
  if (!result.rows[0]) return enqueueFirstRun(input, requestKey, deps);
  // First mailbox batch starts the trial (insert-only, no-op afterwards).
  if (entitlementsEnforced()) await ensureTrialStarted(ctx.db, ids);
  await track("inbox_batch_queued", { task_id: result.rows[0].id });
  return publicBatch(result.rows[0]);
}

type MessageRow = {
  id: string;
  batch_id: string;
  provider: "gmail" | "outlook";
  message_id: string;
  thread_id: string;
  status: string;
  classification: string | null;
  skip_reason: string | null;
  flags: string[];
  subject_preview: string | null;
  draft_preview: string | null;
  questions: string[];
  citations: { sourceId: string; sourceName: string; excerpt: string }[];
  draft_state: string;
  draft_id: string | null;
  received_at: Date | null;
  drafted_at: Date | null;
};
const mailboxLink = (provider: "gmail" | "outlook") =>
  provider === "gmail"
    ? "https://mail.google.com/mail/u/0/#drafts"
    : "https://outlook.office.com/mail/drafts";
export function publicMessage(row: MessageRow) {
  return {
    id: row.id,
    batchId: row.batch_id,
    provider: row.provider,
    messageId: row.message_id,
    threadId: row.thread_id,
    status: row.status,
    classification: row.classification ?? undefined,
    skipReason: row.skip_reason ?? undefined,
    flags: row.flags,
    subjectPreview: row.subject_preview ?? undefined,
    draftPreview: row.draft_preview ?? undefined,
    questions: row.questions,
    citations: row.citations,
    draft:
      row.draft_id &&
      (row.draft_state === "created" || row.draft_state === "simulated")
        ? {
            id: row.draft_id,
            simulated: row.draft_state === "simulated",
            openUrl:
              row.draft_state === "created"
                ? mailboxLink(row.provider)
                : undefined,
          }
        : undefined,
    receivedAt: row.received_at?.toISOString(),
    draftedAt: row.drafted_at?.toISOString(),
  };
}
export type InboxResult = ReturnType<typeof publicMessage>;

export async function listInboxResults(batchId?: string) {
  const ctx = context();
  const batches = (
    await ctx.db.query<BatchRow>(
      "SELECT * FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 20",
      [ctx.workspaceId, ctx.tenantId],
    )
  ).rows;
  const selected = batchId ? batches.find((b) => b.id === batchId) : batches[0];
  if (batchId && !selected) throw new PlatformError("Batch not found", 404);
  const messages = selected
    ? (
        await ctx.db.query<MessageRow>(
          `SELECT id,batch_id,provider,message_id,thread_id,status,classification,skip_reason,flags,subject_preview,draft_preview,
           questions,citations,draft_state,draft_id,received_at,drafted_at FROM inbox_messages
           WHERE workspace_id=$1 AND tenant_id=$2 AND batch_id=$3 ORDER BY received_at DESC NULLS LAST LIMIT 100`,
          [ctx.workspaceId, ctx.tenantId, selected.id],
        )
      ).rows
    : [];
  return {
    batches: batches.map(publicBatch),
    batch: selected ? publicBatch(selected) : undefined,
    messages: messages.map(publicMessage),
  };
}
