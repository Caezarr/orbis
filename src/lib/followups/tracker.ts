import { createHash } from "node:crypto";
import {
  MailboxPolicyError,
  MailboxUncertainError,
  type DraftLedger,
  type MailboxClient,
} from "@/lib/integrations/mailbox";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import { redactThirdParty, stripQuoted } from "@/lib/brain/text";
import type { ReplyContext } from "@/lib/inbox/context";
import {
  guardDraft,
  replyDraftSchema,
  replyRecipient,
  replyToDiverges,
  type Classification,
  type ModelUsage,
  type ReplySource,
} from "@/lib/runtime/inbox-replies";
import {
  classifyOwnerMessage,
  contactOf,
  decideFollowup,
  nextCheckAt,
  nextStatus,
  observeThread,
  type FollowupState,
  type PipelineStatus,
} from "./detect";
import type { FollowupModel } from "./model";
import { requestExtractionSchema, verifyRequest } from "./request";

/*
 * Orchestration of levels 6 and 7 for one mailbox, with a store interface so
 * it is testable without PostgreSQL. Runs inside an inbox worker invocation,
 * after the batch, bounded by `maxThreads` mailbox reads and the time budget.
 * Mailbox writes: only `createReplyDraft` (existing allowlisted, idempotent
 * path; test mode = simulated). Never sends.
 */
export type TrackedItem = {
  id: string;
  threadId: string;
  kind: Classification;
  contactEmail: string | null;
  status: PipelineStatus;
  firstCustomerAt: string | null;
  firstRepliedAt: string | null;
  relanceAt: string | null;
  createdAt: string;
  snoozedUntil: string | null;
  followupsDismissed: boolean;
  followups: FollowupState[];
};
export type Observation = {
  status: PipelineStatus;
  firstRepliedAt: string | null;
  lastOwnerAt: string | null;
  lastCustomerAt: string | null;
  relanceAt: string | null;
  awaitingCustomer: boolean;
  nextCheckAt: string | null;
};
export type FollowupUpdate = {
  status: "drafting" | "drafted" | "needs_review" | "uncertain" | "failed" | "not_needed";
  reason?: string;
  draftPreview?: string;
  questions?: string[];
  flags?: string[];
};
export type FollowupSettings = { enabled: boolean; businessDays: number; maxStages: number };
export type UsageKind = "request_extract" | "followup_classify" | "followup_draft";
export type FollowupStore = {
  settings(): Promise<FollowupSettings>;
  dueItems(limit: number): Promise<TrackedItem[]>;
  saveObservation(itemId: string, obs: Observation): Promise<void>;
  /** Insert (or reclaim a reconsiderable row of) one stage. null = already exists. */
  beginFollowup(itemId: string, input: { stage: number; ownerMessageAt: string; dueAt: string }): Promise<string | null>;
  finishFollowup(followupId: string, update: FollowupUpdate): Promise<void>;
  reserve(kind: UsageKind, refId: string, cents: number): Promise<string | null>;
  addUsage(usageId: string, usage: ModelUsage): Promise<void>;
  ledger(followupId: string): DraftLedger;
  heartbeat(): Promise<boolean>;
};
export type FollowupStats = {
  checked: number;
  readFailed: number;
  statusChanged: number;
  proposed: number;
  drafted: number;
  notNeeded: number;
  needsReview: number;
  uncertain: number;
  failed: number;
  budgetExhausted: boolean;
  quotaReached: boolean;
  leaseLost: boolean;
  yielded: boolean;
};
export const followupIdempotencyKey = (
  ids: { tenantId: string; workspaceId: string; connectedAccountId: string },
  threadId: string,
  stage: number,
) =>
  createHash("sha256")
    .update(JSON.stringify(["followup", ids.tenantId, ids.workspaceId, ids.connectedAccountId, threadId, stage]))
    .digest("hex");

