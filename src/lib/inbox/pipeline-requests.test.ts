import { describe, expect, it, vi } from "vitest";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import { processMailboxBatch, type InboxStore } from "./pipeline";

/* Level 7 hook: every actionable message reaches the request pipeline, before drafting, best effort. */
const message = (id: string, subject: string): MailMessage => ({
  provider: "gmail",
  id,
  threadId: `t-${id}`,
  from: { address: `${id}@client.test` },
  replyTo: [],
  to: [],
  subject,
  receivedAt: "2026-10-01T08:00:00.000Z",
  text: subject,
  labels: [],
  headers: {},
  isDraft: false,
  fromOwner: false,
});
function store(): InboxStore {
  return {
    upsertMessage: async (m) => ({ rowId: `row-${m.id}`, status: "seen", classification: null }),
    update: async () => {},
    reserveBudget: async () => true,
    addUsage: async () => {},
    ledger: () => ({
      claim: async () => ({ state: "claimed" as const }),
      retry: async () => false,
      record: async () => {},
      markUncertain: async () => {},
    }),
    heartbeat: async () => true,
  };
}
describe("request pipeline hook in the inbox pipeline", () => {
  it("tracks customer/quote requests only, and a hook failure never blocks the draft", async () => {
    const track = vi.fn(async () => {
      throw new Error("db down");
    });
    const createReplyDraft = vi.fn(async () => ({ draftId: "simulated:x", threadId: "t", payloadHash: "h", policyHash: "p", simulated: true, reconciled: false, created: false }));
    const stats = await processMailboxBatch({
      batch: { id: "b", tenantId: "t", workspaceId: "w", provider: "gmail", connectedAccountId: "acc", missionVersion: "v", windowDays: 14, maxMessages: 50, maxDrafts: 5 },
      mailbox: {
        listInbound: async () => [message("a", "Devis pose parquet"), message("b", "Facture fournisseur")],
        listSent: async () => [],
        readThread: async () => [],
        createReplyDraft,
      } as never,
      model: {
        classify: async (m: MailMessage) => ({ output: { classification: m.subject.startsWith("Devis") ? "quote_request" : "supplier", reason: "" }, usage: { inputTokens: 0, outputTokens: 0 } }),
        draft: async () => ({ output: { body: "Bonjour, merci pour votre demande.", questions: [], citations: [] }, usage: { inputTokens: 0, outputTokens: 0 } }),
      } as never,
      store: store(),
      context: { company: {}, sourcesFor: () => [] } as never,
      costs: { classifyCents: 1, draftCents: 5 },
      requests: { track },
    });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith(expect.objectContaining({ rowId: "row-a", classification: "quote_request" }));
    expect(stats.drafted).toBe(1);
    expect(createReplyDraft).toHaveBeenCalledTimes(1);
  });
});

describe("request hook and the owner's own Outlook messages", () => {
  const owner = "patron@acme.test";
  const outlook = (id: string, from: string, fields: Partial<MailMessage> = {}): MailMessage => ({
    ...message(id, "Devis : rappeler M. Martin"),
    provider: "outlook",
    threadId: "conv-1",
    from: { address: from },
    to: [owner],
    ...fields,
  });
  const run = (
    readThread: () => Promise<MailMessage[]>,
    track: ReturnType<typeof vi.fn>,
    inbound: MailMessage[] = [outlook("self", owner)],
  ) => {
    const updates: Array<{ rowId: string; patch: Record<string, unknown> }> = [];
    const s = store();
    s.update = async (rowId, patch) => {
      updates.push({ rowId, patch: patch as Record<string, unknown> });
    };
    const createReplyDraft = vi.fn(async () => ({ draftId: "simulated:x", threadId: "t", payloadHash: "h", policyHash: "p", simulated: true, reconciled: false, created: false }));
    const readSpy = vi.fn(readThread);
    const done = processMailboxBatch({
      batch: { id: "b", tenantId: "t", workspaceId: "w", provider: "outlook", connectedAccountId: "acc", missionVersion: "v", windowDays: 14, maxMessages: 50, maxDrafts: 5 },
      mailbox: {
        listInbound: async () => inbound,
        // Nothing sent for 31 days: the cheap pre-classification check sees no owner address.
        listSent: async () => [],
        readThread: readSpy,
        createReplyDraft,
      } as never,
      model: {
        classify: async () => ({ output: { classification: "quote_request", reason: "" }, usage: { inputTokens: 0, outputTokens: 0 } }),
        draft: async () => ({ output: { body: "Bonjour, merci pour votre demande.", questions: [], citations: [] }, usage: { inputTokens: 0, outputTokens: 0 } }),
      } as never,
      store: s,
      context: { company: {}, sourcesFor: () => [] } as never,
      costs: { classifyCents: 1, draftCents: 5 },
      requests: { track: track as never },
    });
    return { done, updates, createReplyDraft, readSpy };
  };

  it("a note-to-self never becomes a request sheet when its Sent Items copy is in the thread", async () => {
    const track = vi.fn(async () => {});
    const { done, updates, createReplyDraft, readSpy } = run(
      async () => [outlook("self", owner), outlook("self-sent", owner, { fromOwner: true })],
      track,
    );
    const stats = await done;
    expect(track).not.toHaveBeenCalled();
    expect(createReplyDraft).not.toHaveBeenCalled();
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(stats.skipped).toBe(1);
    expect(updates.at(-1)).toMatchObject({ rowId: "row-self", patch: { status: "skipped", skipReason: "own_message" } });
  });

  it("a client's request is tracked and drafted with a single thread read", async () => {
    const track = vi.fn(async () => {});
    const { done, createReplyDraft, readSpy } = run(
      async () => [outlook("earlier", owner, { fromOwner: true, receivedAt: "2026-09-01T08:00:00.000Z" })],
      track,
      [outlook("c1", "client@example.com")],
    );
    const stats = await done;
    expect(track).toHaveBeenCalledWith(expect.objectContaining({ rowId: "row-c1" }));
    expect(stats.drafted).toBe(1);
    expect(createReplyDraft).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: "client@example.com" }),
      expect.anything(),
    );
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it("a thread read failure keeps tracking the request (previous behaviour); the row fails without a draft", async () => {
    const track = vi.fn(async () => {});
    const { done, updates, createReplyDraft } = run(async () => {
      throw new Error("graph 503");
    }, track);
    const stats = await done;
    expect(track).toHaveBeenCalledTimes(1);
    expect(createReplyDraft).not.toHaveBeenCalled();
    expect(stats.failed).toBe(1);
    expect(updates.at(-1)).toMatchObject({ rowId: "row-self", patch: { status: "failed" } });
  });
});
