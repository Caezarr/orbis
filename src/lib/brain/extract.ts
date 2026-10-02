import { createHash } from "node:crypto";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import type { ModelUsage } from "@/lib/runtime/inbox-replies";
import { buildCandidate, type CandidateFact } from "./candidates";
import type { BrainModel } from "./model";
import { stripQuoted } from "./text";

/*
 * Level 3 — company sheet from SENT mail. Bounded (window <= 90 days, <= 200
 * messages), resumable (one row per sent message; processed/skipped rows are
 * never re-billed), budgeted (reservation before every model call).
 */
export const EXTRACTION_LIMITS = { maxWindowDays: 90, maxMessages: 200 } as const;
export const CHUNK_MESSAGES = 6;
export const CHUNK_CHARS = 9000;
export const MESSAGE_CHARS = 1500;
export const MIN_OWN_CHARS = 30;

const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "me.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "proton.me",
  "protonmail.com",
  "gmx.fr",
  "gmx.com",
]);
const domainOf = (address: string) => address.split("@")[1] ?? "";

export type SentSkipReason =
  | "draft"
  | "auto_or_bulk"
  | "forward"
  | "not_a_reply"
  | "no_external_recipient"
  | "too_short";
/** Deterministic, model-free filter: only real replies to external recipients. */
export function sentSkipReason(
  message: MailMessage,
  ownerAddresses: readonly string[],
): SentSkipReason | null {
  if (message.isDraft) return "draft";
  const h = message.headers;
  if (
    (h["auto-submitted"] && h["auto-submitted"].toLowerCase() !== "no") ||
    h["x-autoreply"] ||
    h["x-autorespond"] ||
    h["list-unsubscribe"] ||
    h["list-id"] ||
    /^(bulk|list|junk)$/i.test(h.precedence ?? "") ||
    /^(out of office|automatic reply|auto[- ]?reply|réponse automatique|absence)\b/i.test(
      message.subject.trim(),
    )
  )
    return "auto_or_bulk";
  const subject = message.subject.trim();
  if (/^(fwd?|tr|wg|fw)\s*:/i.test(subject)) return "forward";
  if (!/^(re|ré|réf|ref|aw|sv|antw|r)\s*:/i.test(subject) && !h["in-reply-to"])
    return "not_a_reply";
  const owners = new Set(ownerAddresses);
  const ownerDomains = new Set(
    ownerAddresses.map(domainOf).filter((d) => d && !PUBLIC_DOMAINS.has(d)),
  );
  const external = message.to.filter(
    (a) =>
      !owners.has(a) &&
      !ownerDomains.has(domainOf(a)) &&
      !/^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster)/i.test(a),
  );
  if (!external.length) return "no_external_recipient";
  if (stripQuoted(message.text).length < MIN_OWN_CHARS) return "too_short";
  return null;
}

export const sentHash = (m: MailMessage) =>
  createHash("sha256")
    .update(JSON.stringify([m.provider, m.id, m.subject, m.text]))
    .digest("hex");

export type ExtractionStore = {
  /** Insert-or-get the per-message row; status != pending means already handled. */
  upsertSent(
    message: MailMessage,
    hash: string,
  ): Promise<{ rowId: string; status: "pending" | "processed" | "skipped" }>;
  markSent(
    rowIds: string[],
    status: "processed" | "skipped",
    detail?: { reason?: string; factsFound?: Record<string, number> },
  ): Promise<void>;
  /** Reserve estimated cost before a model call; returns a usage id or null (cap reached). */
  reserve(cents: number): Promise<string | null>;
  addUsage(usageId: string, usage: ModelUsage): Promise<void>;
  saveCandidates(
    candidates: CandidateFact[],
  ): Promise<{ inserted: number; merged: number; skipped: number }>;
  heartbeat(): Promise<boolean>;
};
export type ExtractionStats = {
  listed: number;
  skipped: number;
  reused: number;
  processed: number;
  modelCalls: number;
  candidates: number;
  merged: number;
  rejectedQuotes: number;
  budgetExhausted: boolean;
  leaseLost: boolean;
  yielded?: boolean;
};

