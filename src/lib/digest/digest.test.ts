import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { appOrigin, composeDigest, isEmptyDigest, normalizeCounts, type DigestCounts } from "./compose";
import { deliverDigest, digestDeliveryMode, digestIdempotencyKey, digestPolicyHash, isDeliverableAddress } from "./delivery";
import { digestCounts, runDigestForSubscriber, runDigestPass, MAX_WINDOW_MS } from "./service";
import { GET as cronGET } from "@/app/api/cron/digest/route";
import { FOLLOWUP_READY_SQL } from "@/lib/followups/detect";
import { DECIDED_AT_SQL } from "@/lib/inbox/decided";

afterEach(() => vi.unstubAllEnvs());

const zero: DigestCounts = { draftsReady: 0, draftsWithQuestions: 0, needsReview: 0, orbiQuestions: 0, followupsReady: 0, simulatedDrafts: 0, simulatedFollowups: 0 };
const some: DigestCounts = { draftsReady: 3, draftsWithQuestions: 1, needsReview: 2, orbiQuestions: 1, followupsReady: 1, simulatedDrafts: 0, simulatedFollowups: 0 };
const identity = { tenantId: "t1", workspaceId: "w1", userId: "u1" };

describe("digest content", () => {
  it("is counts and fixed text only, with the app link", () => {
    const m = composeDigest(some, "https://app.orbis.test");
    expect(m.subject).toBe("Orbi : 3 brouillons prêts à relire");
    expect(m.text).toContain("3 brouillons prêts à relire dans votre boîte (dont 1 avec une question surlignée à compléter)");
    expect(m.text).toContain("1 relance préparée à relire");
    expect(m.text).toContain("2 messages à vérifier");
    expect(m.text).toContain("1 question d’Orbi sans réponse");
    expect(m.text).toContain("Rien n’a été envoyé à vos clients");
    expect(m.text).toContain("https://app.orbis.test/today");
    expect(m.html).toContain('href="https://app.orbis.test/today"');
    // No address or other link than the app's own pages.
    expect(m.text.match(/https?:\/\/[^\s]+/g)).toEqual(["https://app.orbis.test/today", "https://app.orbis.test/settings#resume"]);
    expect(m.text).not.toContain("@");
  });
  it("points the opt-out at Réglages, where the toggle actually is", () => {
    const m = composeDigest(some, "https://app.orbis.test");
    // The toggle is on /settings (section #resume), not on Today.
    expect(m.text).not.toContain("depuis la page Aujourd’hui");
    expect(m.text).toContain("Vous pouvez l’arrêter dans Réglages › Résumé quotidien.");
    expect(m.text).toContain("Arrêter le résumé : https://app.orbis.test/settings#resume");
    expect(m.html).toContain('<a href="https://app.orbis.test/settings#resume">Arrêter le résumé</a>');
    // …and that section really holds the toggle.
    const page = readFileSync(join(process.cwd(), "src/app/(workspace)/settings/page.tsx"), "utf8");
    const section = page.slice(page.indexOf('<section id="resume"'), page.indexOf("</section>", page.indexOf('<section id="resume"')));
    expect(section).toContain("<DigestToggle");
  });
  it("omits zero lines and uses a generic subject without drafts", () => {
    const m = composeDigest({ ...zero, orbiQuestions: 2 }, "https://app.orbis.test");
    expect(m.subject).toBe("Orbi : votre résumé du jour");
    expect(m.text).not.toContain("brouillon prêt");
    expect(m.text).toContain("2 questions d’Orbi sans réponse");
  });
  it("normalizes counts and detects an empty day", () => {
    expect(isEmptyDigest(zero)).toBe(true);
    expect(isEmptyDigest({ ...zero, draftsWithQuestions: 4 })).toBe(true);
    expect(isEmptyDigest({ ...zero, followupsReady: 1 })).toBe(false);
    expect(normalizeCounts({ ...some, draftsReady: -1, draftsWithQuestions: 5, needsReview: 1.5, orbiQuestions: 1e9 })).toEqual({
      draftsReady: 0,
      draftsWithQuestions: 0,
      needsReview: 0,
      orbiQuestions: 9_999,
      followupsReady: 1,
      simulatedDrafts: 0,
      simulatedFollowups: 0,
    });
  });
  it("never counts test-mode drafts as drafts in the mailbox", () => {
    const m = composeDigest({ ...zero, simulatedDrafts: 2 }, "https://app.orbis.test");
    expect(isEmptyDigest({ ...zero, simulatedDrafts: 2 })).toBe(false);
    expect(m.subject).toBe("Orbi : votre résumé du jour");
    expect(m.text).not.toContain("brouillon prêt");
    expect(m.text).not.toContain("à relire dans votre boîte");
    expect(m.text).toContain("2 brouillons d’essai (mode test) visibles dans Orbis seulement : rien n’a été écrit dans votre boîte");
    expect(composeDigest({ ...zero, simulatedDrafts: 1 }).text).toContain("1 brouillon d’essai (mode test) visible dans Orbis seulement");
    const f = composeDigest({ ...zero, simulatedFollowups: 2 }, "https://app.orbis.test");
    expect(isEmptyDigest({ ...zero, simulatedFollowups: 2 })).toBe(false);
    expect(f.text).toContain("2 relances d’essai (mode test) visibles dans Orbis seulement : rien n’a été écrit dans votre boîte");
    expect(f.text).not.toContain("relance préparée");
  });
  it("never presents what is still open as new since the last digest", () => {
    // Follow-ups and Orbi's questions are counted as they stand now: they can
    // come back every day, so they sit under « En attente », not « Depuis ».
    const waitingOnly = composeDigest({ ...zero, orbiQuestions: 1, followupsReady: 2, simulatedFollowups: 1 }, "https://app.orbis.test");
    expect(waitingOnly.text).not.toContain("Depuis le dernier résumé");
    expect(waitingOnly.html).not.toContain("Depuis le dernier résumé");
    expect(waitingOnly.text).toContain("En attente en ce moment :\n- 2 relances préparées à relire\n- 1 relance d’essai");
    const both = composeDigest({ ...some, simulatedDrafts: 1 }, "https://app.orbis.test").text;
    const since = both.slice(both.indexOf("Depuis le dernier résumé :"), both.indexOf("En attente en ce moment :"));
    const now = both.slice(both.indexOf("En attente en ce moment :"));
    expect(since).toContain("3 brouillons prêts");
    expect(since).toContain("1 brouillon d’essai");
    expect(since).toContain("2 messages à vérifier");
    expect(since).not.toContain("relance");
    expect(since).not.toContain("question d’Orbi");
    expect(now).toContain("1 relance préparée à relire");
    expect(now).toContain("1 question d’Orbi sans réponse");
    const recentOnly = composeDigest({ ...zero, needsReview: 1 }, "https://app.orbis.test");
    expect(recentOnly.text).toContain("Depuis le dernier résumé :");
    expect(recentOnly.text).not.toContain("En attente");
  });
  it("only links to an https app origin", () => {
    expect(appOrigin("https://app.orbis.test/x?y")).toBe("https://app.orbis.test");
    for (const bad of [undefined, "", "http://app.orbis.test", "javascript:alert(1)", "https://u:p@app.orbis.test"])
      expect(appOrigin(bad)).toMatch(/^https:\/\/orbis-/);
  });
});

