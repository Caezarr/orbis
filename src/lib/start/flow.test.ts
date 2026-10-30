import { describe, expect, it } from "vitest";
import {
  decodePending,
  flagLabel,
  decodePreviewShown,
  encodePreviewShown,
  likelyQuestions,
  quotePreview,
  deriveStep,
  encodePending,
  inboxErrorKind,
  PENDING_TTL_MS,
  profileFromDescription,
  profileFromSite,
  progressPhase,
  siteName,
  splitPlaceholders,
  startProfileSchema,
  stepState,
  summarizeResults,
  type InboxMessageView,
  type StartFacts,
} from "./flow";

const base: StartFacts = {
  authenticated: false,
  pendingProfile: false,
  workspaceProfile: false,
  mailbox: "unknown",
  batch: null,
};

describe("deriveStep", () => {
  it("starts anonymous visitors on the company step", () => {
    expect(deriveStep(base)).toBe("company");
  });
  it("asks for an account once the profile is confirmed, without a session", () => {
    expect(deriveStep({ ...base, pendingProfile: true })).toBe("account");
  });
  it("keeps step 1 open while the anonymous instant preview is shown", () => {
    expect(deriveStep({ ...base, pendingProfile: true, previewing: true })).toBe("company");
    expect(deriveStep({ ...base, pendingProfile: true, previewing: false })).toBe("account");
  });
  it("keeps the company step open while a pending profile is saved after login", () => {
    expect(deriveStep({ ...base, authenticated: true, pendingProfile: true })).toBe("company");
  });
  it("asks signed-in users without a profile for their company", () => {
    expect(deriveStep({ ...base, authenticated: true })).toBe("company");
  });
  it("moves to the mailbox once the workspace profile exists", () => {
    for (const mailbox of ["unknown", "checking", "not_connected", "error", "not_configured"] as const)
      expect(deriveStep({ ...base, authenticated: true, workspaceProfile: true, mailbox })).toBe("mailbox");
  });
  it("only a server-verified connection unlocks drafts", () => {
    expect(deriveStep({ ...base, authenticated: true, workspaceProfile: true, mailbox: "connected" })).toBe("drafts");
  });
  it("an existing batch shows results even if verification is pending", () => {
    expect(deriveStep({ ...base, authenticated: true, workspaceProfile: true, mailbox: "checking", batch: "running" })).toBe(
      "drafts",
    );
  });
  it("editing the profile reopens the company step", () => {
    expect(
      deriveStep({ ...base, authenticated: true, workspaceProfile: true, mailbox: "connected", editingProfile: true }),
    ).toBe("company");
  });
  it("labels steps relative to the current one", () => {
    expect(stepState("company", "mailbox")).toBe("done");
    expect(stepState("mailbox", "mailbox")).toBe("current");
    expect(stepState("drafts", "mailbox")).toBe("upcoming");
  });
});

describe("profiles", () => {
  const site = {
    website: "https://www.atelier-dupont.fr/",
    title: "Atelier Dupont | Menuiserie sur mesure à Lille",
    description: "Cuisines, dressings et escaliers sur mesure, fabriqués dans notre atelier lillois.",
    excerpt:
      "Accepter les cookies. Nous concevons et posons des cuisines sur mesure pour les particuliers de la métropole lilloise. Devis gratuit sous 48 heures après visite.",
  };
  it("builds a deterministic profile with verbatim quotes only", () => {
    const p = profileFromSite(site);
    expect(p.name).toBe("Atelier Dupont");
    expect(p.origin).toBe("site");
    expect(p.summary).toBe(site.description);
    for (const f of p.facts) {
      expect([site.title, site.description, site.excerpt].some((src) => src.includes(f.quote))).toBe(true);
      expect(f.sourceUrl).toBe(site.website);
    }
    expect(p.facts.some((f) => /cookies/i.test(f.quote))).toBe(false);
    expect(p.unknowns.length).toBeGreaterThan(0);
    expect(startProfileSchema.safeParse(p).success).toBe(true);
  });
  it("falls back to the hostname when the title is empty", () => {
    expect(siteName("", "www.example.fr")).toBe("example.fr");
    const p = profileFromSite({ ...site, title: "", description: "", excerpt: "" });
    expect(p.name).toBe("atelier-dupont.fr");
    expect(startProfileSchema.safeParse(p).success).toBe(true);
  });
  it("uses the owner's own words for a description intake", () => {
    const p = profileFromDescription("Plombier chauffagiste à Roubaix. Dépannage et installation de chaudières.", "  ");
    expect(p.name).toBe("Plombier chauffagiste à Roubaix");
    expect(p.facts[0].label).toBe("Décrit par vous");
    expect(p.origin).toBe("description");
    expect(startProfileSchema.safeParse(p).success).toBe(true);
  });
  it("rejects unknown fields in a submitted profile", () => {
    const p = { ...profileFromDescription("Une description de vingt caractères au moins."), tenantId: "evil" };
    expect(startProfileSchema.safeParse(p).success).toBe(false);
  });
});

describe("pending profile storage", () => {
  const profile = profileFromDescription("Une description de vingt caractères au moins.");
  it("round-trips within the TTL", () => {
    expect(decodePending(encodePending(profile, 1000), 2000)).toEqual(profile);
  });
  it("expires after the TTL and rejects future timestamps", () => {
    expect(decodePending(encodePending(profile, 0), PENDING_TTL_MS + 1)).toBeNull();
    expect(decodePending(encodePending(profile, 5000), 1000)).toBeNull();
  });
  it("rejects malformed or oversized values", () => {
    expect(decodePending(null)).toBeNull();
    expect(decodePending("{")).toBeNull();
    expect(decodePending(JSON.stringify({ v: 1, savedAt: 1, profile: { name: "x" } }), 2)).toBeNull();
    expect(decodePending("x".repeat(20_001))).toBeNull();
  });
});

