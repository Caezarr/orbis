import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import { stripQuoted } from "@/lib/brain/text";
import { followupDueAt } from "./calendar";

/*
 * Level 6/7 decisions in code (pure, testable). The model is only asked when
 * the owner's last message is ambiguous; everything else is decided here:
 * who the customer is, whether the owner is waiting, when a follow-up is due,
 * which stage, and the pipeline status.
 */
export type PipelineStatus = "nouveau" | "repondu" | "relance" | "gagne" | "perdu";
export const PIPELINE_STATUSES: readonly PipelineStatus[] = ["nouveau", "repondu", "relance", "gagne", "perdu"];
export const STATUS_LABELS: Record<PipelineStatus, string> = {
  nouveau: "Nouveau",
  repondu: "Répondu",
  relance: "Relancé",
  gagne: "Gagné",
  perdu: "Perdu",
};
export const MAX_STAGES = 2;

export type ThreadObservation = {
  /** First owner message after the customer's first request (response time). */
  firstRepliedAt: string | null;
  lastOwnerAt: string | null;
  lastCustomerAt: string | null;
  /** Owner's latest sent message (for classification) and the customer's latest message (reply target). */
  lastOwner: MailMessage | null;
  lastCustomer: MailMessage | null;
  /** The owner wrote last: the ball is in the customer's court. */
  awaitingCustomer: boolean;
};

const norm = (a?: string | null) => (a ?? "").trim().toLowerCase();
/**
 * Reads one thread from the customer's point of view. Only messages from the
 * pipeline contact count as customer messages (cc'd colleagues, suppliers and
 * forwarded notifications are ignored); drafts never count.
 */
export function observeThread(
  thread: readonly MailMessage[],
  contactEmail: string,
  firstCustomerAt: string | null,
): ThreadObservation {
  const contact = norm(contactEmail);
  const real = thread.filter((m) => !m.isDraft && m.receivedAt);
  const owner = real.filter((m) => m.fromOwner).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const customer = real
    .filter((m) => !m.fromOwner && norm(m.from?.address) === contact)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const start = firstCustomerAt ?? customer[0]?.receivedAt ?? null;
  const firstReply = start ? owner.find((m) => m.receivedAt > start) : undefined;
  const lastOwner = owner.at(-1) ?? null;
  const lastCustomer = customer.at(-1) ?? null;
  return {
    firstRepliedAt: firstReply?.receivedAt ?? null,
    lastOwnerAt: lastOwner?.receivedAt ?? null,
    lastCustomerAt: lastCustomer?.receivedAt ?? null,
    lastOwner,
    lastCustomer,
    awaitingCustomer: !!lastOwner && (!lastCustomer || lastOwner.receivedAt > lastCustomer.receivedAt),
  };
}

/** Automatic status (manual gagné/perdu always wins until reopened). */
export function autoStatus(item: { firstRepliedAt: string | null; relanceAt: string | null }): PipelineStatus {
  if (item.relanceAt) return "relance";
  if (item.firstRepliedAt) return "repondu";
  return "nouveau";
}
export function nextStatus(
  current: PipelineStatus,
  item: { firstRepliedAt: string | null; relanceAt: string | null },
): PipelineStatus {
  if (current === "gagne" || current === "perdu") return current;
  const auto = autoStatus(item);
  // Monotonic: nouveau → répondu → relancé (a later customer reply never regresses it).
  const rank: Record<PipelineStatus, number> = { nouveau: 0, repondu: 1, relance: 2, gagne: 3, perdu: 3 };
  return rank[auto] >= rank[current] ? auto : current;
}

