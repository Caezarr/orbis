import { createHash } from "node:crypto";
import {
  MailboxPolicyError,
  MailboxUncertainError,
  type DraftLedger,
  type MailboxClient,
} from "@/lib/integrations/mailbox";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import {
  ACTIONABLE,
  guardDraft,
  injectionSignals,
  replyRecipient,
  replyToDiverges,
  skipReason,
  type Classification,
  type InboxModel,
  type ModelUsage,
} from "@/lib/runtime/inbox-replies";
import { draftQuestions } from "@/lib/brain/questions";
import type { ReplyContext } from "./context";

export type InboxBatch = {
  id: string;
  tenantId: string;
  workspaceId: string;
  provider: "gmail" | "outlook";
  connectedAccountId: string;
  missionVersion: string;
  windowDays: number;
  maxMessages: number;
  maxDrafts: number;
  /** Incremental batches: list only messages received at or after this ISO instant. */
  since?: string;
};
export type MessageStatus =
  | "seen"
  | "skipped"
  | "classified"
  | "drafting"
  | "drafted"
  | "needs_review"
  | "uncertain"
  | "failed";
export type MessageRow = {
  rowId: string;
  status: MessageStatus;
  classification: Classification | null;
};
export type MessageUpdate = Partial<{
  status: MessageStatus;
  classification: Classification;
  skipReason: string;
  flags: string[];
  draftPreview: string;
  questions: string[];
  citations: { sourceId: string; sourceName: string; excerpt: string }[];
}>;
/** Durable per-message state. Implemented by ./store.ts on PostgreSQL. */
export type InboxStore = {
  upsertMessage(message: MailMessage, contentHash: string): Promise<MessageRow>;
  update(rowId: string, update: MessageUpdate): Promise<void>;
  /** Reserve estimated cost against the tenant's monthly cap before a model call. */
  reserveBudget(rowId: string, cents: number): Promise<boolean>;
  addUsage(rowId: string, usage: ModelUsage): Promise<void>;
  ledger(rowId: string): DraftLedger;
  /** Renew the batch lease; false means another worker owns it now. */
  heartbeat(): Promise<boolean>;
  /** Company brain: register this draft's open questions (deduplicated per workspace). */
  recordQuestions?(
    rowId: string,
    questions: { canonicalKey: string; label: string }[],
  ): Promise<unknown>;
};
export type BatchStats = {
  listed: number;
  skipped: number;
  classified: number;
  actionable: number;
  drafted: number;
  reused: number;
  needsReview: number;
  uncertain: number;
  failed: number;
  budgetExhausted: boolean;
  leaseLost: boolean;
  /** Stopped between messages because the caller's time budget ran out. */
  yielded?: boolean;
  /** Stopped before any further model call: the plan's draft quota is used up. */
  quotaReached?: boolean;
  /** Mailbox drafts created by this run (quota units), including recipient mismatches. */
  draftsCreated?: number;
};
export class LeaseLostError extends Error {}

const TERMINAL: ReadonlySet<MessageStatus> = new Set([
  "skipped",
  "drafted",
  "needs_review",
]);
export const contentHash = (m: MailMessage) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        m.provider,
        m.id,
        m.threadId,
        m.from?.address,
        m.subject,
        m.text,
      ]),
    )
    .digest("hex");
export const draftIdempotencyKey = (batch: InboxBatch, messageId: string) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        "inbox-draft",
        batch.tenantId,
        batch.workspaceId,
        batch.connectedAccountId,
        messageId,
        batch.missionVersion,
      ]),
    )
    .digest("hex");

/**
 * Processes one mailbox batch. Network/model calls happen outside DB
 * transactions; every state change is persisted per message so a crashed or
 * re-run batch resumes without duplicate drafts or repeated model spend.
 */
