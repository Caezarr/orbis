import {
  MAX_QUOTES,
  QUOTE_MAX,
  sameStatement,
  type Fact,
  type FactCategory,
  type FactOrigin,
  type FactQuote,
} from "./facts";
import { injectionSignals } from "@/lib/runtime/inbox-replies";
import {
  contactsSupported,
  normalizeModelText,
  unsupportedNumbers,
} from "@/lib/security/untrusted-text";
import {
  redactThirdParty,
  topicKey,
  verifyQuote,
  type RedactionContext,
} from "./text";

/** A validated, redacted fact candidate ready to store (never approved here). */
export type CandidateFact = {
  category: FactCategory;
  topicKey: string;
  statement: string;
  quotes: FactQuote[];
  evidenceAt: string | null;
  confidence: number;
  origin: FactOrigin;
  inboxMessageId?: string;
};

export type QuoteEvidence = {
  /** The exact owner-written text the model saw. */
  text: string;
  messageId: string;
  sentAt: string;
  redaction: RedactionContext;
};
/**
 * Schema-validated model output → stored candidate, or null. Every quote must be
 * an exact substring of the owner text it claims to come from; quotes and the
 * statement are redacted of third-party data AFTER verification.
 */
export function buildCandidate(
  raw: {
    category: FactCategory;
    topic: string;
    statement: string;
    confidence?: number;
    quotes: { quote: string; evidence: QuoteEvidence | undefined }[];
  },
  origin: FactOrigin,
  extra: { inboxMessageId?: string } = {},
): CandidateFact | null {
  const quotes: FactQuote[] = [];
  let redaction: RedactionContext = {};
  const verified: string[] = [];
  for (const q of raw.quotes) {
    if (!q.evidence || !verifyQuote(q.quote, q.evidence.text)) continue;
    // A fact is never an instruction, even when the owner's text contains one
    // (e.g. forwarded content pasted without quote headers).
    if (injectionSignals(q.quote).length) continue;
    verified.push(q.quote);
    redaction = mergeRedaction(redaction, q.evidence.redaction);
    quotes.push({
      quote: redactThirdParty(q.quote.trim(), q.evidence.redaction).slice(0, QUOTE_MAX),
      messageId: q.evidence.messageId,
      sentAt: q.evidence.sentAt,
    });
  }
  if (!quotes.length) return null;
  // The statement is model text: it may not add contact data (links, bare
  // domains, emails, phones), figures or instructions that its verified quotes
  // do not contain. Such a candidate is dropped, never "fixed".
  const support = verified.join("\n");
  const rawStatement = normalizeModelText(raw.statement);
  if (
    injectionSignals(rawStatement).length ||
    !contactsSupported(rawStatement, support) ||
    unsupportedNumbers(rawStatement, support).length
  )
    return null;
  const statement = redactThirdParty(raw.statement.trim(), redaction)
    .replace(/\s+/g, " ")
    .slice(0, 400);
  if (statement.length < 3) return null;
  return {
    category: raw.category,
    topicKey: topicKey(raw.topic),
    statement,
    quotes: quotes.slice(0, MAX_QUOTES),
    evidenceAt: quotes.map((q) => q.sentAt).sort().at(-1) ?? null,
    confidence: Math.min(1, Math.max(0, raw.confidence ?? 0.5)),
    origin,
    ...(extra.inboxMessageId ? { inboxMessageId: extra.inboxMessageId } : {}),
  };
}
function mergeRedaction(a: RedactionContext, b: RedactionContext): RedactionContext {
  return {
    ownerAddresses: [...(a.ownerAddresses ?? []), ...(b.ownerAddresses ?? [])],
    thirdParties: [...(a.thirdParties ?? []), ...(b.thirdParties ?? [])],
    trustedText: b.trustedText ?? a.trustedText,
  };
}

export type CandidatePlan =
  | { action: "insert" }
  | { action: "merge"; factId: string; quotes: FactQuote[]; evidenceAt: string | null }
  | { action: "skip"; reason: "rejected_before" | "duplicate" };
/**
 * Dedup against what is already stored for the same category+topic:
 *  - same statement already rejected → skip (never re-propose a rejected fact);
 *  - same statement candidate/approved/superseded → add the new quotes (max 3,
 *    newest kept) without changing its status;
 *  - otherwise insert a new candidate (a different statement = a conflict, shown
 *    to the owner; both are kept).
 */
export function planCandidate(candidate: CandidateFact, existing: readonly Fact[]): CandidatePlan {
  const same = existing.filter(
    (f) =>
      f.category === candidate.category &&
      f.topicKey === candidate.topicKey &&
      sameStatement(f.statement, candidate.statement),
  );
  if (same.some((f) => f.status === "rejected"))
    return { action: "skip", reason: "rejected_before" };
  const target = same[0];
  if (!target) return { action: "insert" };
  const known = new Set(target.quotes.map((q) => `${q.messageId}:${q.quote}`));
  const added = candidate.quotes.filter((q) => !known.has(`${q.messageId}:${q.quote}`));
  if (!added.length) return { action: "skip", reason: "duplicate" };
  const quotes = [...target.quotes, ...added]
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
    .slice(0, MAX_QUOTES);
  const evidenceAt = [target.evidenceAt, candidate.evidenceAt]
    .filter((d): d is string => !!d)
    .sort()
    .at(-1) ?? null;
  return { action: "merge", factId: target.id, quotes, evidenceAt };
}
