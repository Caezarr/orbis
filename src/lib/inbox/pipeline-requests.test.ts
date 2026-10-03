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