describe("inbox errors and progress", () => {
  it("maps backend errors to actionable kinds", () => {
    expect(inboxErrorKind(503, "Inbox drafts are not enabled for this deployment.")).toBe("flag_disabled");
    expect(inboxErrorKind(503, "Configure a monthly budget before enabling inbox drafts")).toBe("budget_missing");
    expect(inboxErrorKind(503, "Mailbox connection is not configured. Ask an administrator to enable it.")).toBe(
      "provider_not_configured",
    );
    expect(inboxErrorKind(503, "Inbox drafts need an authenticated workspace.")).toBe("offline");
    expect(inboxErrorKind(409, "Connect your mailbox first.")).toBe("connection_unverified");
    expect(inboxErrorKind(409, "Choose which connected mailbox to use.")).toBe("multiple_mailboxes");
    expect(inboxErrorKind(409, "Idempotency key already used for a different request")).toBe("conflict");
    expect(inboxErrorKind(401)).toBe("auth_required");
    expect(inboxErrorKind(403)).toBe("forbidden");
    expect(inboxErrorKind(500, "boom")).toBe("unknown");
  });
  it("reports only phases the backend exposes", () => {
    expect(progressPhase({ status: "queued" }, [])).toBe("queued");
    expect(progressPhase({ status: "running" }, [{ status: "seen" }, { status: "classified" }])).toBe("reading");
    expect(progressPhase({ status: "running" }, [{ status: "drafting" }])).toBe("drafting");
    expect(progressPhase({ status: "completed" }, [])).toBe("done");
    expect(progressPhase({ status: "budget_exhausted" }, [])).toBe("budget");
    expect(progressPhase({ status: "failed" }, [])).toBe("failed");
  });
});

describe("results", () => {
  const msg = (over: Partial<InboxMessageView>): InboxMessageView => ({
    id: Math.random().toString(36),
    provider: "gmail",
    status: "skipped",
    flags: [],
    questions: [],
    citations: [],
    ...over,
  });
  const messages = [
    msg({ status: "drafted", classification: "quote_request", draftPreview: "Bonjour", draft: { id: "simulated:1", simulated: true } }),
    msg({ status: "needs_review", classification: "customer_request", flags: ["reply_to_diverges"] }),
    msg({ status: "skipped", skipReason: "bulk_or_newsletter" }),
    msg({ status: "skipped", skipReason: "bulk_or_newsletter" }),
    msg({ status: "skipped", skipReason: "already_replied" }),
    msg({ status: "classified", classification: "supplier" }),
    msg({ status: "classified", classification: "customer_request", flags: ["awaiting_draft_quota"] }),
    msg({ status: "uncertain" }),
  ];
  it("puts drafts first and accounts for every other message", () => {
    const r = summarizeResults({ mode: "test" }, messages);
    expect(r.drafts).toHaveLength(1);
    expect(r.review).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ reason: "bulk_or_newsletter", count: 2 });
    expect(r.skipped.find((x) => x.reason === "already_replied")?.count).toBe(1);
    expect(r.notActionable).toEqual([{ classification: "supplier", label: "Fournisseur", count: 1 }]);
    expect(r.awaitingQuota).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.simulated).toBe(true);
  });
  it("is not simulated only in scoped autonomy with real drafts", () => {
    const real = [msg({ status: "drafted", draftPreview: "Bonjour", draft: { id: "r1", simulated: false, openUrl: "https://mail.google.com/mail/u/0/#drafts" } })];
    expect(summarizeResults({ mode: "scoped_autonomy" }, real).simulated).toBe(false);
  });
  it("splits placeholders for highlighting", () => {
    expect(splitPlaceholders("Le prix est [[À CONFIRMER : tarif pose]] HT.")).toEqual([
      { text: "Le prix est ", placeholder: false },
      { text: "À CONFIRMER : tarif pose", placeholder: true },
      { text: " HT.", placeholder: false },
    ]);
    expect(splitPlaceholders("Aucun")).toEqual([{ text: "Aucun", placeholder: false }]);
    expect(splitPlaceholders("[[A]][[B]]").filter((p) => p.placeholder)).toHaveLength(2);
  });
});

describe("instant preview (client-safe helpers)", () => {
  const p = profileFromDescription("Menuiserie sur mesure à Lille pour les particuliers.", "Atelier");
  it("quote-only preview shows only confirmed quotes and unknowns", () => {
    expect(quotePreview(p, "disabled")).toEqual({
      mode: "quotes",
      reason: "disabled",
      questions: likelyQuestions(p),
      found: p.facts,
      unknowns: p.unknowns,
    });
  });
  it("round-trips the preview-shown marker and rejects tampered or expired values", () => {
    const now = 1_000_000;
    expect(decodePreviewShown(encodePreviewShown(true, now), now)).toEqual({ ai: true });
    expect(decodePreviewShown(encodePreviewShown(false, now), now + PENDING_TTL_MS + 1)).toBeNull();
    expect(decodePreviewShown('{"v":1,"ai":"yes","savedAt":1}', now)).toBeNull();
    expect(decodePreviewShown("{", now)).toBeNull();
  });
});

describe("flagLabel", () => {
  it("says a vague delay was flagged, not replaced", () => {
    expect(flagLabel("guard:vague_delay")).toMatch(/délai vague/);
    expect(flagLabel("guard:unsupported_delay")).toBe(
      "Des informations non sourcées ont été remplacées par des questions.",
    );
  });
});