export async function runFollowups(params: {
  ids: { tenantId: string; workspaceId: string; connectedAccountId: string };
  mailbox: Pick<MailboxClient, "readThread" | "createReplyDraft">;
  model: FollowupModel;
  store: FollowupStore;
  context: ReplyContext;
  /** Fresh plan check before each follow-up draft (draft quota). */
  canDraft: () => Promise<boolean>;
  costs: { classifyCents: number; draftCents: number };
  now?: () => Date;
  shouldYield?: () => boolean;
  maxThreads?: number;
}): Promise<FollowupStats> {
  const { mailbox, model, store } = params;
  const clock = params.now ?? (() => new Date());
  const stats: FollowupStats = {
    checked: 0,
    readFailed: 0,
    statusChanged: 0,
    proposed: 0,
    drafted: 0,
    notNeeded: 0,
    needsReview: 0,
    uncertain: 0,
    failed: 0,
    budgetExhausted: false,
    quotaReached: false,
    leaseLost: false,
    yielded: false,
  };
  const settings = await store.settings();
  const items = await store.dueItems(Math.max(1, Math.min(50, params.maxThreads ?? 10)));
  let drafting = true;
  for (const item of items) {
    if (params.shouldYield?.()) {
      stats.yielded = true;
      break;
    }
    if (!(await store.heartbeat())) {
      stats.leaseLost = true;
      break;
    }
    const now = clock();
    let thread: MailMessage[];
    try {
      thread = await mailbox.readThread(item.threadId);
    } catch (error) {
      if (error instanceof MailboxPolicyError) throw error;
      stats.readFailed++;
      await store.saveObservation(item.id, {
        status: item.status,
        firstRepliedAt: item.firstRepliedAt,
        lastOwnerAt: null,
        lastCustomerAt: null,
        relanceAt: item.relanceAt,
        awaitingCustomer: false,
        nextCheckAt: new Date(now.getTime() + 6 * 3_600_000).toISOString(),
      });
      continue;
    }
    stats.checked++;
    const obs = observeThread(thread, item.contactEmail ?? "", item.firstCustomerAt);
    const firstRepliedAt = item.firstRepliedAt ?? obs.firstRepliedAt;
    // Relancé: the owner sent something after one of our follow-up drafts.
    const drafted = item.followups.map((f) => f.draftedAt).filter((d): d is string => !!d).sort();
    const relanceAt =
      item.relanceAt ?? (drafted.length && obs.lastOwnerAt && obs.lastOwnerAt > drafted[0]! ? obs.lastOwnerAt : null);
    const status = nextStatus(item.status, { firstRepliedAt, relanceAt });
    if (status !== item.status) stats.statusChanged++;
    const decision = decideFollowup(
      obs,
      {
        status,
        followupsDismissed: item.followupsDismissed,
        snoozedUntil: item.snoozedUntil,
        contactEmail: item.contactEmail,
        businessDays: settings.businessDays,
        maxStages: settings.maxStages,
        enabled: settings.enabled,
        existing: item.followups,
      },
      now,
    );
    await store.saveObservation(item.id, {
      status,
      firstRepliedAt,
      lastOwnerAt: obs.lastOwnerAt,
      lastCustomerAt: obs.lastCustomerAt,
      relanceAt,
      awaitingCustomer: obs.awaitingCustomer,
      nextCheckAt: nextCheckAt({ status, createdAt: item.createdAt, firstRepliedAt }, decision, now),
    });
    if (decision.action !== "propose" || !drafting) continue;
    const owner = obs.lastOwner!;
    const customer = obs.lastCustomer;
    // Plan gate first: a follow-up draft consumes one draft of the quota.
    if (!(await params.canDraft())) {
      stats.quotaReached = true;
      drafting = false;
      continue;
    }
    const followupId = await store.beginFollowup(item.id, {
      stage: decision.stage,
      ownerMessageAt: owner.receivedAt,
      dueAt: decision.dueAt,
    });
    if (!followupId) continue;
    stats.proposed++;
    // Recipient computed by code: the pipeline contact, replying to their own
    // latest message in this thread. Anything unusual → needs review, no draft.
    const recipient = customer ? replyRecipient(customer) : null;
    const ownerTo = owner.to.map((t) => t.trim().toLowerCase());
    if (
      !customer ||
      !recipient ||
      recipient.toLowerCase() !== (item.contactEmail ?? "").toLowerCase() ||
      replyToDiverges(customer) ||
      (ownerTo.length > 0 && !ownerTo.includes(recipient.toLowerCase()))
    ) {
      await store.finishFollowup(followupId, { status: "needs_review", reason: "recipient_check", flags: ["recipient_check"] });
      stats.needsReview++;
      continue;
    }
    try {
      const ownText = stripQuoted(owner.text);
      let kind = classifyOwnerMessage(owner.text);
      if (kind === "ambiguous") {
        const usageId = await store.reserve("followup_classify", followupId, params.costs.classifyCents);
        if (!usageId) {
          await store.finishFollowup(followupId, { status: "failed", reason: "budget" });
          stats.budgetExhausted = true;
          drafting = false;
          continue;
        }
        const result = await model.ownerWaiting(ownText);
        await store.addUsage(usageId, result.usage);
        kind = result.output.awaitingReply
          ? result.output.kind === "question"
            ? "question"
            : "quote"
          : "closing";
      }
      if (kind === "closing") {
        await store.finishFollowup(followupId, { status: "not_needed", reason: "owner_message_closing" });
        stats.notNeeded++;
        continue;
      }
      const usageId = await store.reserve("followup_draft", followupId, params.costs.draftCents);
      if (!usageId) {
        await store.finishFollowup(followupId, { status: "failed", reason: "budget" });
        stats.budgetExhausted = true;
        drafting = false;
        continue;
      }
      // The owner's own last message is trusted for amounts it already stated.
      const ownSource: ReplySource = {
        id: "owner_last_message",
        kind: "memory",
        name: "Votre dernier message dans cette conversation",
        content: ownText.slice(0, 3000),
      };
      const sources = [
        ...params.context.sourcesFor(`${owner.subject}\n${ownText}`.slice(0, 2000)),
        ownSource,
      ];
      const generated = await model.draftFollowup({
        ownerMessage: { ...owner, text: ownText },
        customerMessage: customer,
        stage: decision.stage,
        businessDays: settings.businessDays,
        company: params.context.company,
        sources,
      });
      await store.addUsage(usageId, generated.usage);
      // Untrusted model output: wrong shape → failed (catch below), no draft.
      const parsedDraft = replyDraftSchema.safeParse(generated.output);
      if (!parsedDraft.success) throw new Error("invalid_model_output");
      const guarded = guardDraft(parsedDraft.data, { sources, message: customer });
      const flags = [...guarded.issues.map((i) => `guard:${i}`), `owner_message:${kind}`];
      await store.finishFollowup(followupId, {
        status: "drafting",
        reason: kind,
        draftPreview: guarded.body.slice(0, 1200),
        questions: guarded.questions.map((q) => redactThirdParty(q, { thirdParties: [recipient] })).slice(0, 8),
        flags,
      });
      if (!(await store.heartbeat())) {
        stats.leaseLost = true;
        break;
      }
      const receipt = await mailbox.createReplyDraft(
        {
          idempotencyKey: followupIdempotencyKey(params.ids, item.threadId, decision.stage),
          threadId: item.threadId,
          messageId: customer.id,
          recipient,
          body: guarded.body,
        },
        store.ledger(followupId),
      );
      const mismatch =
        receipt.recipients !== undefined && (receipt.recipients.length !== 1 || receipt.recipients[0] !== recipient);
      await store.finishFollowup(followupId, {
        status: mismatch ? "needs_review" : "drafted",
        flags: mismatch ? [...flags, "recipient_mismatch"] : flags,
      });
      if (mismatch) stats.needsReview++;
      else stats.drafted++;
    } catch (error) {
      if (error instanceof MailboxPolicyError) throw error;
      if (error instanceof MailboxUncertainError) {
        await store.finishFollowup(followupId, { status: "uncertain" });
        stats.uncertain++;
        continue;
      }
      await store.finishFollowup(followupId, { status: "failed", reason: "error" });
      stats.failed++;
    }
  }
  return stats;
}

