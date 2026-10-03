import { describe, expect, it, vi } from "vitest";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import { MailboxPolicyError, type DraftLedger } from "@/lib/integrations/mailbox";
import type { FollowupState } from "./detect";
import type { FollowupModel } from "./model";
import {
  followupIdempotencyKey,
  runFollowups,
  trackRequest,
  type FollowupStore,
  type FollowupUpdate,
  type Observation,
  type RequestStore,
  type TrackedItem,
} from "./tracker";

const ids = { tenantId: "t", workspaceId: "w", connectedAccountId: "acc" };
const msg = (over: Partial<MailMessage>): MailMessage => ({
  provider: "gmail",
  id: "m",
  threadId: "th",
  from: { address: "claire@client.test", name: "Claire Durand" },
  replyTo: [],
  to: ["paul@atelier.test"],
  subject: "Devis parquet",
  receivedAt: "2026-10-01T08:00:00.000Z",
  text: "Bonjour, quel est votre prix ?",
  labels: [],
  headers: {},
  isDraft: false,
  fromOwner: false,
  ...over,
});
const ownerMsg = (text: string, receivedAt = "2026-10-02T14:00:00.000Z", to = ["claire@client.test"]) =>
  msg({ id: "o1", from: { address: "paul@atelier.test" }, to, receivedAt, text, fromOwner: true });