describe("digest delivery broker", () => {
  const message = composeDigest(some, "https://app.orbis.test");
  const base = { recipient: "owner@client.test", mode: "simulated" as const, idempotencyKey: "k".repeat(64), policyHash: digestPolicyHash("simulated") };
  it("only the simulated mode exists; anything else is refused", async () => {
    expect(digestDeliveryMode({})).toBe("simulated");
    expect(digestDeliveryMode({ ORBIS_DIGEST_DELIVERY: "simulated" })).toBe("simulated");
    expect(digestDeliveryMode({ ORBIS_DIGEST_DELIVERY: "resend" })).toBe("unsupported");
    expect((await deliverDigest(message, base)).outcome).toBe("simulated");
    expect((await deliverDigest(message, { ...base, mode: "unsupported", policyHash: digestPolicyHash("unsupported") })).outcome).toBe("refused");
  });
  it("refuses a policy mismatch, a bad address or an oversized payload", async () => {
    expect((await deliverDigest(message, { ...base, policyHash: digestPolicyHash("unsupported") })).outcome).toBe("refused");
    for (const recipient of ["", "no-at", "a@b", "x@y.test\r\nBcc: z@evil.test", "a b@c.test"])
      expect((await deliverDigest(message, { ...base, recipient })).outcome).toBe("refused");
    expect((await deliverDigest({ ...message, html: "x".repeat(9_000) }, base)).outcome).toBe("refused");
  });
  it("keys one claim per workspace, user and day", () => {
    const a = digestIdempotencyKey(identity, "2026-10-02");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(digestIdempotencyKey(identity, "2026-10-03")).not.toBe(a);
    expect(digestIdempotencyKey({ ...identity, userId: "u2" }, "2026-10-02")).not.toBe(a);
    expect(isDeliverableAddress("owner@client.test")).toBe(true);
  });
});