/**
 * Level 7 hook of the inbox pipeline: every actionable message (customer or
 * quote request) is attached to one pipeline item per thread. A new item gets
 * a verified structured line (one cheap, budgeted model call).
 */
export type RequestStore = {
  /** Creates the thread's item, or records a later customer message. Returns the item id when NEW. */
  upsertItem(input: {
    rowId: string;
    threadId: string;
    kind: Classification;
    contact: ReturnType<typeof contactOf>;
    receivedAt: string | null;
  }): Promise<string | null>;
  saveExtraction(
    itemId: string,
    value: { need: string | null; budget: string | null; deadline: string | null; state: "done" | "unverified" | "budget" | "failed" },
  ): Promise<void>;
  reserve(kind: UsageKind, refId: string, cents: number): Promise<string | null>;
  addUsage(usageId: string, usage: ModelUsage): Promise<void>;
};
export async function trackRequest(
  params: { store: RequestStore; model: FollowupModel; cents: number },
  input: { rowId: string; message: MailMessage; classification: Classification },
) {
  const { message } = input;
  const contact = contactOf(message);
  const itemId = await params.store.upsertItem({
    rowId: input.rowId,
    threadId: message.threadId,
    kind: input.classification,
    contact,
    receivedAt: message.receivedAt || null,
  });
  if (!itemId) return { created: false as const };
  const usageId = await params.store.reserve("request_extract", itemId, params.cents);
  if (!usageId) {
    await params.store.saveExtraction(itemId, { need: null, budget: null, deadline: null, state: "budget" });
    return { created: true as const, state: "budget" as const };
  }
  try {
    const result = await params.model.extractRequest(message);
    await params.store.addUsage(usageId, result.usage);
    const parsed = requestExtractionSchema.safeParse(result.output);
    if (!parsed.success) throw new Error("invalid_model_output");
    const verified = verifyRequest(parsed.data, message.text);
    const third = [contact.email ?? "", contact.name ?? ""].filter(Boolean);
    const clean = (v: string | null) => (v ? redactThirdParty(v, { thirdParties: third }) : null);
    await params.store.saveExtraction(itemId, {
      need: clean(verified.need),
      budget: clean(verified.budget),
      deadline: clean(verified.deadline),
      state: verified.state,
    });
    return { created: true as const, state: verified.state, rejected: verified.rejected };
  } catch {
    await params.store.saveExtraction(itemId, { need: null, budget: null, deadline: null, state: "failed" });
    return { created: true as const, state: "failed" as const };
  }
}
