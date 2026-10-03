import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import type { CandidateFact } from "./candidates";
import { classifyOutcome, similarityRatio } from "./diff";
import type { BrainModel } from "./model";
import { checkDraftOutcomes, type OutcomeRecord, type OutcomeStore } from "./outcomes";

const DRAFT =
  "Bonjour,\nMerci pour votre demande. La pose de parquet est à [[À CONFIRMER : prix de la pose au m²]]. Nous pouvons intervenir sous deux semaines.\nCordialement,\nPaul";
const drafted = "2026-09-20T10:00:00.000Z";
const now = new Date("2026-09-22T10:00:00.000Z");
const reply = (text: string, sentAt = "2026-09-21T08:00:00.000Z"): MailMessage => ({
  provider: "gmail",
  id: "sent-1",
  threadId: "t1",
  from: { address: "paul@atelier-bois.fr" },
  replyTo: [],
  to: ["claire.durand@gmail.com"],
  subject: "Re: devis",
  receivedAt: sentAt,
  text: `${text}\n\nLe 20 sept. 2026, Claire <claire.durand@gmail.com> a écrit :\n> Bonjour`,
  labels: ["SENT"],
  headers: {},
  isDraft: false,
  fromOwner: true,
});

describe("classifyOutcome (deterministic)", () => {
  it("sent as is (placeholder filled is still very close)", () => {
    const r = classifyOutcome({
      draft: DRAFT,
      draftedAt: drafted,
      now,
      sent: [{ id: "s", sentAt: "2026-09-21T08:00:00.000Z", text: DRAFT.replace(/\[\[[^\]]+\]\]/, "45 €") }],
    });
    expect(r.outcome).toBe("sent_as_is");
    expect(r.similarity).toBeGreaterThanOrEqual(0.9);
  });
  it("sent edited / not used / pending", () => {
    const edited = "Salut,\nMerci pour ta demande. La pose de parquet est à 45 € HT/m². On peut passer sous deux semaines.\nA+\nPaul";
    expect(classifyOutcome({ draft: DRAFT, draftedAt: drafted, now, sent: [{ id: "s", sentAt: "2026-09-21T08:00:00.000Z", text: edited }] }).outcome).toBe("sent_edited");
    expect(classifyOutcome({ draft: DRAFT, draftedAt: drafted, now, sent: [{ id: "s", sentAt: "2026-09-21T08:00:00.000Z", text: "Je vous appelle demain pour en parler, bonne journée." }] }).outcome).toBe("not_used");
    expect(classifyOutcome({ draft: DRAFT, draftedAt: drafted, now, sent: [] }).outcome).toBe("pending");
    expect(classifyOutcome({ draft: DRAFT, draftedAt: drafted, now: new Date("2026-10-02T00:00:00Z"), sent: [] }).outcome).toBe("not_used");
  });
  it("ignores replies sent before the draft existed", () => {
    expect(classifyOutcome({ draft: DRAFT, draftedAt: drafted, now, sent: [{ id: "s", sentAt: "2026-09-19T08:00:00.000Z", text: DRAFT }] }).outcome).toBe("pending");
  });
  it("similarity is symmetric-ish and bounded", () => {
    expect(similarityRatio("a b c", "a b c")).toBe(1);
    expect(similarityRatio("a b c", "x y z")).toBe(0);
  });
});

describe("checkDraftOutcomes", () => {
  let records: Map<string, OutcomeRecord>;
  let saved: CandidateFact[];
  let reserveOk: boolean;
  const store = (): OutcomeStore => ({
    dueDrafts: vi.fn(async () => [{ rowId: "row-1", threadId: "t1", draftedAt: drafted, draftPreview: DRAFT }]),
    recordOutcome: vi.fn(async (id: string, r: OutcomeRecord) => {
      records.set(id, r);
    }),
    reserve: vi.fn(async () => (reserveOk ? "u1" : null)),
    addUsage: vi.fn(async () => {}),
    saveCandidates: vi.fn(async (c: CandidateFact[]) => {
      saved.push(...c);
      return { inserted: c.length };
    }),
  });
  const EDITED = "Salut Claire,\nMerci pour ta demande. La pose de parquet est à 45 € HT/m². On peut passer sous deux semaines.\nA+\nPaul";
  const model = (): BrainModel => ({
    extract: vi.fn(),
    explainEdit: vi.fn(async () => ({
      output: {
        proposals: [
          // Invented quote: dropped by the exact-substring check.
          { kind: "fact" as const, category: "terms" as const, topic: "acompte", statement: "Acompte 30 %", quote: "un acompte de 30 % est demandé" },
          { kind: "rule" as const, category: "tone" as const, topic: "tutoiement", statement: "Toujours tutoyer les clients", quote: "Merci pour ta demande." },
          // Third proposal: beyond the 2-proposal cap, never considered.
          { kind: "fact" as const, category: "pricing" as const, topic: "prix pose m2", statement: "Prix pose = 45 € HT/m²", quote: "La pose de parquet est à 45 € HT/m²." },
        ] as never,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    })),
  });
  beforeEach(() => {
    records = new Map();
    saved = [];
    reserveOk = true;
  });
  it("edited reply → at most 2 proposals considered, only verified quotes kept, never applied", async () => {
    const m = model();
    const stats = await checkDraftOutcomes({
      mailbox: { listThreadSent: async () => [reply(EDITED)] },
      model: m,
      store: store(),
      cents: 1,
      now,
    });
    expect(stats).toMatchObject({ checked: 1, sentEdited: 1 });
    expect(m.explainEdit).toHaveBeenCalledWith({ draft: DRAFT, sent: EDITED });
    expect(saved.map((c) => [c.origin, c.category, c.statement])).toEqual([
      ["edit_diff", "tone", "Toujours tutoyer les clients"],
    ]);
    expect(saved.every((c) => !("status" in c))).toBe(true);
    expect(records.get("row-1")).toMatchObject({ outcome: "sent_edited", proposals: 1 });
    expect(JSON.stringify(records.get("row-1"))).not.toContain("Salut"); // counts only
  });
  it("sent as is → no model call; budget reached → outcome recorded, no model call", async () => {
    const m = model();
    await checkDraftOutcomes({ mailbox: { listThreadSent: async () => [reply(DRAFT)] }, model: m, store: store(), cents: 1, now });
    expect(m.explainEdit).not.toHaveBeenCalled();
    expect(records.get("row-1")?.outcome).toBe("sent_as_is");
    reserveOk = false;
    const stats = await checkDraftOutcomes({ mailbox: { listThreadSent: async () => [reply(EDITED)] }, model: m, store: store(), cents: 1, now });
    expect(stats.budgetExhausted).toBe(true);
    expect(m.explainEdit).not.toHaveBeenCalled();
    expect(records.get("row-1")).toMatchObject({ outcome: "sent_edited", proposals: 0 });
  });
  it("a mailbox failure is counted, never thrown", async () => {
    const stats = await checkDraftOutcomes({
      mailbox: { listThreadSent: async () => { throw new Error("down"); } },
      model: model(),
      store: store(),
      cents: 1,
      now,
    });
    expect(stats.failed).toBe(1);
    expect(records.size).toBe(0);
  });
});