export async function processMailboxBatch(params: {
  batch: InboxBatch;
  mailbox: Pick<
    MailboxClient,
    "listInbound" | "listSent" | "readThread" | "createReplyDraft"
  >;
  model: InboxModel;
  store: InboxStore;
  context: ReplyContext;
  costs: { classifyCents: number; draftCents: number };
  now?: Date;
  /** Checked before each message; true = stop cleanly, the batch is resumed later. */
  shouldYield?: () => boolean;
  /** Plan drafts remaining (entitlements). Undefined = no plan quota. */
  draftQuota?: number;
}): Promise<BatchStats> {
  const { batch, mailbox, model, store, context, costs } = params;
  const stats: BatchStats = {
    listed: 0,
    skipped: 0,
    classified: 0,
    actionable: 0,
    drafted: 0,
    reused: 0,
    needsReview: 0,
    uncertain: 0,
    failed: 0,
    budgetExhausted: false,
    leaseLost: false,
    draftsCreated: 0,
  };
  const quotaUsed = () =>
    params.draftQuota !== undefined &&
    (stats.draftsCreated ?? 0) >= params.draftQuota;
  const since = batch.since ? new Date(batch.since) : undefined;
  const messages = (
    await mailbox.listInbound({
      windowDays: batch.windowDays,
      maxMessages: batch.maxMessages,
      now: params.now,
      ...(since ? { since } : {}),
    })
  )
    // Defensive: providers filter by date, but never process older mail in an
    // incremental batch even if a provider ignores the bound.
    .filter((m) => !batch.since || !m.receivedAt || m.receivedAt >= batch.since)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  stats.listed = messages.length;
  let tone: string[] | undefined;
  const toneSamples = async () => {
    if (tone) return tone;
    try {
      tone = (await mailbox.listSent({ windowDays: 31, maxMessages: 3 }))
        .map((m) => m.text.slice(0, 1200))
        .filter(Boolean);
    } catch {
      tone = []; // Tone is optional; never block a draft on it.
    }
    return tone;
  };
  for (const message of messages) {
    if (quotaUsed()) {
      // Graceful stop: results so far are kept, nothing else costs a model call.
      stats.quotaReached = true;
      break;
    }
    if (params.shouldYield?.()) {
      stats.yielded = true;
      break;
    }
    if (!(await store.heartbeat())) {
      stats.leaseLost = true;
      break;
    }
    const row = await store.upsertMessage(message, contentHash(message));
    if (
      TERMINAL.has(row.status) ||
      (row.status === "classified" &&
        row.classification &&
        !ACTIONABLE.has(row.classification))
    ) {
      stats.reused++;
      continue;
    }
    const skip = skipReason(message);
    if (skip) {
      await store.update(row.rowId, { status: "skipped", skipReason: skip });
      stats.skipped++;
      continue;
    }
    const flags = injectionSignals(`${message.subject}\n${message.text}`).map(
      (s) => `injection_suspected:${s}`,
    );
    try {
      let classification = row.classification;
      if (!classification) {
        if (!(await store.reserveBudget(row.rowId, costs.classifyCents))) {
          stats.budgetExhausted = true;
          break;
        }
        const result = await model.classify(message);
        await store.addUsage(row.rowId, result.usage);
        classification = result.output.classification;
        await store.update(row.rowId, {
          status: "classified",
          classification,
          flags,
        });
        stats.classified++;
      }
      if (!ACTIONABLE.has(classification)) continue;
      stats.actionable++;
      if (stats.drafted >= batch.maxDrafts) {
        // Stays non-terminal: a later batch with remaining quota drafts it.
        await store.update(row.rowId, {
          flags: [...flags, "awaiting_draft_quota"],
        });
        continue;
      }
      const recipient = replyRecipient(message);
      if (!recipient || replyToDiverges(message)) {
        await store.update(row.rowId, {
          status: "needs_review",
          flags: [...flags, "reply_to_diverges"],
        });
        stats.needsReview++;
        continue;
      }
      const thread = await mailbox.readThread(message.threadId);
      if (
        thread.some(
          (m) => m.fromOwner && !m.isDraft && m.receivedAt > message.receivedAt,
        )
      ) {
        await store.update(row.rowId, {
          status: "skipped",
          skipReason: "already_replied",
        });
        stats.skipped++;
        continue;
      }
      if (!(await store.reserveBudget(row.rowId, costs.draftCents))) {
        stats.budgetExhausted = true;
        break;
      }
      const sources = context.sourcesFor(
        `${message.subject}\n${message.text}`.slice(0, 2000),
      );
      const generated = await model.draft({
        message,
        thread,
        company: context.company,
        sources,
        toneSamples: await toneSamples(),
      });
      await store.addUsage(row.rowId, generated.usage);
      const guarded = guardDraft(generated.output, { sources, message });
      const allFlags = [...flags, ...guarded.issues.map((i) => `guard:${i}`)];
      await store.update(row.rowId, {
        status: "drafting",
        flags: allFlags,
        draftPreview: guarded.body.slice(0, 1200),
        questions: guarded.questions,
        citations: guarded.citations.map((c) => ({
          sourceId: c.sourceId,
          sourceName: sources.find((s) => s.id === c.sourceId)?.name ?? "",
          excerpt: c.excerpt,
        })),
      });
      if (!(await store.heartbeat())) {
        stats.leaseLost = true;
        break;
      }
      const receipt = await mailbox.createReplyDraft(
        {
          idempotencyKey: draftIdempotencyKey(batch, message.id),
          threadId: message.threadId,
          messageId: message.id,
          recipient,
          body: guarded.body,
        },
        store.ledger(row.rowId),
      );
      stats.draftsCreated = (stats.draftsCreated ?? 0) + 1;
      const mismatch =
        receipt.recipients !== undefined &&
        (receipt.recipients.length !== 1 ||
          receipt.recipients[0] !== recipient);
      await store.update(row.rowId, {
        status: mismatch ? "needs_review" : "drafted",
        flags: mismatch ? [...allFlags, "recipient_mismatch"] : allFlags,
      });
      if (mismatch) stats.needsReview++;
      else stats.drafted++;
      if (store.recordQuestions) {
        const questions = draftQuestions(guarded.body, guarded.questions, {
          thirdParties: [
            recipient,
            ...(message.from?.name ? [message.from.name] : []),
          ],
        });
        // Best effort: a question bookkeeping failure never undoes a draft.
        if (questions.length)
          await store.recordQuestions(row.rowId, questions).catch(() => {});
      }
    } catch (error) {
      if (error instanceof MailboxPolicyError) throw error;
      if (error instanceof MailboxUncertainError) {
        await store.update(row.rowId, { status: "uncertain" });
        stats.uncertain++;
        continue;
      }
      // Model/provider failure: no draft, no content echoed into storage.
      await store.update(row.rowId, { status: "failed" });
      stats.failed++;
    }
  }
  return stats;
}
