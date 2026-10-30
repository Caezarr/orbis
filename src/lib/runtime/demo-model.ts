import type { BrainModel } from "@/lib/brain/model";
import type { FollowupModel } from "@/lib/followups/model";
import { demoMailboxActive, isProductionRuntime } from "@/lib/integrations/demo-mailbox/guard";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import type { Classification, InboxModel, ReplyDraft, ReplySource } from "./inbox-replies";

/*
 * Demo model. Local development and browser E2E only.
 *
 * `ORBIS_AI_PROVIDER=demo` (with `ORBIS_DEMO_MAILBOX=true`) replaces the model
 * calls of the inbox mission (triage, reply drafts, request extraction,
 * follow-ups, company sheet) with deterministic code: keyword triage and
 * template drafts that quote the company sources verbatim. No network, no
 * paid call. It exists so step 4 of /start and the real pipeline (guard,
 * citations, ledger, mailbox broker) can be exercised end to end without a
 * model key.
 *
 * Fail closed:
 *  - never on a production runtime (NODE_ENV=production or VERCEL_ENV=production);
 *  - never against a real mailbox: it is active only with the demo mailbox;
 *  - `providerStatus().configured` stays false, so every other model feature
 *    (/start profile and preview, missions, Orbi guidance) still says no model
 *    is configured instead of running on fake output;
 *  - every draft opens with DEMO_DRAFT_NOTICE so a fake draft cannot pass for a real one.
 */
type Env = Record<string, string | undefined>;

export const DEMO_MODEL_ID = "orbis-demo-local";
export const DEMO_DRAFT_NOTICE =
  "(Brouillon de démonstration : modèle factice local, aucun appel à une IA.)";

export class DemoModelForbiddenError extends Error {
  constructor() {
    super(
      "ORBIS_AI_PROVIDER=demo is a local development switch and is refused in production. Configure a real provider.",
    );
  }
}

export function demoModelRequested(env: Env = process.env) {
  return env.ORBIS_AI_PROVIDER?.trim().toLowerCase() === "demo";
}

/** True when the inbox mission runs on the demo model. Never throws. */
export function demoModelActive(env: Env = process.env) {
  return demoModelRequested(env) && !isProductionRuntime(env) && demoMailboxActive(env);
}

const NO_USAGE = { inputTokens: 0, outputTokens: 0 };

// ------------------------------------------------------------------ triage
const RULES: [Classification, RegExp][] = [
  ["noise", /newsletter|désabonn|desabonn|unsubscribe|promo|référencement|fiche google|visibilité en ligne/i],
  ["supplier", /commande n°|facture n°|relevé de compte|bon de livraison|votre livraison|fournisseur/i],
  ["admin", /décennale|attestation|urssaf|impôts|comptab|banque/i],
  ["quote_request", /devis|tarif|\bprix\b|combien|estimation|chiffrage/i],
];
export function demoClassify(message: MailMessage): Classification {
  const text = `${message.subject}\n${message.text.slice(0, 1500)}`;
  return RULES.find(([, re]) => re.test(text))?.[0] ?? "customer_request";
}

// ------------------------------------------------------------------ sources
const words = (text: string) =>
  new Set(text.toLowerCase().match(/[\p{L}]{5,}/gu) ?? []);

/**
 * The source sentence sharing the most words with the e-mail, copied verbatim
 * so the citation survives guardDraft's exact-substring check.
 */
export function bestSourceSentence(email: string, sources: ReplySource[]) {
  const wanted = words(email);
  let best: { sourceId: string; sentence: string; score: number } | null = null;
  for (const source of sources) {
    for (const piece of source.content.split(/(?<=[.!?])\s+|\n+/)) {
      const sentence = piece.trim();
      if (sentence.length < 20 || sentence.length > 240) continue;
      let score = 0;
      for (const w of words(sentence)) if (wanted.has(w)) score++;
      if (score > 0 && (!best || score > best.score)) best = { sourceId: source.id, sentence, score };
    }
  }
  return best;
}

// ------------------------------------------------------------------ models
export const demoInboxModel: InboxModel = {
  async classify(message) {
    return { output: { classification: demoClassify(message), reason: "demo: keyword triage" }, usage: NO_USAGE };
  },
  async draft(input) {
    const { message, meeting } = input;
    const fact = bestSourceSentence(`${message.subject}\n${message.text}`, input.sources);
    const lines = [DEMO_DRAFT_NOTICE, "", "Bonjour,", "", "Merci pour votre message."];
    const output: ReplyDraft = { body: "", questions: [], citations: [] };
    if (fact) {
      lines.push("", `D'après nos informations : « ${fact.sentence} »`);
      output.citations.push({ sourceId: fact.sourceId, excerpt: fact.sentence, claim: fact.sentence.slice(0, 300) });
    }
    if (meeting?.mode === "slots" && meeting.slots.length) {
      lines.push("", "Je peux vous proposer :", ...meeting.slots.map((s) => `- ${s.label}`), "Lequel vous convient ?");
    } else if (meeting) {
      lines.push("", "Pourriez-vous m'indiquer vos disponibilités ?");
    } else {
      lines.push("", "[[À CONFIRMER : réponse précise à la demande]]");
      output.questions.push("réponse précise à la demande");
    }
    lines.push("", "Bien cordialement,");
    output.body = lines.join("\n");
    return { output, usage: NO_USAGE };
  },
};

const firstSentence = (text: string) =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .find((s) => s.length >= 8)
    ?.slice(0, 300) ?? "";
const verbatim = (text: string, re: RegExp) => text.match(re)?.[0]?.slice(0, 120) ?? null;

export const demoFollowupModel: FollowupModel = {
  async extractRequest(message) {
    return {
      output: {
        need: message.subject.slice(0, 120),
        needQuote: firstSentence(message.text),
        budgetQuote: verbatim(message.text, /\d[\d  .,]*\s?(?:€|euros?)(?:\s?(?:HT|TTC))?/i),
        deadlineQuote: verbatim(message.text, /(?:avant|d'ici|d’ici)\s[^.,;\n]{3,40}/i),
      },
      usage: NO_USAGE,
    };
  },
  async ownerWaiting(ownerText) {
    const output = /devis|proposition|offre|ci-joint/i.test(ownerText)
      ? ({ awaitingReply: true, kind: "quote" } as const)
      : /\?/.test(ownerText)
        ? ({ awaitingReply: true, kind: "question" } as const)
        : ({ awaitingReply: false, kind: "closing" } as const);
    return { output, usage: NO_USAGE };
  },
  async draftFollowup(input) {
    const lines = [
      DEMO_DRAFT_NOTICE,
      "",
      "Bonjour,",
      "",
      "Je me permets de revenir vers vous au sujet de mon dernier message. Avez-vous pu en prendre connaissance ?",
    ];
    if (input.stage >= 2)
      lines.push("", "C'est ma dernière relance : sans retour de votre part, je considérerai la demande comme close.");
    lines.push("", "Bien cordialement,");
    return { output: { body: lines.join("\n"), questions: [], citations: [] }, usage: NO_USAGE };
  },
};

/** The demo extracts nothing: the company sheet stays empty rather than holding fake facts. */
export const demoBrainModel: BrainModel = {
  async extract() {
    return { output: { facts: [] }, usage: NO_USAGE };
  },
  async explainEdit() {
    return { output: { proposals: [] }, usage: NO_USAGE };
  },
};
