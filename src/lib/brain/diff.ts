import { fold, stripQuoted } from "./text";

/*
 * Level 5 — draft vs sent. Deterministic outcome classification; the model is
 * only asked to EXPLAIN an edit, never to decide the outcome.
 */
export type Outcome = "pending" | "sent_as_is" | "sent_edited" | "not_used";
/** Similarity at or above which a sent reply counts as the draft sent as is. */
export const AS_IS_THRESHOLD = 0.9;
/**
 * Share of the draft's words kept, in order, in the sent reply (LCS / draft
 * length). Below this the owner wrote a different reply: the draft was not used.
 * Kept separate from similarity so a short draft the owner completed (filled a
 * placeholder, added a sentence) counts as edited, not as unused.
 */
export const RETAINED_THRESHOLD = 0.5;
/** Without a sent reply after this long, the draft is counted as not used. */
export const NOT_USED_AFTER_MS = 7 * 86_400_000;
const MAX_TOKENS = 600;

const tokens = (text: string) =>
  fold(text)
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/[^\p{L}\p{N}€$£%]+/gu, " ")
    .split(" ")
    .filter(Boolean)
    .slice(0, MAX_TOKENS);

/** Word-level Levenshtein distance (bounded inputs: O(n·m) on <= 600 tokens). */
export function wordDistance(a: string[], b: string[]) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = cur;
  }
  return prev[b.length];
}
/** Longest common subsequence of words (bounded inputs). */
export function lcsLength(a: string[], b: string[]) {
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = [0];
    for (let j = 1; j <= b.length; j++)
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[b.length];
}
/** Share of the draft's words that survive, in order, in the sent text. */
export function retainedRatio(draft: string, sent: string) {
  const a = tokens(draft);
  if (!a.length) return 0;
  return lcsLength(a, tokens(sent)) / a.length;
}
/** 1 = identical wording, 0 = nothing in common. */
export function similarityRatio(draft: string, sent: string) {
  const a = tokens(draft);
  const b = tokens(sent);
  if (!a.length && !b.length) return 1;
  // The stored draft preview is capped (1,200 chars): compare like with like.
  const bb = b.slice(0, Math.max(a.length + 40, Math.ceil(a.length * 1.5)));
  return 1 - wordDistance(a, bb) / Math.max(a.length, bb.length);
}

export type SentReply = { id: string; sentAt: string; text: string };
/**
 * First owner reply sent after the draft was created decides the outcome.
 * Placeholder markers left in the draft are ignored for the ratio, so filling
 * a [[À CONFIRMER]] counts as an edit only through the words the owner added.
 */
export function classifyOutcome(input: {
  draft: string;
  draftedAt: string;
  sent: SentReply[];
  now: Date;
}): { outcome: Outcome; similarity?: number; reply?: SentReply & { own: string } } {
  const reply = input.sent
    .filter((s) => s.sentAt && s.sentAt >= input.draftedAt)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))[0];
  if (!reply) {
    const age = input.now.getTime() - Date.parse(input.draftedAt);
    return { outcome: age > NOT_USED_AFTER_MS ? "not_used" : "pending" };
  }
  const own = stripQuoted(reply.text);
  const ratio = Math.round(similarityRatio(input.draft, own) * 1000) / 1000;
  const outcome =
    ratio >= AS_IS_THRESHOLD
      ? "sent_as_is"
      : retainedRatio(input.draft, own) >= RETAINED_THRESHOLD
        ? "sent_edited"
        : "not_used";
  return { outcome, similarity: ratio, reply: { ...reply, own } };
}