export async function processExtraction(params: {
  job: { windowDays: number; maxMessages: number };
  mailbox: { listSent(input: { windowDays: number; maxMessages: number }): Promise<MailMessage[]> };
  model: BrainModel;
  store: ExtractionStore;
  company?: string;
  /** Trusted company text (website profile): its phone numbers are kept. */
  trustedText?: string;
  cents: number;
  shouldYield?: () => boolean;
}): Promise<ExtractionStats> {
  const { job, mailbox, model, store } = params;
  const stats: ExtractionStats = {
    listed: 0,
    skipped: 0,
    reused: 0,
    processed: 0,
    modelCalls: 0,
    candidates: 0,
    merged: 0,
    rejectedQuotes: 0,
    budgetExhausted: false,
    leaseLost: false,
  };
  const messages = (
    await mailbox.listSent({
      windowDays: Math.min(job.windowDays, EXTRACTION_LIMITS.maxWindowDays),
      maxMessages: Math.min(job.maxMessages, EXTRACTION_LIMITS.maxMessages),
    })
  )
    .slice(0, EXTRACTION_LIMITS.maxMessages)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  stats.listed = messages.length;
  const owners = [
    ...new Set(messages.map((m) => m.from?.address).filter((a): a is string => !!a)),
  ];
  const pending: { rowId: string; message: MailMessage; own: string }[] = [];
  for (const message of messages) {
    const row = await store.upsertSent(message, sentHash(message));
    if (row.status !== "pending") {
      stats.reused++;
      continue;
    }
    const reason = sentSkipReason(message, owners);
    if (reason) {
      await store.markSent([row.rowId], "skipped", { reason });
      stats.skipped++;
      continue;
    }
    pending.push({
      rowId: row.rowId,
      message,
      own: stripQuoted(message.text).slice(0, MESSAGE_CHARS),
    });
  }
  // Chunks of a few messages per model call (bounded call count and cost).
  const chunks: (typeof pending)[] = [];
  for (const item of pending) {
    const last = chunks.at(-1);
    const size = last?.reduce((n, i) => n + i.own.length, 0) ?? 0;
    if (!last || last.length >= CHUNK_MESSAGES || size + item.own.length > CHUNK_CHARS)
      chunks.push([item]);
    else last.push(item);
  }
  for (const chunk of chunks) {
    if (params.shouldYield?.()) {
      stats.yielded = true;
      break;
    }
    if (!(await store.heartbeat())) {
      stats.leaseLost = true;
      break;
    }
    const usageId = await store.reserve(params.cents);
    if (!usageId) {
      stats.budgetExhausted = true;
      break;
    }
    const refs = new Map(chunk.map((item, i) => [`m${i + 1}`, item]));
    const result = await model.extract({
      company: params.company,
      messages: [...refs].map(([ref, item]) => ({
        ref,
        sentAt: item.message.receivedAt,
        text: item.own,
      })),
    });
    stats.modelCalls++;
    await store.addUsage(usageId, result.usage);
    const found: Record<string, number> = {};
    const candidates: CandidateFact[] = [];
    for (const fact of result.output.facts) {
      const candidate = buildCandidate(
        {
          ...fact,
          quotes: fact.quotes.map((q) => {
            const item = refs.get(q.ref);
            return {
              quote: q.quote,
              evidence: item && {
                text: item.own,
                messageId: item.message.id,
                sentAt: item.message.receivedAt,
                redaction: {
                  ownerAddresses: owners,
                  thirdParties: item.message.to.filter(
                    (a) => !owners.includes(a),
                  ),
                  trustedText: params.trustedText,
                },
              },
            };
          }),
        },
        "sent_mail",
      );
      if (!candidate) {
        stats.rejectedQuotes++;
        continue;
      }
      candidates.push(candidate);
      for (const q of candidate.quotes) {
        const rowId = [...refs.values()].find((i) => i.message.id === q.messageId)?.rowId;
        if (rowId) found[rowId] = (found[rowId] ?? 0) + 1;
      }
    }
    const saved = await store.saveCandidates(candidates);
    stats.candidates += saved.inserted;
    stats.merged += saved.merged;
    await store.markSent(
      chunk.map((i) => i.rowId),
      "processed",
      { factsFound: found },
    );
    stats.processed += chunk.length;
  }
  return stats;
}
