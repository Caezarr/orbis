import { z } from "zod";
import { fold } from "@/lib/brain/text";
import { injectionSignals } from "@/lib/runtime/inbox-replies";
import { hasContactData, normalizeModelText, unsupportedNumbers } from "@/lib/security/untrusted-text";

/*
 * Level 7: structured request line from ONE inbound customer email.
 * The model proposes a short need summary with a supporting quote, and the
 * budget / deadline only as verbatim quotes. Code keeps a value only when its
 * quote is an exact substring of the email text the model received; otherwise
 * the field stays empty. Nothing is inferred, completed or estimated.
 */
export const requestExtractionSchema = z.object({
  need: z.string().max(200),
  needQuote: z.string().max(300),
  budgetQuote: z.string().max(120).nullable(),
  deadlineQuote: z.string().max(120).nullable(),
});
export type RequestExtraction = z.infer<typeof requestExtractionSchema>;
export type VerifiedRequest = {
  need: string | null;
  budget: string | null;
  deadline: string | null;
  /** done = need verified; unverified = the need quote was not found verbatim. */
  state: "done" | "unverified";
  rejected: string[];
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** Exact quote check, whitespace-insensitive only (no case/accent folding). */
export function quoteIn(quote: string | null | undefined, text: string, min = 4) {
  const q = squash(quote ?? "");
  return q.length >= min && squash(text).includes(q);
}
const HAS_AMOUNT = /\d/;
const DEADLINE_HINT =
  /\b(\d{1,2}[/.-]\d{1,2}|\d{1,2}(er)?\s+(janv|févr|fevr|mars|avr|mai|juin|juil|août|aout|sept|oct|nov|déc|dec)|janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|semaine|mois|jours?|demain|urgent|asap|rapidement|avant|d'ici|d’ici|fin|début|debut|mi-|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|week|month|days?|before|by)\b/i;
const BUDGET_HINT = /(€|\beur\b|euros?|\bk€|budget|\bht\b|\bttc\b|\$|£)/i;

/** Verbatim customer text is still kept out of the list when it carries contact data or instructions. */
const safeQuote = (q: string) => !hasContactData(q) && injectionSignals(q).length === 0;
export function verifyRequest(output: RequestExtraction, emailText: string): VerifiedRequest {
  const rejected: string[] = [];
  let need: string | null = null;
  // The summary is model text: it is kept only when its supporting quote is
  // verbatim AND the summary shares content words with that quote.
  if (quoteIn(output.needQuote, emailText, 8)) {
    const summary = squash(output.need).slice(0, 160);
    const words = (t: string) => new Set(fold(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
    const quoteWords = words(output.needQuote);
    const overlap = [...words(summary)].filter((w) => quoteWords.has(w)).length;
    // The summary is model text shown in the owner's request list: it must not
    // carry contact data, instructions or a figure absent from its quote.
    const unsafe =
      hasContactData(summary) ||
      injectionSignals(summary).length > 0 ||
      injectionSignals(output.needQuote).length > 0 ||
      unsupportedNumbers(summary, output.needQuote).length > 0;
    if (unsafe) rejected.push("need_unsafe");
    else if (summary.length >= 3 && overlap >= 1) need = normalizeModelText(summary);
    else rejected.push("need_unsupported");
  } else rejected.push("need_quote");
  let budget: string | null = null;
  if (output.budgetQuote) {
    if (quoteIn(output.budgetQuote, emailText) && HAS_AMOUNT.test(output.budgetQuote) && BUDGET_HINT.test(output.budgetQuote) && safeQuote(output.budgetQuote))
      budget = squash(output.budgetQuote).slice(0, 80);
    else rejected.push("budget_quote");
  }
  let deadline: string | null = null;
  if (output.deadlineQuote) {
    if (quoteIn(output.deadlineQuote, emailText) && DEADLINE_HINT.test(output.deadlineQuote) && safeQuote(output.deadlineQuote))
      deadline = squash(output.deadlineQuote).slice(0, 80);
    else rejected.push("deadline_quote");
  }
  return { need, budget, deadline, state: need ? "done" : "unverified", rejected };
}