function harness(opts: {
  thread: MailMessage[];
  item?: Partial<TrackedItem>;
  now?: string;
  canDraft?: boolean;
  budget?: boolean;
  existingRow?: boolean;
  waiting?: { awaitingReply: boolean; kind: "quote" | "answer" | "question" | "closing" | "other" };
  recipients?: string[];
}) {
  const item: TrackedItem = {
    id: "item-1",
    threadId: "th",
    kind: "quote_request",
    contactEmail: "claire@client.test",
    status: "nouveau",
    firstCustomerAt: "2026-10-01T08:00:00.000Z",
    firstRepliedAt: null,
    relanceAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    snoozedUntil: null,
    followupsDismissed: false,
    followups: [] as FollowupState[],
    ...opts.item,
  };
  const observations: Observation[] = [];
  const updates: FollowupUpdate[] = [];
  const begun: unknown[] = [];
  const reserved: string[] = [];
  const store: FollowupStore = {
    settings: async () => ({ enabled: true, businessDays: 5, maxStages: 2 }),
    dueItems: async () => [item],
    saveObservation: async (_id, obs) => void observations.push(obs),
    beginFollowup: async (_id, input) => {
      begun.push(input);
      return opts.existingRow ? null : "f-1";
    },
    finishFollowup: async (_id, u) => void updates.push(u),
    reserve: async (kind) => {
      reserved.push(kind);
      return opts.budget === false ? null : `u-${kind}`;
    },
    addUsage: async () => {},
    ledger: () => ({}) as DraftLedger,
    heartbeat: async () => true,
  };
  const createReplyDraft = vi.fn(async (input: { recipient: string; body: string }) => ({
    draftId: "simulated:1",
    threadId: "th",
    payloadHash: "h",
    policyHash: "p",
    simulated: true,
    reconciled: false,
    created: false,
    ...(opts.recipients ? { recipients: opts.recipients } : {}),
    _input: input,
  }));
  const mailbox = { readThread: vi.fn(async () => opts.thread), createReplyDraft };
  const model = {
    extractRequest: vi.fn(),
    ownerWaiting: vi.fn(async () => ({ output: opts.waiting ?? { awaitingReply: true, kind: "answer" as const }, usage: { inputTokens: 1, outputTokens: 1 } })),
    draftFollowup: vi.fn(async () => ({
      output: { body: "Bonjour,\nAvez-vous pu consulter notre devis de 2 400 € HT ? Je reste disponible.", questions: [], citations: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    })),
  } satisfies FollowupModel;
  const canDraft = vi.fn(async () => opts.canDraft ?? true);
  const run = () =>
    runFollowups({
      ids,
      mailbox: mailbox as never,
      model,
      store,
      context: { company: { name: "Atelier" }, sourcesFor: () => [] } as never,
      canDraft,
      costs: { classifyCents: 1, draftCents: 5 },
      now: () => new Date(opts.now ?? "2026-10-12T08:00:00Z"),
    });
  return { run, observations, updates, begun, reserved, model, createReplyDraft, canDraft, mailbox };
}

const quoteThread = [msg({}), ownerMsg("Bonjour, voici notre devis : 2 400 € HT pour la pose.")];
describe("follow-up detection and drafting", () => {
  it("proposes ONE follow-up draft after 5 business days, addressed by code to the thread's customer", async () => {
    const h = harness({ thread: quoteThread });
    const stats = await h.run();
    expect(stats).toMatchObject({ checked: 1, proposed: 1, drafted: 1, statusChanged: 1 });
    expect(h.observations[0]).toMatchObject({ status: "repondu", firstRepliedAt: "2026-10-02T14:00:00.000Z", awaitingCustomer: true });
    expect(h.begun[0]).toEqual({ stage: 1, ownerMessageAt: "2026-10-02T14:00:00.000Z", dueAt: "2026-10-08T22:00:00.000Z" });
    const input = h.createReplyDraft.mock.calls[0]![0] as { recipient: string; messageId: string; idempotencyKey: string; body: string };
    expect(input.recipient).toBe("claire@client.test");
    expect(input.messageId).toBe("m"); // reply to the customer's own message (Outlook createReply targets its sender)
    expect(input.idempotencyKey).toBe(followupIdempotencyKey(ids, "th", 1));
    // Amount restated from the owner's own last message is trusted; nothing else.
    expect(input.body).toContain("2 400 € HT");
    expect(h.model.ownerWaiting).not.toHaveBeenCalled(); // quote decided by code
    expect(h.reserved).toEqual(["followup_draft"]);
    expect(h.updates.at(-1)).toMatchObject({ status: "drafted" });
  });
  it("nothing before the delay; the next check is scheduled at the due time", async () => {
    const h = harness({ thread: quoteThread, now: "2026-10-08T20:00:00Z" });
    expect(await h.run()).toMatchObject({ proposed: 0 });
    expect(h.observations[0]!.nextCheckAt).toBe("2026-10-08T22:00:00.000Z");
    expect(h.createReplyDraft).not.toHaveBeenCalled();
  });
  it("idempotent: an existing stage row means no second draft", async () => {
    const h = harness({ thread: quoteThread, existingRow: true });
    expect(await h.run()).toMatchObject({ proposed: 0, drafted: 0 });
    expect(h.model.draftFollowup).not.toHaveBeenCalled();
  });
  it("quota: no follow-up draft (and no model call) when the plan has no draft left", async () => {
    const h = harness({ thread: quoteThread, canDraft: false });
    expect(await h.run()).toMatchObject({ quotaReached: true, proposed: 0 });
    expect(h.begun).toHaveLength(0);
    expect(h.model.draftFollowup).not.toHaveBeenCalled();
  });
  it("budget: reservation refused → no model call, row left retryable", async () => {
    const h = harness({ thread: quoteThread, budget: false });
    expect(await h.run()).toMatchObject({ budgetExhausted: true, drafted: 0 });
    expect(h.model.draftFollowup).not.toHaveBeenCalled();
    expect(h.updates.at(-1)).toMatchObject({ status: "failed", reason: "budget" });
  });
  it("closing message → not needed, without any model call", async () => {
    const h = harness({ thread: [msg({}), ownerMsg("Merci, bonne journée !")] });
    expect(await h.run()).toMatchObject({ notNeeded: 1, drafted: 0 });
    expect(h.model.ownerWaiting).not.toHaveBeenCalled();
    expect(h.reserved).toEqual([]);
  });
  it("ambiguous message → cheap classifier decides (budgeted)", async () => {
    const h = harness({ thread: [msg({}), ownerMsg("Nous intervenons bien à Lille.")], waiting: { awaitingReply: false, kind: "closing" } });
    expect(await h.run()).toMatchObject({ notNeeded: 1 });
    expect(h.reserved).toEqual(["followup_classify"]);
    const h2 = harness({ thread: [msg({}), ownerMsg("Nous intervenons bien à Lille.")] });
    expect(await h2.run()).toMatchObject({ drafted: 1 });
    expect(h2.reserved).toEqual(["followup_classify", "followup_draft"]);
  });
  it("customer replied after the owner → no follow-up", async () => {
    const h = harness({ thread: [...quoteThread, msg({ id: "m2", receivedAt: "2026-10-05T08:00:00.000Z", text: "Je réfléchis." })] });
    expect(await h.run()).toMatchObject({ proposed: 0 });
    expect(h.observations[0]!.awaitingCustomer).toBe(false);
  });
  it("recipient checks: owner wrote to someone else, or Reply-To diverges → needs review, no draft", async () => {
    const h = harness({ thread: [msg({}), ownerMsg("Voici le devis : 900 €.", undefined, ["fournisseur@x.test"])] });
    expect(await h.run()).toMatchObject({ needsReview: 1, drafted: 0 });
    const h2 = harness({ thread: [msg({ replyTo: ["other@evil.test"] }), ownerMsg("Voici le devis : 900 €.")] });
    expect(await h2.run()).toMatchObject({ needsReview: 1 });
    expect(h2.createReplyDraft).not.toHaveBeenCalled();
  });
  it("provider returned other recipients → needs review", async () => {
    const h = harness({ thread: quoteThread, recipients: ["claire@client.test", "x@y.test"] });
    expect(await h.run()).toMatchObject({ needsReview: 1, drafted: 0 });
  });
  it("relancé: the owner sent after our stage-1 draft; stage 2 then proposed after 5 more business days", async () => {
    const h = harness({
      thread: [msg({}), ownerMsg("Voici le devis : 900 €."), ownerMsg("Avez-vous pu regarder le devis ?", "2026-10-09T09:00:00.000Z")],
      item: {
        status: "repondu",
        firstRepliedAt: "2026-10-02T14:00:00.000Z",
        followups: [{ stage: 1, status: "drafted", draftedAt: "2026-10-09T07:00:00.000Z", ownerMessageAt: "2026-10-02T14:00:00.000Z", draftState: "simulated" }],
      },
      now: "2026-10-19T08:00:00Z",
    });
    const stats = await h.run();
    expect(h.observations[0]).toMatchObject({ status: "relance", relanceAt: "2026-10-09T09:00:00.000Z" });
    expect(stats).toMatchObject({ drafted: 1 });
    expect(h.begun[0]).toMatchObject({ stage: 2 });
    expect((h.createReplyDraft.mock.calls[0]![0] as unknown as { idempotencyKey: string }).idempotencyKey).toBe(followupIdempotencyKey(ids, "th", 2));
  });
  it("mailbox policy errors stop the pass; other read errors are skipped", async () => {
    const h = harness({ thread: quoteThread });
    h.mailbox.readThread.mockRejectedValueOnce(new Error("timeout"));
    expect(await h.run()).toMatchObject({ readFailed: 1, checked: 0 });
    h.mailbox.readThread.mockRejectedValueOnce(new MailboxPolicyError("nope"));
    await expect(h.run()).rejects.toBeInstanceOf(MailboxPolicyError);
  });
});

describe("request pipeline hook", () => {
  function store(created: boolean, budget = true) {
    const saved: unknown[] = [];
    const s: RequestStore = {
      upsertItem: vi.fn(async () => (created ? "item-1" : null)),
      saveExtraction: vi.fn(async (_id, v) => void saved.push(v)),
      reserve: vi.fn(async () => (budget ? "u" : null)),
      addUsage: vi.fn(async () => {}),
    };
    return { s, saved };
  }
  const message = msg({ text: "Bonjour Claire Durand ici. Nous voulons poser 40 m² de parquet. Budget : 3 000 € HT. Pour le 15 novembre si possible." });
  const model = {
    extractRequest: vi.fn(async () => ({
      output: { need: "Pose de 40 m² de parquet", needQuote: "poser 40 m² de parquet", budgetQuote: "Budget : 3 000 € HT", deadlineQuote: "Pour le 15 novembre" },
      usage: { inputTokens: 1, outputTokens: 1 },
    })),
    ownerWaiting: vi.fn(),
    draftFollowup: vi.fn(),
  };
  it("creates one item per thread with minimal contact data and a verified line", async () => {
    const { s, saved } = store(true);
    const r = await trackRequest({ store: s, model, cents: 1 }, { rowId: "row-1", message, classification: "quote_request" });
    expect(r).toMatchObject({ created: true, state: "done" });
    expect(s.upsertItem).toHaveBeenCalledWith({
      rowId: "row-1",
      threadId: "th",
      kind: "quote_request",
      contact: { name: "Claire Durand", email: "claire@client.test", domain: "client.test" },
      receivedAt: "2026-10-01T08:00:00.000Z",
    });
    expect(saved[0]).toEqual({ need: "Pose de 40 m² de parquet", budget: "Budget : 3 000 € HT", deadline: "Pour le 15 novembre", state: "done" });
  });
  it("a later message of the same thread does not create or re-extract", async () => {
    const { s } = store(false);
    model.extractRequest.mockClear();
    expect(await trackRequest({ store: s, model, cents: 1 }, { rowId: "row-2", message, classification: "customer_request" })).toEqual({ created: false });
    expect(model.extractRequest).not.toHaveBeenCalled();
  });
  it("no budget → item kept, fields empty, no model call", async () => {
    const { s, saved } = store(true, false);
    model.extractRequest.mockClear();
    await trackRequest({ store: s, model, cents: 1 }, { rowId: "row-3", message, classification: "quote_request" });
    expect(model.extractRequest).not.toHaveBeenCalled();
    expect(saved[0]).toMatchObject({ need: null, budget: null, deadline: null, state: "budget" });
  });
});
