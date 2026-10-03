import { flagLabel, splitPlaceholders, type InboxMessageView } from "@/lib/start/flow";

/**
 * Pure view logic for Today (decisions first). No fetch, no DOM: tested in
 * today-view.test.ts.
 */

/** What Orbi was unsure about in a draft: its questions, its [[À CONFIRMER]] spots and its warnings. */
export function uncertainties(m: Pick<InboxMessageView, "questions" | "draftPreview" | "flags">) {
  const items: string[] = [];
  const seen = new Set<string>();
  const add = (text: string | null | undefined) => {
    const value = text?.replace(/^À CONFIRMER\s*:\s*/i, "").trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(value);
  };
  for (const q of m.questions) add(q);
  const asked = m.questions.join(" ").toLowerCase();
  for (const part of splitPlaceholders(m.draftPreview ?? ""))
    if (part.placeholder) {
      // A spot already covered by one of Orbi's questions is not listed twice.
      const spot = part.text.replace(/^À CONFIRMER\s*:\s*/i, "").trim().toLowerCase();
      if (!spot || !asked.includes(spot)) add(part.text);
    }
  const warnings = [...new Set(m.flags.map(flagLabel).filter((v): v is string => !!v))];
  return { items, warnings };
}

export type TodayShortcut = "next" | "previous" | "open" | "answer";

/** j/k/o/e, only when the user is not typing and no modifier is held. */
export function shortcutFor(e: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}): TodayShortcut | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  const tag = e.target?.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) return null;
  switch (e.key) {
    case "j":
      return "next";
    case "k":
      return "previous";
    case "o":
      return "open";
    case "e":
      return "answer";
    default:
      return null;
  }
}

/** Moves the selection, clamped (no wrap: the end of the list is a real end). */
export function moveSelection(current: number, delta: 1 | -1, length: number) {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return Math.min(length - 1, Math.max(0, current + delta));
}

export type TodayState =
  /** No completed first run on a mailbox: the next step is /start. */
  | "connect"
  /** First run done, continuous drafting off: new mail is not read. */
  | "continuous_off"
  /** Everything is on and nothing waits. */
  | "quiet"
  /** At least one decision waits. */
  | "decisions";

export function todayState(d: {
  drafts: number;
  questions: number;
  followups: number;
  settings: { eligible: boolean; continuousEnabled: boolean; provider?: string };
}): TodayState {
  if (d.drafts + d.questions + d.followups > 0) return "decisions";
  if (!d.settings.eligible && !d.settings.continuousEnabled) return "connect";
  if (!d.settings.continuousEnabled) return "continuous_off";
  return "quiet";
}

export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function mailboxName(provider?: string) {
  return provider === "outlook" ? "Outlook" : provider === "gmail" ? "Gmail" : "votre boîte mail";
}
