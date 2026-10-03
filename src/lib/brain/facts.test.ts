import { describe, expect, it } from "vitest";
import { buildCandidate, planCandidate } from "./candidates";
import { factConflicts, factSources, type Fact } from "./facts";
import { replyContext } from "@/lib/inbox/context";
import type { StoreState } from "@/lib/domain/types";

const fact = (over: Partial<Fact>): Fact => ({
  id: "f1",
  category: "pricing",
  topicKey: "prix_pose_m2",
  statement: "Pose : 45 € HT/m²",
  condition: null,
  status: "candidate",
  origin: "sent_mail",
  quotes: [{ quote: "la pose est à 45 € HT/m²", messageId: "m1", sentAt: "2026-08-01T10:00:00.000Z" }],
  evidenceAt: "2026-08-01T10:00:00.000Z",
  confidence: 0.8,
  validUntil: null,
  questionId: null,
  version: 1,
  reviewedAt: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  ...over,
});
const evidence = (text: string) => ({
  text,
  messageId: "m9",
  sentAt: "2026-09-20T10:00:00.000Z",
  redaction: { thirdParties: ["paul.martin@client.fr"] },
});

describe("buildCandidate", () => {
  it("drops facts whose quotes are not exact substrings of the owner's text", () => {
    expect(
      buildCandidate(
        { category: "pricing", topic: "prix", statement: "Pose 45 €", quotes: [{ quote: "la pose est à 50 € HT/m²", evidence: evidence("la pose est à 45 € HT/m²") }] },
        "sent_mail",
      ),
    ).toBeNull();
    expect(
      buildCandidate(
        { category: "pricing", topic: "prix", statement: "Pose 45 €", quotes: [{ quote: "la pose est à 45 € HT/m²", evidence: undefined }] },
        "sent_mail",
      ),
    ).toBeNull();
  });
  it("redacts third-party data in quotes and statement after verification", () => {
    const c = buildCandidate(
      {
        category: "pricing",
        topic: "Prix pose m²",
        statement: "Pour Paul Martin : pose à 45 € HT/m²",
        quotes: [{ quote: "Bonjour Paul, la pose est à 45 € HT/m²", evidence: evidence("Bonjour Paul, la pose est à 45 € HT/m², à bientôt") }],
      },
      "sent_mail",
    )!;
    expect(c.quotes[0].quote).toBe("Bonjour [client], la pose est à 45 € HT/m²");
    expect(c.statement).not.toMatch(/Paul|Martin/);
    expect(c.topicKey).toBe("prix_pose_m2");
    expect(c.evidenceAt).toBe("2026-09-20T10:00:00.000Z");
  });
});

describe("conflicts and dedup", () => {
  it("flags two different statements on the same topic, newest first, both kept", () => {
    const facts = [
      fact({ id: "old", statement: "Pose : 40 € HT/m²", evidenceAt: "2026-06-01T00:00:00.000Z" }),
      fact({ id: "new", statement: "Pose : 45 € HT/m²", evidenceAt: "2026-09-01T00:00:00.000Z" }),
      fact({ id: "other", topicKey: "delai", category: "lead_time", statement: "2 semaines" }),
    ];
    expect([...factConflicts(facts).values()]).toEqual([["new", "old"]]);
  });
  it("merges a repeated statement, never re-proposes a rejected one, inserts a conflicting one", () => {
    const candidate = buildCandidate(
      { category: "pricing", topic: "prix pose m2", statement: "Pose : 45 € HT / m²", quotes: [{ quote: "pose est à 45 € HT/m²", evidence: evidence("la pose est à 45 € HT/m²") }] },
      "sent_mail",
    )!;
    expect(planCandidate(candidate, [fact({})])).toMatchObject({ action: "merge", factId: "f1" });
    expect(planCandidate(candidate, [fact({ status: "rejected", quotes: [] })])).toEqual({ action: "skip", reason: "rejected_before" });
    expect(planCandidate({ ...candidate, statement: "Pose : 60 € HT/m²" }, [fact({})])).toEqual({ action: "insert" });
  });
});

describe("factSources: only approved facts reach drafting", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  it("excludes candidates, rejected, superseded and expired facts", () => {
    const sources = factSources(
      [
        fact({ id: "cand" }),
        fact({ id: "ok", status: "approved", topicKey: "a" }),
        fact({ id: "rej", status: "rejected", topicKey: "b" }),
        fact({ id: "sup", status: "superseded", topicKey: "c" }),
        fact({ id: "exp", status: "approved", topicKey: "d", validUntil: "2026-09-01T00:00:00Z" }),
        fact({ id: "tone", status: "approved", category: "tone", topicKey: "tutoiement", statement: "Tutoie ses clients" }),
        fact({ id: "dep", status: "approved", category: "terms", topicKey: "acompte", statement: "Acompte : ça dépend", condition: "30 % au-delà de 1 000 €" }),
      ],
      now,
    );
    expect(sources.map((s) => s.id)).toEqual(expect.arrayContaining(["fact:ok", "fact:tone", "fact:dep"]));
    expect(sources).toHaveLength(3);
    expect(sources.find((s) => s.id === "fact:tone")?.kind).toBe("instruction");
    expect(sources.find((s) => s.id === "fact:dep")?.content).toContain("Ça dépend : 30 % au-delà de 1 000 €");
  });
  it("feeds approved facts into the reply context next to the website profile", () => {
    const state = {
      workspace: { id: "ws", tenantId: "t" },
      profile: null,
      sources: [],
      instructions: [],
      memory: [],
      missions: [],
      missionVersions: [],
    } as unknown as StoreState;
    const ctx = replyContext(state, factSources([fact({ status: "approved" })], now));
    expect(ctx.sourcesFor("prix pose").map((s) => s.id)).toContain("fact:f1");
  });
});
