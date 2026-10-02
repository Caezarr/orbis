import { SITE_URL } from "@/lib/site";

/*
 * Daily digest content. Counts and fixed text only: no customer name, address,
 * subject, excerpt or draft text ever enters the e-mail, so a forwarded or
 * leaked digest reveals nothing about anyone's mail. The only link is the
 * app's own Today page (APP_ORIGIN, else SITE_URL), never a URL from mail.
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
  };
}
/** Nothing to decide: no e-mail is sent that day. */
export function isEmptyDigest(counts: DigestCounts) {
  const c = normalizeCounts(counts);
  return !c.draftsReady && !c.needsReview && !c.orbiQuestions && !c.followupsReady;
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

function lines(c: DigestCounts) {
  const out: string[] = [];
  if (c.draftsReady)
    out.push(
      `${plural(c.draftsReady, "brouillon prêt", "brouillons prêts")} à relire dans votre boîte` +
        (c.draftsWithQuestions
          ? ` (dont ${c.draftsWithQuestions} avec une question surlignée à compléter)`
          : ""),
    );
  if (c.followupsReady) out.push(`${plural(c.followupsReady, "relance préparée", "relances préparées")} à relire`);
  if (c.needsReview) out.push(`${plural(c.needsReview, "message à vérifier", "messages à vérifier")} : Orbi n’a pas préparé de brouillon`);
  if (c.orbiQuestions)
    out.push(`${plural(c.orbiQuestions, "question d’Orbi", "questions d’Orbi")} en attente : une réponse sert à tous les prochains brouillons`);
  return out;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function composeDigest(raw: DigestCounts, origin = appOrigin()): DigestMessage {
  const c = normalizeCounts(raw);
  const today = `${origin}/today`;
  const subject = c.draftsReady
    ? `Orbi : ${plural(c.draftsReady, "brouillon prêt", "brouillons prêts")} à relire`
    : "Orbi : votre résumé du jour";
  const items = lines(c);
  const sent = "Rien n’a été envoyé à vos clients : chaque brouillon attend votre relecture.";
  const why = "Vous recevez ce résumé parce que vous l’avez activé dans Orbis. Vous pouvez l’arrêter depuis la page Aujourd’hui.";
  const text = [
    "Bonjour,",
    "",
    "Depuis le dernier résumé :",
    ...items.map((line) => `- ${line}`),
    "",
    sent,
    `Ouvrir Orbis : ${today}`,
    "",
    why,
  ].join("\n");
  const html = [
    '<!doctype html><html lang="fr"><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">',
    "<p>Bonjour,</p><p>Depuis le dernier résumé :</p><ul>",
    ...items.map((line) => `<li>${escape(line)}</li>`),
    `</ul><p>${escape(sent)}</p>`,
    `<p><a href="${escape(today)}">Ouvrir Orbis</a></p>`,
    `<p style="color:#666;font-size:13px">${escape(why)}</p>`,
    "</body></html>",
  ].join("");
  return { subject, text, html };
}
