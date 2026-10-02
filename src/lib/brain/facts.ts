import type { ReplySource } from "@/lib/runtime/inbox-replies";
import { fold } from "./text";

export const factCategories = [
  "pricing",
  "lead_time",
  "service_area",
  "terms",
  "hours",
  "offering",
  "tone",
  "rule",
  "other",
] as const;
export type FactCategory = (typeof factCategories)[number];
export const CATEGORY_LABELS: Record<FactCategory, string> = {
  pricing: "Prix et tarifs",
  lead_time: "Délais",
  service_area: "Zone d’intervention",
  terms: "Conditions (acompte, garantie, paiement)",
  hours: "Horaires",
  offering: "Offre et services",
  tone: "Ton et signature",
  rule: "Règles de réponse",
  other: "Autres informations",
};
/** Categories that describe HOW to write, not WHAT is true: passed as instructions. */
export const STYLE_CATEGORIES: ReadonlySet<FactCategory> = new Set([
  "tone",
  "rule",
]);
export type FactStatus = "candidate" | "approved" | "rejected" | "superseded";
export type FactOrigin = "sent_mail" | "question_answer" | "edit_diff";
export type FactQuote = { quote: string; messageId: string; sentAt: string };
export const QUOTE_MAX = 240;
export const MAX_QUOTES = 3;

export type Fact = {
  id: string;
  category: FactCategory;
  topicKey: string;
  statement: string;
  condition: string | null;
  status: FactStatus;
  origin: FactOrigin;
  quotes: FactQuote[];
  evidenceAt: string | null;
  confidence: number;
  validUntil: string | null;
  questionId: string | null;
  version: number;
  reviewedAt: string | null;
  createdAt: string;
};

/** Statement equality for dedup: accent/case/space/punctuation-insensitive. */
export const sameStatement = (a: string, b: string) =>
  fold(a).replace(/[^\p{L}\p{N}%€$£]+/gu, "") ===
  fold(b).replace(/[^\p{L}\p{N}%€$£]+/gu, "");

export function isActive(fact: Pick<Fact, "status" | "validUntil">, now = new Date()) {
  return (
    fact.status === "approved" &&
    (!fact.validUntil || Date.parse(fact.validUntil) > now.getTime())
  );
}

/**
 * Conflicts: two non-rejected, non-superseded facts with the same
 * category+topic and a different statement. Both are kept; the newest evidence
 * is shown first. Never silently choose a winner.
 */
export function factConflicts(facts: Fact[]) {
  const groups = new Map<string, Fact[]>();
  for (const f of facts) {
    if (f.status === "rejected" || f.status === "superseded") continue;
    const key = `${f.category}:${f.topicKey}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const conflicts = new Map<string, string[]>();
  for (const [key, items] of groups) {
    const distinct = items.filter(
      (f, i) => items.findIndex((g) => sameStatement(g.statement, f.statement)) === i,
    );
    if (distinct.length > 1)
      conflicts.set(
        key,
        [...items]
          .sort((a, b) => (b.evidenceAt ?? "").localeCompare(a.evidenceAt ?? ""))
          .map((f) => f.id),
      );
  }
  return conflicts;
}

/**
 * Trusted reply sources from APPROVED, unexpired facts only. Candidates,
 * rejected and superseded facts never reach the model. A topic with two
 * approved statements (should not happen: approving supersedes) is dropped.
 */
export function factSources(facts: Fact[], now = new Date()): ReplySource[] {
  const active = facts.filter((f) => isActive(f, now));
  const conflicted = new Set([...factConflicts(active).values()].flat());
  return active
    .filter((f) => !conflicted.has(f.id))
    .sort((a, b) => (b.evidenceAt ?? "").localeCompare(a.evidenceAt ?? ""))
    .slice(0, 40)
    .map((f) => ({
      id: `fact:${f.id}`,
      kind: STYLE_CATEGORIES.has(f.category) ? "instruction" : "fact",
      name: `Fiche entreprise — ${CATEGORY_LABELS[f.category]}`,
      content: f.condition
        ? `${f.statement}\nÇa dépend : ${f.condition}`
        : f.statement,
    }));
}

type FactRow = {
  id: string;
  category: FactCategory;
  topic_key: string;
  statement: string;
  condition: string | null;
  status: FactStatus;
  origin: FactOrigin;
  quotes: FactQuote[];
  evidence_at: Date | null;
  confidence: string | number;
  valid_until: Date | null;
  question_id: string | null;
  version: number;
  reviewed_at: Date | null;
  created_at: Date;
};
export const FACT_COLUMNS =
  "id,category,topic_key,statement,condition,status,origin,quotes,evidence_at,confidence,valid_until,question_id,version,reviewed_at,created_at";
export function factFromRow(r: FactRow): Fact {
  return {
    id: r.id,
    category: r.category,
    topicKey: r.topic_key,
    statement: r.statement,
    condition: r.condition,
    status: r.status,
    origin: r.origin,
    quotes: Array.isArray(r.quotes) ? r.quotes : [],
    evidenceAt: r.evidence_at ? new Date(r.evidence_at).toISOString() : null,
    confidence: Number(r.confidence),
    validUntil: r.valid_until ? new Date(r.valid_until).toISOString() : null,
    questionId: r.question_id,
    version: r.version,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
  };
}
export type { FactRow };