type Sub = { recipient: string | null; last_window_end: Date | null; day: string; due: boolean } | undefined;
function fakeDb(sub: Sub, claim = 1) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.startsWith("SELECT recipient")) return { rows: sub ? [sub] : [], rowCount: sub ? 1 : 0 };
      if (sql.startsWith("INSERT INTO digest_deliveries")) return { rows: [], rowCount: claim };
      return { rows: [], rowCount: 1 };
    }),
  };
  return { db: db as unknown as PoolClient, calls };
}

describe("digest counts", () => {
  it("splits test-mode drafts out of the mailbox counts (inbox and follow-ups)", async () => {
    const sqls: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        sqls.push(sql);
        if (sql.includes("FROM inbox_messages")) return { rows: [{ drafts: "2", questions: "1", simulated: "3", review: "0" }] };
        if (sql.includes("FROM brain_questions")) return { rows: [{ n: "0" }] };
        return { rows: [{ n: "1", simulated: "4" }] };
      }),
    } as unknown as PoolClient;
    const counts = await digestCounts(db, identity, new Date("2026-10-01T06:00:00Z"), new Date("2026-10-02T06:00:00Z"));
    expect(counts).toEqual({ draftsReady: 2, draftsWithQuestions: 1, needsReview: 0, orbiQuestions: 0, followupsReady: 1, simulatedDrafts: 3, simulatedFollowups: 4 });
    const inbox = sqls.find((q) => q.includes("FROM inbox_messages"))!;
    expect(inbox).toMatch(/status='drafted' AND draft_state<>'simulated'[^\n]*AS drafts/);
    expect(inbox).toMatch(/status='drafted' AND draft_state<>'simulated'[^\n]*AS questions/);
    expect(sqls.find((q) => q.includes("FROM followups"))).toMatch(/draft_state<>'simulated'\)::text AS n/);
  });
  it("dates a message to check by the batch that decided it, not by updated_at (purge, contact erasure)", async () => {
    const sqls: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        sqls.push(sql);
        return { rows: [{ n: "0", simulated: "0", drafts: "0", questions: "0", review: "0" }] };
      }),
    } as unknown as PoolClient;
    await digestCounts(db, identity, new Date("2026-10-01T06:00:00Z"), new Date("2026-10-02T06:00:00Z"));
    const inbox = sqls.find((q) => q.includes("FROM inbox_messages"))!;
    const review = inbox.split("\n").find((line) => line.includes("AS review"))!;
    expect(review).toContain(`${DECIDED_AT_SQL}>$3 AND ${DECIDED_AT_SQL}<=$4`);
    expect(review).not.toContain("updated_at");
    // No updated_at pre-filter either: a batch that completes in the window may
    // have set the status before the previous digest ran.
    expect(inbox).not.toMatch(/WHERE workspace_id=\$1 AND tenant_id=\$2 AND updated_at/);
    expect(DECIDED_AT_SQL).toContain("b.completed_at");
    expect(DECIDED_AT_SQL).toContain("b.id=m.batch_id AND b.workspace_id=m.workspace_id AND b.tenant_id=m.tenant_id");
  });
  it("counts a follow-up only when a draft was written (not one held at the recipient check)", async () => {
    const sqls: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        sqls.push(sql);
        return { rows: [{ n: "0", simulated: "0", drafts: "0", questions: "0", review: "0" }] };
      }),
    } as unknown as PoolClient;
    await digestCounts(db, identity, new Date("2026-10-01T06:00:00Z"), new Date("2026-10-02T06:00:00Z"));
    const followups = sqls.find((q) => q.includes("FROM followups"))!;
    expect(followups).toContain(FOLLOWUP_READY_SQL);
    expect(followups).not.toContain("f.drafted_at IS NULL");
    expect(FOLLOWUP_READY_SQL).toContain("f.drafted_at IS NOT NULL");
    expect(FOLLOWUP_READY_SQL).toContain("NOT i.followups_dismissed");
    expect(FOLLOWUP_READY_SQL).toContain("i.contact_erased_at IS NULL");
  });
});

