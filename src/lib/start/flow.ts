import { z } from "zod";

/**
 * /start golden path — pure, client-safe logic (no server imports).
 * Company → account → mailbox → first drafts. Every state shown in the UI is
 * derived from what the server actually reported; nothing here simulates
 * progress.
 */

export type StartStep = "company" | "account" | "mailbox" | "drafts";
export const START_STEPS: readonly StartStep[] = [
  "company",
  "account",
  "mailbox",
  "drafts",
];

// ---------------------------------------------------------------- profile

/** What the step-1 reading looks for, in display order. */
export const FACT_CATEGORIES = [
  "activity",
  "services",
  "zone",
  "prices",
  "delays",
  "hours",
  "contact",
  "address",
  "audience",
  "history",
  "certifications",
  "faq",
  "legal",
  "social",
] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];
export const CATEGORY_LABELS: Record<FactCategory, string> = {
  activity: "Activité",
  services: "Prestations",
  zone: "Zone d’intervention",
  prices: "Prix et devis",
  delays: "Délais",
  hours: "Horaires",
  contact: "Contact",
  address: "Adresse",
  audience: "Clientèle",
  history: "Ancienneté",
  certifications: "Assurances, labels et certifications",
  faq: "Questions déjà traitées sur votre site",
  legal: "Informations légales",
  social: "Réseaux et avis",
};

export const startFactSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    quote: z.string().trim().min(2).max(600),
    sourceUrl: z.url().max(2000).optional(),
    /** Stable within one reading (citations of the summary point to it). */
    id: z.string().trim().min(1).max(24).optional(),
    category: z.enum(FACT_CATEGORIES).optional(),
    /** Short normalised value read from the quote ("de Lille à Tournai", a phone…). */
    value: z.string().trim().min(1).max(300).optional(),
    /** high: explicit marker or structured data; medium: wording heuristic. */
    confidence: z.enum(["high", "medium"]).optional(),
    /** Where the quote comes from: visible text, page metadata, schema.org data, a link, or the owner. */
    via: z.enum(["text", "meta", "structured", "link", "owner"]).optional(),
    /** Owner correction: replaces `value` in the workspace profile, the quote stays as provenance. */
    corrected: z.string().trim().min(1).max(600).optional(),
  })
  .strict();
export const startProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    summary: z.string().trim().min(10).max(1800),
    website: z.url().max(2000).optional(),
    facts: z.array(startFactSchema).max(60),
    unknowns: z.array(z.string().trim().min(2).max(200)).max(10),
    origin: z.enum(["ai", "site", "description"]),
    /** Pages actually read (same site), for the "sources" line. */
    pages: z
      .array(z.object({ url: z.url().max(2000), title: z.string().max(200) }).strict())
      .max(10)
      .optional(),
    readMs: z.number().int().min(0).max(120_000).optional(),
    /** e.g. "source_instructions_ignored". */
    flags: z.array(z.string().max(60)).max(8).optional(),
    /** Fact ids the (model-written) summary relies on. */
    summarySources: z.array(z.string().max(24)).max(12).optional(),
  })
  .strict();
export type StartFact = z.infer<typeof startFactSchema>;
export type StartProfile = z.infer<typeof startProfileSchema>;

/** Points Orbi never guesses: they become highlighted questions in drafts. */
export const DEFAULT_UNKNOWNS = [
  "Vos tarifs ou fourchettes de prix",
  "Vos délais et disponibilités",
  "Votre zone d’intervention",
] as const;

/** What a missing category becomes in "Ce qu'Orbi ne devine pas" (only when really not found). */
export const UNKNOWN_BY_CATEGORY: Partial<Record<FactCategory, string>> = {
  prices: "Vos tarifs ou fourchettes de prix",
  delays: "Vos délais et disponibilités",
  zone: "Votre zone d’intervention",
  services: "Le détail de vos prestations",
  hours: "Vos horaires ou jours de disponibilité",
  contact: "Le téléphone ou l’e-mail à donner aux clients",
  audience: "Vos clients principaux",
};