export type OwnerMessageKind = "quote" | "question" | "closing" | "ambiguous";
const MONEY = /(?:[€$£]\s?\d|\d[\d\s.,]*\s?(?:€|\$|£|(?:eur|euros?|ht|ttc)\b))/i;
const QUOTE_WORDS = /\b(devis|offre|proposition|estimation|chiffrage|tarifs?|bon de commande|quote|quotation|estimate|proposal)\b/i;
const CLOSING = /\b(merci|bonne (journée|soirée|fin de journée|continuation)|à bientôt|c'est noté|c’est noté|bien reçu|parfait|entendu|avec plaisir|thanks|thank you|noted)\b/i;
/**
 * Does the owner's last message wait for a customer answer? Decided by code
 * when clear; "ambiguous" goes to the cheap classifier.
 */
export function classifyOwnerMessage(text: string): OwnerMessageKind {
  const own = stripQuoted(text);
  if (!own.trim()) return "ambiguous";
  if (MONEY.test(own) || QUOTE_WORDS.test(own)) return "quote";
  if (/\?/.test(own)) return "question";
  if (own.length <= 220 && CLOSING.test(own)) return "closing";
  return "ambiguous";
}

export type FollowupState = {
  stage: number;
  status: string;
  draftedAt: string | null;
  ownerMessageAt: string;
  draftState?: string;
};
/**
 * A stage row that produced no draft can be reconsidered (same row, same
 * stage): "not_needed" once the owner wrote a newer message, "failed" (model or
 * provider error) on the next check.
 */
export function reconsiderable(f: FollowupState, lastOwnerAt: string | null) {
  if (f.draftedAt || (f.draftState && f.draftState !== "none")) return false;
  if (f.status === "failed") return true;
  return f.status === "not_needed" && !!lastOwnerAt && lastOwnerAt > f.ownerMessageAt;
}
export type FollowupContext = {
  status: PipelineStatus;
  followupsDismissed: boolean;
  snoozedUntil: string | null;
  contactEmail: string | null;
  businessDays: number;
  maxStages: number;
  enabled: boolean;
  existing: readonly FollowupState[];
};
export type FollowupDecision =
  | { action: "propose"; stage: number; dueAt: string }
  | { action: "wait"; dueAt: string }
  | { action: "none"; reason: string };
/**
 * Stage logic. Stage 1: owner wrote last and no customer reply for N business
 * days. Stage 2: only after the owner actually SENT something after the stage-1
 * draft (otherwise the first follow-up is still waiting in the mailbox), then
 * again N business days without a reply. Never more than `maxStages` (≤ 2),
 * one row per (thread, stage).
 */
export function decideFollowup(
  obs: Pick<ThreadObservation, "awaitingCustomer" | "lastOwnerAt">,
  ctx: FollowupContext,
  now: Date,
): FollowupDecision {
  if (!ctx.enabled) return { action: "none", reason: "disabled" };
  if (ctx.status === "gagne" || ctx.status === "perdu") return { action: "none", reason: "closed" };
  if (ctx.followupsDismissed) return { action: "none", reason: "dismissed" };
  if (!ctx.contactEmail) return { action: "none", reason: "no_contact" };
  if (!obs.awaitingCustomer || !obs.lastOwnerAt) return { action: "none", reason: "not_awaiting" };
  const maxStages = Math.min(MAX_STAGES, Math.max(1, ctx.maxStages));
  const done = ctx.existing
    .filter((f) => !reconsiderable(f, obs.lastOwnerAt))
    .sort((a, b) => a.stage - b.stage);
  const last = done.at(-1);
  if (last) {
    if (last.stage >= maxStages) return { action: "none", reason: "max_stages" };
    // Previous follow-up not sent yet by the owner (or never drafted): no new stage.
    if (!last.draftedAt || obs.lastOwnerAt <= last.draftedAt) return { action: "none", reason: "previous_pending" };
  }
  const stage = (last?.stage ?? 0) + 1;
  const dueAt = followupDueAt(new Date(obs.lastOwnerAt), ctx.businessDays).toISOString();
  if (now.toISOString() < dueAt) return { action: "wait", dueAt };
  if (ctx.snoozedUntil && now.toISOString() < ctx.snoozedUntil) return { action: "wait", dueAt: ctx.snoozedUntil };
  return { action: "propose", stage, dueAt };
}

/** When to read the thread again (null = stop tracking). */
export function nextCheckAt(
  item: { status: PipelineStatus; createdAt: string; firstRepliedAt: string | null },
  decision: FollowupDecision,
  now: Date,
): string | null {
  if (item.status === "gagne" || item.status === "perdu") return null;
  if (now.getTime() - new Date(item.createdAt).getTime() > 60 * 86_400_000) return null;
  const hours = item.firstRepliedAt ? 24 : 6;
  const regular = new Date(now.getTime() + hours * 3_600_000).toISOString();
  if (decision.action === "wait" && decision.dueAt < regular) return decision.dueAt;
  return regular;
}

/** Contact data kept for the owner's own pipeline (minimal: name ≤120, address, domain). */
export function contactOf(message: Pick<MailMessage, "from">) {
  const email = norm(message.from?.address);
  if (!email || !email.includes("@")) return { name: null, email: null, domain: null };
  const name = (message.from?.name ?? "").replace(/[\r\n<>"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || null;
  return { name, email: email.slice(0, 254), domain: email.split("@")[1]!.slice(0, 253) };
}
/** For logs/errors: never the full address. */
export function maskEmail(email: string | null | undefined) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  return `${(local ?? "").slice(0, 1)}***@${domain ?? ""}`;
}
