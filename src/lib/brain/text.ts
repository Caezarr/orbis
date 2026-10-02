/*
 * Deterministic text helpers of the company brain. Everything that decides
 * what is stored or trusted lives here, in code, not in prompts:
 *  - stripQuoted(): keep only what the mailbox owner wrote in a reply.
 *  - verifyQuote(): a model-proposed quote must be an exact substring.
 *  - redactThirdParty(): remove customer names / emails / phones before storage.
 */

/** Lowercase, accent-folded, whitespace-collapsed. */
export function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const QUOTE_HEADER = [
  // French / English / German reply headers ("Le 2 oct. 2026 à 10:00, X a écrit :").
  /^\s*(le|on|am)\b.{0,200}\b(a écrit|wrote|schrieb)\s*:?\s*$/im,
  /^\s*-{2,}\s*(original message|message d'origine|message original|ursprüngliche nachricht)\s*-{2,}/im,
  /^\s*(de|from)\s*:.+\n\s*(envoyé|sent|date)\s*:/im,
  /^_{8,}\s*$/m,
];
/** Text written by the owner in a reply: quoted history and forwarded blocks removed. */
export function stripQuoted(text: string) {
  let cut = text.length;
  for (const re of QUOTE_HEADER) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text
    .slice(0, cut)
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Exact-substring check of a model-proposed quote against the owner's text. */
export function verifyQuote(quote: string, text: string) {
  const q = quote.trim();
  return q.length >= 8 && text.includes(q);
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]){3,6}\d{2,4}/g;
const TITLE_NAME =
  /\b(M\.|Mme|Mlle|Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Me|Madame|Monsieur|Mademoiselle|Maître)\s+[A-ZÀ-Ý][\p{L}'’-]+(?:\s+[A-ZÀ-Ý][\p{L}'’-]+)?/gu;
const GREETING_NAME =
  /\b(Bonjour|Bonsoir|Salut|Hello|Hi|Dear|Cher|Chère|Chers|Hallo)\s+(?!(?:[Mm]adame|[Mm]onsieur|[Mm]essieurs|[Tt]ous|[Tt]outes|[Ee]veryone|[Aa]ll|[Tt]eam|[Éé]quipe)\b|\[)([A-ZÀ-Ý][\p{L}'’-]+(?:[ -][A-ZÀ-Ý][\p{L}'’-]+)?)/gu;

export type RedactionContext = {
  /** Addresses of the mailbox owner / company: kept (they are company facts). */
  ownerAddresses?: readonly string[];
  /** Known third parties (recipients, senders): addresses and display names. */
  thirdParties?: readonly string[];
  /** Trusted company text (website profile): phones found there are kept. */
  trustedText?: string;
};
/** Name-like tokens derived from third-party addresses/names (>= 3 letters). */
export function nameTokens(thirdParties: readonly string[]) {
  const tokens = new Set<string>();
  for (const party of thirdParties) {
    const local = party.includes("@") ? party.split("@")[0] : party;
    for (const t of local.split(/[\s._+\-0-9]+/))
      if (t.length >= 3 && /^\p{L}+$/u.test(t)) tokens.add(fold(t));
  }
  // Generic mailbox words are not personal names.
  for (const generic of [
    "contact",
    "info",
    "infos",
    "hello",
    "bonjour",
    "admin",
    "support",
    "sales",
    "devis",
    "commande",
    "facturation",
    "compta",
    "service",
    "client",
    "clients",
  ])
    tokens.delete(generic);
  return tokens;
}

/**
 * Replace third-party personal data with neutral markers. Applied to every
 * quote, statement and question label before storage. Conservative: may also
 * redact a harmless word; never keeps a recipient name it knows about.
 */
export function redactThirdParty(text: string, ctx: RedactionContext = {}) {
  const owners = new Set((ctx.ownerAddresses ?? []).map((a) => a.toLowerCase()));
  const trustedDigits = (ctx.trustedText ?? "").replace(/\D/g, "");
  let out = text.replace(EMAIL, (m) =>
    owners.has(m.toLowerCase()) ? m : "[e-mail]",
  );
  out = out.replace(PHONE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 8) return m;
    return trustedDigits.includes(digits) ? m : "[téléphone]";
  });
  out = out.replace(TITLE_NAME, "[client]");
  out = out.replace(GREETING_NAME, (_m, greeting: string) => `${greeting} [client]`);
  const tokens = nameTokens(ctx.thirdParties ?? []);
  if (tokens.size)
    out = out.replace(/\p{L}[\p{L}'’-]*/gu, (word) =>
      tokens.has(fold(word)) ? "[client]" : word,
    );
  return out.replace(/(\[client\])(\s+\[client\])+/g, "$1");
}

/** Short, stable topic slug used for conflict detection. */
export function topicKey(raw: string) {
  const slug = fold(raw)
    .replace(/[^a-z0-9²]+/g, "_")
    .replace(/²/g, "2")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return slug || "general";
}
