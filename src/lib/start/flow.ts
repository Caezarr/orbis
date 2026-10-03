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

export const startFactSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    quote: z.string().trim().min(2).max(600),
    sourceUrl: z.url().max(2000).optional(),
  })
  .strict();
export const startProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    summary: z.string().trim().min(10).max(1800),
    website: z.url().max(2000).optional(),
    facts: z.array(startFactSchema).max(8),
    unknowns: z.array(z.string().trim().min(2).max(200)).max(8),
    origin: z.enum(["ai", "site", "description"]),
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
  if (!raw || raw.length > 20_000) return null;
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
export function flagLabel(flag: string) {
  if (flag.startsWith("injection_suspected:"))
    return "Le mail contient des instructions suspectes : elles ont été ignorées.";
  if (flag.startsWith("guard:"))
    return "Des informations non sourcées ont été remplacées par des questions.";
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
/** Fictitious, code-defined parties of the example emails (never model output). */
export const FICTITIOUS_SENDER = { name: "Client fictif", address: "client.fictif@exemple.invalid" } as const;
export const FICTITIOUS_RECIPIENT = "Vous (exemple)";

export type PreviewQuestion = {
  question: string;
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
      found: StartFact[];
      unknowns: string[];
    };

/**
 * Deterministic, model-free preview: only what the owner already confirmed
 * (verbatim quotes) and what Orbi will not guess. No questions or drafts are
 * invented from a template.
 */
export function quotePreview(profile: StartProfile, reason: PreviewFallbackReason): StartPreview {
  return { mode: "quotes", reason, found: profile.facts.slice(0, 8), unknowns: profile.unknowns.slice(0, 8) };
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
