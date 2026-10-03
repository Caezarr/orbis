/*
 * Deterministic helpers for text that came out of a model (or from a third
 * party). They normalise the unicode tricks used to slip contact data past
 * ASCII-only guards and detect contact data (emails, links, bare domains,
 * phones) and figures with unicode-aware patterns.
 *
 * Used by the inbox draft guard (src/lib/runtime/inbox-replies.ts), the
 * request line (src/lib/followups/request.ts), brain candidates
 * (src/lib/brain/candidates.ts) and the /start preview guards.
 */

/**
 * Invisible / formatting characters: soft hyphen, combining grapheme joiner,
 * zero-width space/joiners, LRM/RLM, bidi embeddings and overrides
 * (U+202A–U+202E), word joiner and invisible operators (U+2060–U+206F),
 * variation selectors, BOM, Hangul fillers and tag characters.
 */
const INVISIBLE =
  /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ\u{E0000}-\u{E007F}]/gu;

/**
 * Compatibility characters used to dodge ASCII patterns: small form variants
 * ("﹫"), fullwidth forms ("＠", "１２"), mathematical alphanumerics ("𝐞𝐯𝐢𝐥")
 * and enclosed alphanumerics ("ⓔ"). Only these are NFKC-folded, so ordinary
 * typography of a draft ("m²", "…", non-breaking spaces) is left untouched.
 */
const COMPAT = /[\uFE50-\uFE6F\uFF00-\uFFEF\u2460-\u24FF\u{1D400}-\u{1D7FF}]/gu;
/** Selective NFKC (see COMPAT) + invisible/bidi characters removed. */
export function normalizeUntrusted(text: string) {
  return text.replace(COMPAT, (c) => c.normalize("NFKC")).replace(INVISIBLE, "");
}
export function hasInvisible(text: string) {
  INVISIBLE.lastIndex = 0;
  const found = INVISIBLE.test(text);
  INVISIBLE.lastIndex = 0;
  return found;
}

/**
 * Model output only: also undo common "defanging" so obfuscated contact data is
 * detected ("evil[.]test", "boss(at)evil.test", "hxxps://").
 */
