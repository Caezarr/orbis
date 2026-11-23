import { SITE_URL } from "@/lib/site";

/*
 * Daily digest content. Counts and fixed text only: no customer name, address,
 * subject, excerpt or draft text ever enters the e-mail, so a forwarded or
 * leaked digest reveals nothing about anyone's mail. The only links are the
 * app's own pages (APP_ORIGIN, else SITE_URL): Today, and the Réglages section
 * where the digest is switched off. Never a URL from mail.
 */
export type DigestCounts = {
  /** Drafts prepared in the window (inbox + follow-ups are counted separately). */
  draftsReady: number;
  /** Of draftsReady, drafts that still carry a highlighted question. */
  draftsWithQuestions: number;
  /** Messages Orbi left for a human check in the window. */
  needsReview: number;
  /** « Questions d’Orbi » open right now (asked once, answered once). */
  orbiQuestions: number;
  /** Follow-up drafts waiting for review right now. */
  followupsReady: number;
  /**
   * Test-mode inbox drafts prepared in the window: simulated, visible in Orbis
   * only. Never counted as "in your mailbox" above.
   */
  simulatedDrafts: number;
  /** Test-mode follow-ups waiting right now (simulated, Orbis only). */
  simulatedFollowups: number;
};
export type DigestMessage = { subject: string; text: string; html: string };

const MAX = 9_999;
function n(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, MAX) : 0;
}
export function normalizeCounts(counts: DigestCounts): DigestCounts {
  const draftsReady = n(counts.draftsReady);
  return {
    draftsReady,
    draftsWithQuestions: Math.min(n(counts.draftsWithQuestions), draftsReady),
    needsReview: n(counts.needsReview),
    orbiQuestions: n(counts.orbiQuestions),
    followupsReady: n(counts.followupsReady),
    simulatedDrafts: n(counts.simulatedDrafts),
    simulatedFollowups: n(counts.simulatedFollowups),
  };
}
/** Nothing to decide: no e-mail is sent that day. */
export function isEmptyDigest(counts: DigestCounts) {
  const c = normalizeCounts(counts);
  return (
    !c.draftsReady && !c.needsReview && !c.orbiQuestions && !c.followupsReady && !c.simulatedDrafts && !c.simulatedFollowups
  );
}

/** https origin of the app; anything else falls back to the canonical site. */
export function appOrigin(value = process.env.APP_ORIGIN) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol === "https:" && !url.username && !url.password) return url.origin;
  } catch {}
  return SITE_URL;
}

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

const testOnly = (count: number) =>
  `(mode test) visible${count > 1 ? "s" : ""} dans Orbis seulement : rien n’a été écrit dans votre boîte`;

/**
 * Two honest headings. « Depuis le dernier résumé » only holds what happened in
 * the window (drafts written, messages left for a check). Follow-ups and Orbi's
 * questions are counted as they stand right now, so they can come back every
 * day while they stay open: they go under « En attente », never presented as new.
 */
function sections(c: DigestCounts) {
  const recent: string[] = [];
  if (c.draftsReady)
    recent.push(
      `${plural(c.draftsReady, "brouillon prêt", "brouillons prêts")} à relire dans votre boîte` +
        (c.draftsWithQuestions
          ? ` (dont ${c.draftsWithQuestions} avec une question surlignée à compléter)`
          : ""),
    );
  if (c.simulatedDrafts)
    recent.push(`${plural(c.simulatedDrafts, "brouillon d’essai", "brouillons d’essai")} ${testOnly(c.simulatedDrafts)}`);
  if (c.needsReview) recent.push(`${plural(c.needsReview, "message à vérifier", "messages à vérifier")} : Orbi n’a pas préparé de brouillon`);
  const waiting: string[] = [];
  if (c.followupsReady) waiting.push(`${plural(c.followupsReady, "relance préparée", "relances préparées")} à relire`);
  if (c.simulatedFollowups)
    waiting.push(`${plural(c.simulatedFollowups, "relance d’essai", "relances d’essai")} ${testOnly(c.simulatedFollowups)}`);
  if (c.orbiQuestions)
    waiting.push(`${plural(c.orbiQuestions, "question d’Orbi", "questions d’Orbi")} sans réponse : une réponse sert à tous les prochains brouillons`);
  return [
    { title: "Depuis le dernier résumé :", items: recent },
    { title: "En attente en ce moment :", items: waiting },
  ].filter((section) => section.items.length > 0);
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function composeDigest(raw: DigestCounts, origin = appOrigin()): DigestMessage {
  const c = normalizeCounts(raw);
  const today = `${origin}/today`;
  // The opt-out lives on Réglages › Résumé quotidien (DigestToggle), not on Today.
  const settings = `${origin}/settings#resume`;
  const subject = c.draftsReady
    ? `Orbi : ${plural(c.draftsReady, "brouillon prêt", "brouillons prêts")} à relire`
    : "Orbi : votre résumé du jour";
  const parts = sections(c);
  const sent = "Rien n’a été envoyé à vos clients : chaque brouillon attend votre relecture.";
  const why = "Vous recevez ce résumé parce que vous l’avez activé dans Orbis. Vous pouvez l’arrêter dans Réglages › Résumé quotidien.";
  const text = [
    "Bonjour,",
    "",
    ...parts.flatMap((part) => [part.title, ...part.items.map((line) => `- ${line}`), ""]),
    sent,
    `Ouvrir Orbis : ${today}`,
    "",
    why,
    `Arrêter le résumé : ${settings}`,
  ].join("\n");
  const html = [
    '<!doctype html><html lang="fr"><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">',
    "<p>Bonjour,</p>",
    ...parts.map(
      (part) => `<p>${escape(part.title)}</p><ul>${part.items.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>`,
    ),
    `<p>${escape(sent)}</p>`,
    `<p><a href="${escape(today)}">Ouvrir Orbis</a></p>`,
    `<p style="color:#666;font-size:13px">${escape(why)} <a href="${escape(settings)}">Arrêter le résumé</a></p>`,
    "</body></html>",
  ].join("");
  return { subject, text, html };
}
