import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), setTenant: vi.fn() }));
vi.mock("@/lib/platform/db", () => ({
  transaction: mock.transaction,
  setTenantContext: mock.setTenant,
}));
vi.mock("@/lib/runtime/provider", () => ({
  generationSettings: (n: number) => ({ maxOutputTokens: n }),
  providerStatus: () => ({ configured: true }),
  getModel: vi.fn(),
}));
vi.mock("@/lib/runtime/agent-engine", () => ({ contextSnapshot: vi.fn() }));
import type { Entitlement } from "@/lib/billing/entitlements";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import { REVIEW_QUESTIONS } from "@/lib/runtime/inbox-replies";
import { runOneBrainJob } from "./worker";

/*
 * A brain regeneration writes a NEW draft into the mailbox: with
 * ORBIS_INBOX_CLAIM_CHECK=true it gets the same model-assisted claim check as
 * reply drafts and follow-ups (flags + questions, body never rewritten).
 */
const identity = { userId: "user", workspaceId: "ws-a", tenantId: "tenant-a" };
const job = {
  id: "job-1",
  workspace_id: "ws-a",
  tenant_id: "tenant-a",
  kind: "regenerate_draft",
  provider: "gmail",
  connected_account_id: "acc",
  mode: "test",
  window_days: 90,
  max_messages: 200,
  inbox_message_id: "row-1",
  attempts: 1,
  lease_token: "lease",
};
const customer: MailMessage = {
  provider: "gmail",
  id: "m1",
  threadId: "th",
  from: { address: "claire@client.test", name: "Claire Durand" },
  replyTo: [],
  to: ["paul@atelier.test"],
  subject: "Fuite sous l'évier",
  receivedAt: "2026-10-20T08:00:00.000Z",
  text: "Bonjour, pouvez-vous passer ?",
  labels: [],
  headers: {},
  isDraft: false,
  fromOwner: false,
};
const body = "Bonjour,\nMerci pour votre message. Pas de souci, on gère ça pour vous.";
const usage = { inputTokens: 2, outputTokens: 1 };
const state = {
  workspace: { id: "ws-a", tenantId: "tenant-a" },
  profile: null,
  sources: [],
  instructions: [],
  memory: [],
  missions: [],
  missionVersions: [],
};
const ent = { canProcess: true, draftsRemaining: 10 } as Entitlement;

function harness() {
  const createReplyDraft = vi.fn(async (input: { body: string; recipient: string }) => ({
    draftId: "simulated:1",
    threadId: "th",
    payloadHash: "h",
    policyHash: "p",
    simulated: true,
    reconciled: false,
    _input: input,
  }));
  const mailbox = vi.fn(() => ({
    listSent: vi.fn(),
    readThread: vi.fn(async () => [customer]),
    listThreadSent: vi.fn(),
    createReplyDraft,
  }));
  const inboxModel = {
    classify: vi.fn(),
    draft: vi.fn(async () => ({ output: { body, questions: [], citations: [] }, usage })),
  };
  return { mailbox, inboxModel, createReplyDraft };
}
const usageKinds = () =>
  mock.query.mock.calls
    .filter(([s]) => String(s).startsWith("INSERT INTO brain_usage"))
    .map(([, params]) => (params as unknown[])[3]);

describe("brain regeneration claim check (opt-in)", () => {
  beforeEach(() => {
    vi.stubEnv("ORBIS_INBOX_DRAFTS_ENABLED", "true");
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "1000");
    mock.query.mockReset();
    mock.transaction.mockImplementation((fn) => fn({ query: mock.query }));
    mock.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT 1 FROM memberships")) return { rowCount: 1, rows: [{}] };
      if (sql.startsWith("SELECT * FROM brain_jobs")) return { rows: [job] };
      if (sql.includes("attempts=attempts+1")) return { rows: [job] };
      if (sql.startsWith("SELECT state FROM workspace_state"))
        return { rows: [{ state }] };
      if (sql.startsWith("SELECT id,message_id,thread_id,connected_account_id FROM inbox_messages"))
        return { rows: [{ id: "row-1", message_id: "m1", thread_id: "th", connected_account_id: "acc" }] };
      if (sql.includes("AS reserved")) return { rows: [{ reserved: "0" }] };
      return { rows: [], rowCount: 1 };
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("off by default: no check, one reservation", async () => {
    const h = harness();
    const checker = { check: vi.fn() };
    const r = await runOneBrainJob(identity, { ...h, claimChecker: checker, entitlement: async () => ent } as never);
    expect(r).toMatchObject({ processed: true, failure: null, stats: { outcome: "simulated" } });
    expect(checker.check).not.toHaveBeenCalled();
    expect(usageKinds()).toEqual(["regenerate"]);
    expect((h.createReplyDraft.mock.calls[0]![0] as { body: string }).body).toBe(body);
  });

  it("flags a paraphrased commitment: question banner added, sentence kept, budgeted", async () => {
    vi.stubEnv("ORBIS_INBOX_CLAIM_CHECK", "true");
    const h = harness();
    const checker = {
      check: vi.fn(async () => ({
        output: { claims: [{ kind: "commitment" as const, quote: "on gère ça pour vous" }] },
        usage,
      })),
    };
    const r = await runOneBrainJob(identity, { ...h, claimChecker: checker, entitlement: async () => ent } as never);
    expect(r).toMatchObject({ failure: null, stats: { outcome: "simulated", flags: ["claim_check:unsupported_commitment"] } });
    expect(checker.check).toHaveBeenCalledWith(expect.objectContaining({ draft: body }));
    expect(usageKinds()).toEqual(["regenerate", "regenerate"]);
    const written = (h.createReplyDraft.mock.calls[0]![0] as { body: string }).body;
    expect(written).toContain("on gère ça pour vous");
    expect(written).toContain(REVIEW_QUESTIONS.commitment);
    expect(written.startsWith("[[À CONFIRMER")).toBe(true);
  });

  it("checker failure keeps the guarded draft and still writes it", async () => {
    vi.stubEnv("ORBIS_INBOX_CLAIM_CHECK", "true");
    const h = harness();
    const checker = { check: vi.fn(async () => Promise.reject(new Error("timeout"))) };
    const r = await runOneBrainJob(identity, { ...h, claimChecker: checker, entitlement: async () => ent } as never);
    expect(r).toMatchObject({ failure: null, stats: { outcome: "simulated", flags: ["claim_check:unavailable"] } });
    expect((h.createReplyDraft.mock.calls[0]![0] as { body: string }).body).toBe(body);
  });
});