export function normalizeModelText(text: string) {
  return normalizeUntrusted(text)
    .replace(/\bhxxp(s?):\/\//gi, "http$1://")
    .replace(/\s*[[({]\s*(?:\.|dot|point)\s*[\])}]\s*/gi, ".")
    .replace(/\s*[[({]\s*(?:@|at|arobase)\s*[\])}]\s*/gi, "@");
}

// --------------------------------------------------------------- patterns
// All global regexes: use via matchAll / replace only (no .test on shared state).

export const EMAIL_RE =
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
export const URL_RE =
  /\b(?:https?|ftp):\/\/[^\s<>()"'[\]{}]+|\bwww\.[^\s<>()"'[\]{}]+|\bjavascript:[^\s<>"']+|\bdata:[a-z]+\/[a-z0-9.+-]+[;,][^\s<>"']*/giu;
const TLDS =
  "com|net|org|info|biz|io|co|ai|app|dev|me|tv|xyz|top|site|online|shop|store|link|click|live|cloud|tech|pro|eu|fr|be|ch|de|lu|nl|es|it|pt|uk|us|ca|ru|cn|su|tk|ml|ga|cf|gq|ly|gl|gg|to|cc|ws|test|example|invalid|localhost|onion";
/**
 * Bare domains ("evil.test/collect?d=x", "evil-site.com"): a known TLD, a
 * punycode TLD, or any TLD followed by a path. Not preceded by a letter, "@",
 * "/" or ":" (so the domain part of an email or a full URL is not re-matched).
 */
export const BARE_DOMAIN_RE = new RegExp(
  `(?<![\\p{L}\\p{N}@._/:%+-])(?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?\\.)+(?:(?:${TLDS}|xn--[a-z0-9-]+)(?![\\p{L}\\p{N}-])|\\p{L}{2,24}(?=[/?#]))(?::\\d{2,5})?(?:[/?#][^\\s<>()"'[\\]{}]*)?`,
  "giu",
);
/** Dotted tokens mixing in Cyrillic/Greek letters: homoglyph domains with any TLD. */
export const HOMOGLYPH_DOMAIN_RE =
  /(?<![\p{L}\p{N}@._/:-])[\p{L}\p{N}-]*[Ͱ-ϿЀ-ӿ][\p{L}\p{N}-]*(?:\.[\p{L}\p{N}-]+)+|(?<![\p{L}\p{N}@._/:-])[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[\p{L}\p{N}-]*[Ͱ-ϿЀ-ӿ][\p{L}\p{N}-]*/gu;
/** Separated phone numbers ("06 12 34 56 78", "+33 (0)3 20 …") and compact ones ("0612345678", "+33612345678"). */
export const PHONE_RE =
  /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]){3,6}\d{2,4}|(?<!\d)(?:\+\d{8,14}|00\d{8,13}|0\d{8,9})(?!\d)/g;

const lastDigits = (s: string) => s.replace(/\D/g, "").slice(-9);

/** True when `text` contains a bare/title-case-safe domain match (see isLikelyDomain). */
export function isLikelyDomain(match: string) {
  const host = match.split(/[/?#:]/)[0] ?? match;
  const tld = host.split(".").at(-1) ?? "";
  const hasPath = /[/?#]/.test(match);
  // "fait.It works" (missing space after a full stop) is not a domain.
  if (!hasPath && /^\p{Lu}\p{Ll}+$/u.test(tld)) return false;
  return true;
}

export type ContactKind = "email" | "link" | "domain" | "phone";
/** Contact data found in (normalised) text. */
export function contactData(raw: string): { kind: ContactKind; value: string }[] {
  const text = normalizeModelText(raw);
  const out: { kind: ContactKind; value: string }[] = [];
  for (const m of text.matchAll(URL_RE)) out.push({ kind: "link", value: m[0] });
  for (const m of text.matchAll(EMAIL_RE)) out.push({ kind: "email", value: m[0] });
  for (const m of text.matchAll(BARE_DOMAIN_RE))
    if (isLikelyDomain(m[0])) out.push({ kind: "domain", value: m[0] });
  for (const m of text.matchAll(HOMOGLYPH_DOMAIN_RE)) out.push({ kind: "domain", value: m[0] });
  for (const m of text.matchAll(PHONE_RE))
    if (m[0].replace(/\D/g, "").length >= 8) out.push({ kind: "phone", value: m[0] });
  return out;
}
export const hasContactData = (text: string) => contactData(text).length > 0;

/** Every contact value of `text` is present in `trusted` (token boundaries, case-insensitive). */
export function contactsSupported(text: string, trusted: string) {
  const t = normalizeUntrusted(trusted);
  return contactData(text).every((c) => trustedContact(c.kind, c.value, t));
}

const URLISH = /[\p{L}\p{N}._%+\-@]/u;
/**
 * `candidate` occurs in `trusted` as a whole token: the character before is
 * not part of an address/domain, and the character after does not extend it
 * ("hello@acme.te" is NOT supported by "hello@acme.test").
 */
export function containsToken(trusted: string, candidate: string, opts: { allowPathAfter?: boolean } = {}) {
  const hay = trusted.toLowerCase();
  const needle = candidate.toLowerCase();
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    from = i + 1;
    const before = hay[i - 1] ?? "";
    const after = hay[i + needle.length] ?? "";
    const startsUrl = /^[a-z]+:/.test(needle);
    if (!startsUrl && before && URLISH.test(before)) continue;
    if (startsUrl && before && /[\p{L}\p{N}]/u.test(before)) continue;
    if (!after) return true;
    if (opts.allowPathAfter && /[/?#]/.test(after)) return true;
    if (/[\p{L}\p{N}_%+\-@]/u.test(after)) continue;
    // A following "." is fine only when it ends a sentence (not "acme.te" + "st").
    if (after === "." && /[\p{L}\p{N}]/u.test(hay[i + needle.length + 1] ?? "")) continue;
    if (!opts.allowPathAfter && /[/?#=&]/.test(after)) continue;
    return true;
  }
}

const TRAILING_PUNCT = /[.,;:!?…)\]]+$/;
/** Is one detected contact value supported by trusted text? */
export function trustedContact(kind: ContactKind, value: string, trusted: string) {
  const v = value.replace(TRAILING_PUNCT, "");
  if (kind === "phone") {
    const d = lastDigits(v);
    if (v.replace(/\D/g, "").length < 8) return true;
    for (const m of trusted.matchAll(PHONE_RE)) if (lastDigits(m[0]) === d) return true;
    return false;
  }
  return containsToken(trusted, v, { allowPathAfter: kind === "domain" || kind === "link" });
}

// --------------------------------------------------------------- figures

export const MONEY_RE =
  /(?:(?:[€$£¥]|\b(?:eur|usd|chf|gbp)\b)\s?\d[\d\s.,]*\d|(?:[€$£¥])\s?\d|\d[\d\s.,]*\s?(?:k€|K€|€|\$|£|¥|%|(?:eur|euros?|usd|dollars?|chf|gbp|ht|ttc)\b))/giu;
const compact = (s: string) => s.toLowerCase().replace(/[\s.,]/g, "");
/** Amount supported by trusted text, digit-boundary aware ("90 €" is not supported by "190 €"). */
export function amountSupported(match: string, trusted: string) {
  if (!/\d/.test(match)) return true;
  const hay = compact(normalizeUntrusted(trusted));
  const needle = compact(match);
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return false;
    from = i + 1;
    const before = hay[i - 1] ?? "";
    const after = hay[i + needle.length] ?? "";
    if (/\d/.test(before)) continue;
    if (/\d$/.test(needle) && /\d/.test(after)) continue;
    return true;
  }
}
const NUMBER_RE = /\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?/g;
const numberKey = (n: string) => n.replace(/[\s.,](?=\d{3}\b)/g, "").replace(",", ".");
/** Numbers of `text` that do not occur (as numbers) in `support`. */
export function unsupportedNumbers(text: string, support: string) {
  const known = new Set([...normalizeUntrusted(support).matchAll(NUMBER_RE)].map((m) => numberKey(m[0])));
  return [...normalizeUntrusted(text).matchAll(NUMBER_RE)].map((m) => m[0]).filter((n) => !known.has(numberKey(n)));
}
