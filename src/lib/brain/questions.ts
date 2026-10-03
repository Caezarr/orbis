import { PLACEHOLDER_CLOSE, PLACEHOLDER_OPEN } from "@/lib/runtime/inbox-replies";
import { fold, redactThirdParty, type RedactionContext } from "./text";

/*
 * "Une question, une seule fois." Each [[À CONFIRMER : X]] placeholder (and each
 * matching model question) becomes ONE deduplicated question per workspace.
 * Dedup is deterministic and embedding-free: a canonical key built from content
 * words (accent-folded, stopwords removed, light stemming, small synonym map),
 * then Jaccard similarity >= MATCH_THRESHOLD against existing keys.
 */
export const MATCH_THRESHOLD = 0.6;

const STOPWORDS = new Set(
  (
    "a à au aux avec ce ces cet cette d de des du en et est il ils je la le les leur leurs ma mais me mes mon ne nos notre nous on ou où par pas pour qu que quel quelle quelles quels qui sa se ses son sur ta te tes ton tu un une vos votre vous y " +
    "confirmer confirmé confirme verifier vérifier preciser préciser indiquer svp merci " +
    "the a an of to for and or is are what which when how do does our your on in at by with be it this that please confirm"
  )
    .split(/\s+/)
    .map(fold),
);
const SYNONYMS: Record<string, string> = {
  tarif: "prix",
  tarifs: "prix",
  cout: "prix",
  couts: "prix",
  montant: "prix",
  price: "prix",
  pricing: "prix",
  cost: "prix",
  devis: "devis",
  quote: "devis",
  delai: "delai",
  delais: "delai",
  duree: "delai",
  lead: "delai",
  dispo: "disponibilite",
  disponibilites: "disponibilite",
  availability: "disponibilite",
  date: "date",
  dates: "date",
  m2: "m2",
  "m²": "m2",
  metre: "m2",
  metres: "m2",
  carre: "m2",
  carres: "m2",
  horaire: "horaire",
  horaires: "horaire",
  heures: "horaire",
  ouverture: "horaire",
  hours: "horaire",
  acompte: "acompte",
  arrhes: "acompte",
  deposit: "acompte",
  garantie: "garantie",
  warranty: "garantie",
  zone: "zone",
  secteur: "zone",
  area: "zone",
  livraison: "livraison",
  delivery: "livraison",
  deplacement: "deplacement",
  intervention: "intervention",
};
function stem(word: string) {
  if (SYNONYMS[word]) return SYNONYMS[word];
  const singular = word.length > 4 ? word.replace(/(s|x)$/, "") : word;
  return SYNONYMS[singular] ?? singular;
}
export function questionTokens(text: string) {
  return [
    ...new Set(
      fold(text)
        .replace(/m²/g, "m2")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((w) => w && !STOPWORDS.has(w) && !/^\d+$/.test(w))
        .map(stem)
        .filter((w) => w.length >= 2),
    ),
  ].sort();
}
export const canonicalKey = (text: string) => questionTokens(text).join(" ").slice(0, 200);
export function similarity(a: string, b: string) {
  const x = new Set(a.split(" ").filter(Boolean));
  const y = new Set(b.split(" ").filter(Boolean));
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}
/** Best existing question for a key (same or similar enough), else undefined. */
export function matchQuestion<T extends { canonicalKey: string }>(
  key: string,
  existing: readonly T[],
) {
  let best: { item: T; score: number } | undefined;
  for (const item of existing) {
    const score = item.canonicalKey === key ? 1 : similarity(key, item.canonicalKey);
    if (score >= MATCH_THRESHOLD && (!best || score > best.score))
      best = { item, score };
  }
  return best?.item;
}

/** Guard-generated placeholders are draft-specific, not reusable company facts. */
const GENERIC = new Set(["montant", "adresse e-mail", "lien", "telephone"].map(fold));
const PLACEHOLDER = new RegExp(
  `${escape(PLACEHOLDER_OPEN)}\\s*(?:À|A|TO)\\s*CONFIRM(?:ER|)\\s*:?\\s*([^\\]]{2,240})${escape(PLACEHOLDER_CLOSE)}`,
  "giu",
);
function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Questions raised by one guarded draft: placeholder texts + the model's own
 * questions (guard "Montant à confirmer (proposé …)" lines excluded), deduped
 * by canonical key, redacted of third-party data, at most 6.
 */
export function draftQuestions(
  body: string,
  questions: readonly string[],
  redaction: RedactionContext = {},
) {
  const raw = [
    ...[...body.matchAll(PLACEHOLDER)].map((m) => m[1]),
    ...questions.filter((q) => !/^Montant à confirmer \(proposé/i.test(q)),
  ];
  const out = new Map<string, string>();
  for (const text of raw) {
    // A combined placeholder "a ; b" (guard prefix) is split back.
    for (const part of text.split(/\s;\s/)) {
      const label = redactThirdParty(part.trim(), redaction)
        .replace(/\s+/g, " ")
        .slice(0, 200);
      if (!label || GENERIC.has(fold(label))) continue;
      const key = canonicalKey(label);
      if (!key || matchQuestion(key, [...out.keys()].map((k) => ({ canonicalKey: k }))))
        continue;
      out.set(key, label);
    }
  }
  return [...out].slice(0, 6).map(([key, label]) => ({ canonicalKey: key, label }));
}