/** Unknowns = the categories Orbi looked for and did not find, nothing else. */
export function unknownsFor(facts: Pick<StartFact, "category">[]) {
  const found = new Set(facts.map((f) => f.category).filter(Boolean));
  return (Object.keys(UNKNOWN_BY_CATEGORY) as FactCategory[])
    .filter((c) => !found.has(c))
    .map((c) => UNKNOWN_BY_CATEGORY[c] as string);
}

/** Human label of a source page: "mdkpeinture.com/mentions-legales". */
export function sourceName(url?: string) {
  if (!url) return "Vous";
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`.slice(0, 120);
  } catch {
    return "Votre site";
  }
}

const QUOTE_FREE = /devis|gratuit|engagement/i;
const QUESTION_BANK: { category: FactCategory; question: string; match?: (f: StartFact) => boolean }[] = [
  {
    category: "prices",
    question: "Quels sont vos tarifs ?",
    match: (f) => /\d/.test(f.corrected ?? f.value ?? f.quote) && !QUOTE_FREE.test(f.value ?? ""),
  },
  { category: "prices", question: "Le devis est-il gratuit ?", match: (f) => QUOTE_FREE.test(f.corrected ?? f.value ?? f.quote) },
  { category: "zone", question: "Intervenez-vous dans mon secteur ?" },
  { category: "delays", question: "Sous quel délai pouvez-vous commencer ?" },
  { category: "services", question: "Quelles prestations proposez-vous exactement ?" },
  { category: "contact", question: "Comment vous joindre rapidement ?" },
  { category: "hours", question: "Quels sont vos horaires ?" },
  { category: "certifications", question: "Êtes-vous assuré, et avez-vous des certifications ?" },
  { category: "address", question: "Où êtes-vous situé ?" },
  { category: "history", question: "Depuis combien de temps exercez-vous ?" },
  { category: "audience", question: "Travaillez-vous pour les particuliers comme pour les professionnels ?" },
  { category: "legal", question: "Pouvez-vous me communiquer votre numéro SIRET ou de TVA ?" },
];

/**
 * Level-1 preview without a model: the 10 questions customers most likely ask,
 * answered ONLY by a sourced fact of the profile (or the owner's correction).
 * Questions the site actually answers in its own FAQ come first. A question
 * without a fact has `answer: null` and is shown as "à confirmer".
 */
export function likelyQuestions(profile: Pick<StartProfile, "facts">, max = 10): PreviewQuestion[] {
  const answerOf = (f: StartFact): NonNullable<PreviewQuestion["answer"]> =>
    f.corrected
      ? { quote: f.corrected, sourceName: "Corrigé par vous" }
      : f.via === "owner"
        ? { quote: f.quote, sourceName: "Indiqué par vous" }
        : { quote: f.quote, sourceName: sourceName(f.sourceUrl), ...(f.sourceUrl ? { sourceUrl: f.sourceUrl } : {}) };
  // Readable answers first: owner words, then visible text, then links, then schema.org data.
  const rank = (f: StartFact) =>
    (f.corrected || f.via === "owner" ? 0 : f.via === "text" || f.via === "meta" ? 1 : f.via === "link" ? 2 : 3) +
    (f.confidence === "medium" ? 4 : 0) +
    (f.quote.length > 160 ? 0.5 : 0) +
    (/[.!?]$/.test(f.quote) ? 0 : 0.25);
  const out: PreviewQuestion[] = [];
  for (const f of profile.facts.filter((f) => f.category === "faq" && f.value).slice(0, 4))
    out.push({ question: f.value as string, answer: answerOf(f), category: "faq" });
  for (const { category, question, match } of QUESTION_BANK) {
    if (out.length >= max) break;
    const facts = profile.facts.filter((f) => f.category === category && (!match || match(f)));
    const services = facts.filter((f) => f.value && !f.corrected && f.via !== "owner");
    if (category === "services" && services.length >= 2) {
      // Several services: list their names as written on the site (each one verbatim).
      const url = services[0].sourceUrl;
      out.push({
        question,
        answer: {
          quote: services.map((f) => f.value).join(" · ").slice(0, 600),
          sourceName: sourceName(url),
          ...(url ? { sourceUrl: url } : {}),
        },
        category,
      });
      continue;
    }
    const best = [...facts].sort((a, b) => rank(a) - rank(b))[0];
    out.push({ question, answer: best ? answerOf(best) : null, category });
  }
  return out.slice(0, max);
}

const clean = (v: string) => v.replace(/\s+/g, " ").trim();

/** Site name from a <title>: "Atelier Dupont | Menuiserie à Lille" → "Atelier Dupont". */
export function siteName(title: string, hostname: string) {
  const first = clean(title).split(/\s+[|·–—-]\s+/)[0]?.trim() ?? "";
  if (first.length >= 2) return first.slice(0, 120);
  return hostname.replace(/^www\./, "").slice(0, 120);
}

/** Up to `max` full sentences copied verbatim from the page text. */
export function quotableSentences(text: string, max = 2) {
  const sentences = clean(text).match(/[^.!?]{40,280}[.!?]/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of sentences) {
    const s = raw.trim();
    const key = s.toLowerCase();
    if (seen.has(key) || /cookie|javascript|©|copyright/i.test(s)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export type SiteReading = {
  website: string;
  title: string;
  description: string;
  excerpt: string;
};

/**
 * Deterministic profile from a public page (no model). Every fact is a verbatim
 * quote of the page; the summary is labelled a proposal by the UI.
 */
export function profileFromSite(site: SiteReading): StartProfile {
  const host = new URL(site.website).hostname;
  const facts: StartFact[] = [];
  const title = clean(site.title);
  const description = clean(site.description);
  if (title)
    facts.push({ label: "Titre du site", quote: title.slice(0, 600), sourceUrl: site.website });
  if (description)
    facts.push({ label: "Description du site", quote: description.slice(0, 600), sourceUrl: site.website });
  for (const sentence of quotableSentences(site.excerpt, description ? 1 : 2))
    if (!facts.some((f) => f.quote === sentence))
      facts.push({ label: "Extrait de la page", quote: sentence, sourceUrl: site.website });
  const summary =
    description ||
    facts.find((f) => f.label === "Extrait de la page")?.quote ||
    `Site public ${host}. Décrivez votre activité en une ou deux phrases.`;
  return {
    name: siteName(title, host),
    summary: summary.slice(0, 1800),
    website: site.website,
    facts: facts.slice(0, 6),
    unknowns: ["Vos clients principaux", ...DEFAULT_UNKNOWNS],
    origin: "site",
  };
}

/** "Two sentences" intake: the owner's own words are the only fact. */
export function profileFromDescription(description: string, name?: string): StartProfile {
  const text = clean(description).slice(0, 1800);
  const fallbackName = text.split(/[,.:;]/)[0]?.split(/\s+/).slice(0, 5).join(" ") ?? "";
  return {
    name: (clean(name ?? "") || fallbackName || "Mon entreprise").slice(0, 120),
    summary: text,
    facts: [{ label: "Décrit par vous", quote: text.slice(0, 600) }],
    unknowns: ["Votre site ou vos documents de référence", ...DEFAULT_UNKNOWNS],
    origin: "description",
  };
}

// ------------------------------------------------- pending profile (browser)

/** Browser key for the confirmed profile waiting for an account. */
export const PENDING_KEY = "orbis:start:pending-profile";
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const pendingSchema = z
  .object({ v: z.literal(1), savedAt: z.number(), profile: startProfileSchema })
  .strict();

export function encodePending(profile: StartProfile, now = Date.now()) {
  return JSON.stringify({ v: 1, savedAt: now, profile });
}
/** Returns null for missing, malformed, tampered-shape or expired values. */
export function decodePending(raw: string | null, now = Date.now()): StartProfile | null {
  if (!raw || raw.length > 80_000) return null;
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const age = now - parsed.data.savedAt;
    if (age < 0 || age > PENDING_TTL_MS) return null;
    return parsed.data.profile;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ step machine

export type MailboxStatus =
  | "unknown"
  | "checking"
  | "connected"
  | "not_connected"
  | "not_configured"
  | "error";
export type BatchStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "budget_exhausted"
  | "quota_reached"
  | "plan_inactive";

export type StartFacts = {
  authenticated: boolean;
  /** Confirmed locally, not yet saved to a workspace. */
  pendingProfile: boolean;
  /** Profile saved in the session workspace. */
  workspaceProfile: boolean;
  /** The owner chose to edit the saved profile again. */
  editingProfile?: boolean;
  /** Anonymous: the confirmed profile's instant preview is open (still step 1). */
  previewing?: boolean;
  mailbox: MailboxStatus;
  batch: BatchStatus | null;
};

export function deriveStep(f: StartFacts): StartStep {
  if (!f.authenticated) return f.pendingProfile && !f.previewing ? "account" : "company";
  if (f.editingProfile || (!f.workspaceProfile && !f.pendingProfile)) return "company";
  // Authenticated with a pending profile: it is being saved (company step stays open).
  if (!f.workspaceProfile) return "company";
  if (f.batch) return "drafts";
  return f.mailbox === "connected" ? "drafts" : "mailbox";
}

export function stepState(step: StartStep, current: StartStep) {
  const a = START_STEPS.indexOf(step);
  const b = START_STEPS.indexOf(current);
  return a < b ? "done" : a === b ? "current" : "upcoming";
}

// ------------------------------------------------------------- inbox API

export type InboxBatchView = {
  id: string;
  provider: "gmail" | "outlook";
  mode: string;
  status: BatchStatus;
  stats: Partial<Record<string, number | boolean>>;
  error?: string;
  maxDrafts?: number;
};
export type InboxMessageView = {
  id: string;
  provider: "gmail" | "outlook";
  status: string;
  classification?: string;
  skipReason?: string;
  flags: string[];
  subjectPreview?: string;
  draftPreview?: string;
  questions: string[];
  citations: { sourceId: string; sourceName: string; excerpt: string }[];
  draft?: { id: string; simulated: boolean; openUrl?: string };
  /** Meeting slots computed from the calendar (inbox-calendar-labels.md). */
  proposedSlots?: { start: string; end: string; label: string }[];
};

export type BlockerKind =
  | "flag_disabled"
  | "budget_missing"
  | "provider_not_configured"
  | "no_provider"
  | "ai_not_configured"
  | "connection_unverified"
  | "multiple_mailboxes"
  | "offline"
  | "auth_required"
  | "forbidden"
  | "conflict"
  | "plan_required"
  | "unknown";

/** Maps an /api/v1/inbox error response to an actionable kind. */
export function inboxErrorKind(status: number, message = ""): BlockerKind {
  if (status === 401) return "auth_required";
  if (status === 402) return "plan_required";
  if (status === 403) return "forbidden";
  if (status === 503) {
    if (/not enabled/i.test(message)) return "flag_disabled";
    if (/budget/i.test(message)) return "budget_missing";
    if (/mailbox connection is not configured/i.test(message)) return "provider_not_configured";
    if (/authenticated (database )?workspace/i.test(message)) return "offline";
    return "unknown";
  }
  if (status === 409) {
    if (/choose which/i.test(message)) return "multiple_mailboxes";
    if (/connect your mailbox/i.test(message)) return "connection_unverified";
    if (/idempotency/i.test(message)) return "conflict";
  }
  return "unknown";
}

export const BLOCKER_COPY: Record<BlockerKind, { title: string; action: string }> = {
  flag_disabled: {
    title: "Les brouillons de réponse ne sont pas encore activés sur ce déploiement.",
    action: "Votre profil et votre connexion sont conservés. Revenez sur cette page une fois la fonction activée.",
  },
  budget_missing: {
    title: "Aucun plafond de dépense n’est configuré.",
    action: "Orbis refuse de lancer un traitement sans plafond. L’administrateur doit définir le budget mensuel, puis vous pourrez relancer.",
  },
  provider_not_configured: {
    title: "La connexion à cette messagerie n’est pas configurée sur ce déploiement.",
    action: "Essayez l’autre messagerie si elle est disponible, ou revenez une fois la configuration faite.",
  },
  no_provider: {
    title: "Aucune messagerie n’est encore configurée sur ce déploiement.",
    action: "Gmail et Outlook seront proposés ici dès leur configuration. Votre profil est conservé.",
  },
  ai_not_configured: {
    title: "Aucun modèle d’IA n’est configuré.",
    action: "Le lot resterait en file d’attente. L’administrateur doit configurer le fournisseur de modèle.",
  },
  connection_unverified: {
    title: "Votre boîte mail n’est pas encore vérifiée côté serveur.",
    action: "Reconnectez la messagerie, puis cliquez sur « Vérifier la connexion ».",
  },
  multiple_mailboxes: {
    title: "Plusieurs boîtes sont connectées.",
    action: "Gardez une seule boîte connectée pour ce premier passage, puis relancez.",
  },
  offline: {
    title: "Mode démo local : aucune boîte réelle ne peut être lue.",
    action: "Les brouillons nécessitent un espace authentifié avec base de données.",
  },
  auth_required: {
    title: "Votre session a expiré.",
    action: "Reconnectez-vous pour reprendre là où vous en étiez.",
  },
  forbidden: {
    title: "Votre rôle ne permet pas de lancer ce traitement.",
    action: "Demandez au propriétaire de l’espace de le lancer.",
  },
  conflict: {
    title: "Une demande différente utilise déjà cet identifiant.",
    action: "Rechargez la page pour repartir du dernier lot.",
  },
  plan_required: {
    title: "Votre formule ne permet pas de nouveau traitement pour l’instant.",
    action: "Vos brouillons passés restent consultables. Choisissez ou régularisez votre formule depuis la page Abonnement.",
  },
  unknown: {
    title: "Le service n’a pas pu traiter la demande.",
    action: "Réessayez dans un instant. Rien n’a été envoyé.",
  },
};

/** Phase displayed while a batch is pending — only states the backend reports. */
export type ProgressPhase = "queued" | "reading" | "drafting" | "done" | "failed" | "budget" | "quota";
export function progressPhase(
  batch: Pick<InboxBatchView, "status">,
  messages: Pick<InboxMessageView, "status">[],
): ProgressPhase {
  switch (batch.status) {
    case "queued":
      return "queued";
    case "running":
      return messages.some((m) => m.status === "drafting") ? "drafting" : "reading";
    case "completed":
      return "done";
    case "budget_exhausted":
      return "budget";
    case "quota_reached":
    case "plan_inactive":
      return "quota";
    default:
      return "failed";
  }
}
export const isPending = (status: BatchStatus) => status === "queued" || status === "running";

export const SKIP_LABELS: Record<string, string> = {
  no_sender: "Sans expéditeur",
  draft: "Brouillons existants",
  own_message: "Vos propres messages",
  no_reply_sender: "Expéditeurs automatiques (no-reply, notifications)",
  auto_reply: "Réponses automatiques et absences",
  bulk_or_newsletter: "Newsletters et envois groupés",
  promotional_category: "Promotions, réseaux sociaux, mises à jour",
  empty: "Messages vides",
  already_replied: "Déjà traités par vous dans le fil",
};
export const CLASSIFICATION_LABELS: Record<string, string> = {
  customer_request: "Demande client",
  quote_request: "Demande de devis",
  supplier: "Fournisseur",
  admin: "Administratif",
  noise: "Sans suite",
};
/** Meeting flags (calendar-aware drafts). No em-dashes, vouvoiement. */
export function meetingFlagLabel(flag: string): string | null {
  if (flag === "meeting:slots:simulated")
    return "Créneaux simulés (mode test) : votre agenda n’a pas été consulté.";
  if (flag === "meeting:ask_availability:calendar_not_connected")
    return "Agenda non connecté : le brouillon demande ses disponibilités au client.";
  if (flag === "meeting:ask_availability:calendar_unavailable")
    return "Agenda illisible pour le moment : le brouillon demande ses disponibilités au client.";
  if (flag === "meeting:ask_availability:no_free_slot")
    return "Aucun créneau libre trouvé : le brouillon demande ses disponibilités au client.";
  if (flag === "meeting:slot_unlisted" || flag === "meeting:slot_invented")
    return "Une date ou une heure non vérifiée a été remplacée par une question.";
  if (flag === "meeting:hours_assumed")
    return "Horaires par défaut utilisés : confirmez vos horaires dans la fiche entreprise.";
  return null;
}

export function flagLabel(flag: string) {
  if (flag.startsWith("injection_suspected:"))
    return "Le mail contient des instructions suspectes : elles ont été ignorées.";
  if (flag.startsWith("guard:"))
    return "Des informations non sourcées ont été remplacées par des questions.";
  if (flag.startsWith("meeting:")) return meetingFlagLabel(flag);
  return (
    {
      reply_to_diverges: "L’adresse de réponse diffère de l’expéditeur : à vérifier avant tout brouillon.",
      recipient_mismatch: "Le destinataire du brouillon ne correspond pas à l’expéditeur : à vérifier.",
      awaiting_draft_quota: "En attente : limite de brouillons du premier passage atteinte.",
    }[flag] ?? null
  );
}

export type ResultSummary = {
  drafts: InboxMessageView[];
  review: InboxMessageView[];
  skipped: { reason: string; label: string; count: number }[];
  notActionable: { classification: string; label: string; count: number }[];
  awaitingQuota: number;
  failed: number;
  simulated: boolean;
};

/** Draft first; everything not drafted is accounted for with a reason. */
export function summarizeResults(
  batch: Pick<InboxBatchView, "mode">,
  messages: InboxMessageView[],
): ResultSummary {
  const drafts = messages.filter((m) => m.status === "drafted" && m.draftPreview);
  const review = messages.filter((m) => m.status === "needs_review");
  const skippedMap = new Map<string, number>();
  for (const m of messages)
    if (m.status === "skipped") {
      const reason = m.skipReason ?? "unknown";
      skippedMap.set(reason, (skippedMap.get(reason) ?? 0) + 1);
    }
  const naMap = new Map<string, number>();
  for (const m of messages)
    if (
      m.status === "classified" &&
      m.classification &&
      !["customer_request", "quote_request"].includes(m.classification)
    )
      naMap.set(m.classification, (naMap.get(m.classification) ?? 0) + 1);
  return {
    drafts,
    review,
    skipped: [...skippedMap]
      .map(([reason, count]) => ({ reason, label: SKIP_LABELS[reason] ?? "Autre raison", count }))
      .sort((a, b) => b.count - a.count),
    notActionable: [...naMap]
      .map(([classification, count]) => ({
        classification,
        label: CLASSIFICATION_LABELS[classification] ?? classification,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    awaitingQuota: messages.filter((m) => m.flags.includes("awaiting_draft_quota")).length,
    failed: messages.filter((m) => m.status === "failed" || m.status === "uncertain").length,
    simulated: batch.mode !== "scoped_autonomy" || drafts.some((d) => d.draft?.simulated),
  };
}

/** Splits a draft into text and `[[…]]` placeholder segments for highlighting. */
export function splitPlaceholders(text: string) {
  const parts: { text: string; placeholder: boolean }[] = [];
  const re = /\[\[([^\]]{1,300})\]\]/g;
  let last = 0;
  for (const match of text.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), placeholder: false });
    parts.push({ text: match[1].trim(), placeholder: true });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), placeholder: false });
  return parts;
}

// ------------------------------------------------- instant preview (level 1)

/** Shown on the simulated incoming email AND on its example draft. */
export const SIMULATED_LABEL = "Exemple simulé — pas un vrai mail";
export const NOT_FOUND_LABEL =
  "Orbi ne trouve pas la réponse sur votre site → il vous la demandera une seule fois";
/** Same label when step 1 was a description: there is no site to point at. */
export const NOT_FOUND_LABEL_DESCRIPTION =
  "Orbi ne trouve pas la réponse dans votre description → il vous la demandera une seule fois";
/** Fictitious, code-defined parties of the example emails (never model output). */
export const FICTITIOUS_SENDER = { name: "Client fictif", address: "client.fictif@exemple.invalid" } as const;
export const FICTITIOUS_RECIPIENT = "Vous (exemple)";

export type PreviewQuestion = {
  question: string;
  /** Deterministic questions only: which profile category answers it. */
  category?: FactCategory;
  /** Verbatim quote of the source, or null: Orbi will ask the owner once. */
  answer: { quote: string; sourceName: string; sourceUrl?: string } | null;
};
export type PreviewExample = {
  label: typeof SIMULATED_LABEL;
  incoming: { label: typeof SIMULATED_LABEL; from: string; to: string; subject: string; body: string };
  draft: {
    label: typeof SIMULATED_LABEL;
    body: string;
    questions: string[];
    citations: { sourceName: string; excerpt: string }[];
  };
};
export type PreviewFallbackReason = "disabled" | "rate_limited" | "budget" | "busy" | "unavailable" | "error";
export type StartPreview =
  | {
      mode: "ai";
      questions: PreviewQuestion[];
      examples: PreviewExample[];
      /** e.g. "source_instructions_ignored": the page contained instruction-like text. */
      flags: string[];
    }
  | {
      mode: "quotes";
      reason: PreviewFallbackReason;
      /** Likely customer questions answered only from sourced facts (null: à confirmer). */
      questions: PreviewQuestion[];
      found: StartFact[];
      unknowns: string[];
    };

/**
 * Deterministic, model-free preview: only what the owner already confirmed
 * (verbatim quotes) and what Orbi will not guess. No questions or drafts are
 * invented from a template.
 */
export function quotePreview(profile: StartProfile, reason: PreviewFallbackReason): StartPreview {
  return {
    mode: "quotes",
    reason,
    questions: likelyQuestions(profile),
    found: profile.facts.slice(0, 8),
    unknowns: profile.unknowns.slice(0, 10),
  };
}

/** Browser key: a preview was displayed before the account existed (funnel event). */
export const PREVIEW_SHOWN_KEY = "orbis:start:preview-shown";
const previewShownSchema = z.object({ v: z.literal(1), ai: z.boolean(), savedAt: z.number() }).strict();
export function encodePreviewShown(ai: boolean, now = Date.now()) {
  return JSON.stringify({ v: 1, ai, savedAt: now });
}
export function decodePreviewShown(raw: string | null, now = Date.now()): { ai: boolean } | null {
  if (!raw || raw.length > 200) return null;
  try {
    const parsed = previewShownSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const age = now - parsed.data.savedAt;
    return age < 0 || age > PENDING_TTL_MS ? null : { ai: parsed.data.ai };
  } catch {
    return null;
  }
}