describe("one subscriber", () => {
  const now = new Date("2026-10-02T06:00:00Z");
  const sub = { recipient: "owner@client.test", last_window_end: new Date("2026-10-01T06:00:00Z"), day: "2026-10-02", due: true };

  it("claims, delivers through the broker and records the outcome", async () => {
    const { db, calls } = fakeDb(sub);
    const deliver = vi.fn(deliverDigest);
    const counts = vi.fn(async () => some);
    expect(await runDigestForSubscriber(db, identity, now, { mode: "simulated", counts, deliver })).toBe("simulated");
    expect(counts).toHaveBeenCalledWith(db, identity, sub.last_window_end, now);
    expect(deliver.mock.calls[0]![1]).toMatchObject({ recipient: "owner@client.test", idempotencyKey: digestIdempotencyKey(identity, "2026-10-02") });
    const insert = calls.findIndex((c) => c.sql.startsWith("INSERT INTO digest_deliveries"));
    const update = calls.findIndex((c) => c.sql.startsWith("UPDATE digest_deliveries"));
    expect(insert).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(insert);
    expect(calls[update]!.params[4]).toBe("simulated");
    // Ledger rows carry counts, never the recipient.
    expect(JSON.stringify(calls[insert]!.params)).not.toContain("@");
  });
  it("sends nothing on an empty day but marks the day handled", async () => {
    const { db, calls } = fakeDb(sub);
    const deliver = vi.fn(deliverDigest);
    expect(await runDigestForSubscriber(db, identity, now, { counts: async () => zero, deliver })).toBe("skipped_empty");
    expect(deliver).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.startsWith("UPDATE digest_subscriptions SET last_day"))).toBe(true);
  });
  it("does nothing when already claimed today, not due, or opted out", async () => {
    const deliver = vi.fn(deliverDigest);
    expect(await runDigestForSubscriber(fakeDb(sub, 0).db, identity, now, { counts: async () => some, deliver })).toBe("not_due");
    expect(await runDigestForSubscriber(fakeDb({ ...sub, due: false }).db, identity, now, { deliver })).toBe("not_due");
    expect(await runDigestForSubscriber(fakeDb(undefined).db, identity, now, { deliver })).toBe("not_due");
    expect(deliver).not.toHaveBeenCalled();
  });
  it("never looks back more than 7 days and records a failed delivery", async () => {
    const { db, calls } = fakeDb({ ...sub, last_window_end: null });
    const counts = vi.fn(async () => some);
    const outcome = await runDigestForSubscriber(db, identity, now, {
      counts,
      deliver: async () => {
        throw new Error("boom");
      },
    });
    expect(outcome).toBe("failed");
    expect((counts.mock.calls[0] as unknown[])[2]).toEqual(new Date(now.getTime() - MAX_WINDOW_MS));
    expect(calls.find((c) => c.sql.startsWith("UPDATE digest_deliveries"))!.params[4]).toBe("failed");
  });
});

describe("daily pass", () => {
  it("runs each due subscriber in its own context and returns counts only", async () => {
    const due = [identity, { ...identity, userId: "u2" }, { ...identity, workspaceId: "w2" }];
    const outcomes = ["simulated", "skipped_empty"] as const;
    let i = 0;
    const run = vi.fn(async (id: typeof identity) => {
      if (id.workspaceId === "w2") throw new Error("membership");
      return outcomes[i++]!;
    });
    const result = await runDigestPass({ discover: async () => due, run });
    expect(run).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ due: 3, simulated: 1, sent: 0, skippedEmpty: 1, refused: 0, failed: 0, errors: 1 });
  });
  it("cron route: CRON_SECRET first, then the feature flag", async () => {
    const secret = "s".repeat(40);
    vi.stubEnv("CRON_SECRET", secret);
    vi.stubEnv("ORBIS_DIGEST", "");
    const req = (auth?: string) =>
      new Request("https://orbis.test/api/cron/digest", { headers: auth ? { authorization: auth } : {} });
    expect((await cronGET(req(`Bearer ${secret}`))).status).toBe(200);
    expect(await (await cronGET(req(`Bearer ${secret}`))).json()).toEqual({ skipped: "disabled" });
  });
});
