import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), setTenant: vi.fn() }));
vi.mock("@/lib/platform/db", () => ({ transaction: mock.transaction, setTenantContext: mock.setTenant }));
vi.mock("@/lib/runtime/provider", () => ({
  generationSettings: (n: number) => ({ maxOutputTokens: n }), providerStatus: () => ({ configured: true }), getModel: vi.fn() }));
vi.mock("@/lib/runtime/agent-engine", () => ({ contextSnapshot: vi.fn() }));
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import { runOneInboxBatch } from "./inbox-worker";

/* Levels 6/7 wired into the inbox worker: entitlements, quota and RLS scoping. */
const identity = { userId: "user", workspaceId: "ws-a", tenantId: "tenant-a" };
const batch = (kind: "first_run" | "incremental") => ({
  id: "batch-1",
  workspace_id: "ws-a",
  tenant_id: "tenant-a",
  kind,
  provider: "gmail",
  connected_account_id: "account",
  mission_version: "inbox-replies@1",
  mode: "test",
  window_days: 14,
  max_messages: 50,
  max_drafts: 5,
  attempts: 1,
  lease_token: "lease",
  since_at: kind === "incremental" ? new Date("2026-10-12T07:00:00Z") : null,
});
const m = (over: Partial<MailMessage>): MailMessage => ({
  provider: "gmail",
  id: "c1",
  threadId: "th",
  from: { address: "claire@client.test", name: "Claire" },
  replyTo: [],
  to: ["paul@atelier.test"],
  subject: "Devis",
  receivedAt: "2026-10-01T08:00:00.000Z",
  text: "Bonjour, votre prix ?",
  labels: [],
  headers: {},
  isDraft: false,
  fromOwner: false,
  ...over,
});
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const thread = [
  m({ receivedAt: daysAgo(20) }),
  m({ id: "o1", fromOwner: true, from: { address: "paul@atelier.test" }, to: ["claire@client.test"], receivedAt: daysAgo(15), text: "Voici notre devis : 900 € HT." }),
];
let claimed: ReturnType<typeof batch>;
const createReplyDraft = vi.fn(async (input: { idempotencyKey: string }, ledger: { claim: (k: string, h: string) => Promise<unknown>; record: (k: string, r: unknown) => Promise<void> }) => {
  await ledger.claim(input.idempotencyKey, "h");
  const receipt = { draftId: "simulated:f", threadId: "th", payloadHash: "h", policyHash: "p", simulated: true, reconciled: false };
  await ledger.record(input.idempotencyKey, receipt);
  return { ...receipt, created: false };
});
const mailbox = vi.fn(() => ({ listInbound: vi.fn(async () => []), listSent: vi.fn(async () => []), readThread: vi.fn(async () => thread), createReplyDraft }));
const followupModel = {
  extractRequest: vi.fn(),
  ownerWaiting: vi.fn(),
  draftFollowup: vi.fn(async () => ({ output: { body: "Bonjour, avez-vous pu consulter notre devis ?", questions: [], citations: [] }, usage: { inputTokens: 1, outputTokens: 1 } })),
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ORBIS_INBOX_DRAFTS_ENABLED", "true");
  vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "1000");
  claimed = batch("incremental");
  mailbox.mockImplementation(() => ({ listInbound: vi.fn(async () => []), listSent: vi.fn(async () => []), readThread: vi.fn(async () => thread), createReplyDraft }));
  followupModel.draftFollowup.mockResolvedValue({ output: { body: "Bonjour, avez-vous pu consulter notre devis ?", questions: [], citations: [] }, usage: { inputTokens: 1, outputTokens: 1 } });
  mock.transaction.mockImplementation((fn) => fn({ query: mock.query }));
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT 1 FROM memberships")) return { rowCount: 1, rows: [{}] };
    if (sql.startsWith("SELECT * FROM inbox_batches")) return { rows: [claimed] };
    if (sql.includes("attempts=attempts+1")) return { rows: [claimed] };
    if (sql.startsWith("SELECT state FROM workspace_state"))
      return { rows: [{ state: { workspace: { id: "ws-a", tenantId: "tenant-a" }, profile: null, sources: [], instructions: [], memory: [], missions: [], missionVersions: [] } }] };
    if (sql.includes("FROM pipeline_items i") && sql.includes("next_check_at<=now()"))
      return {
        rows: [
          {
            id: "item-1",
            thread_id: "th",
            kind: "quote_request",
            contact_email: "claire@client.test",
            status: "nouveau",
            first_customer_at: new Date(daysAgo(20)),
            first_replied_at: null,
            relance_at: null,
            created_at: new Date(Date.now() - 86_400_000),
            snoozed_until: null,
            followups_dismissed: false,
            followups: null,
          },
        ],
      };
    if (sql.startsWith("INSERT INTO followups")) return { rows: [{ id: "f-1" }], rowCount: 1 };
    if (sql.startsWith("UPDATE followups SET draft_idempotency_key")) return { rows: [{ id: "f-1" }], rowCount: 1 };
    if (sql.includes("AS reserved")) return { rows: [{ reserved: "0" }] };
    return { rows: [], rowCount: 1 };
  });
});
afterEach(() => vi.unstubAllEnvs());
const allowed = vi.fn(async () => ({ canProcess: true, draftsRemaining: 10 })) as never;

describe("follow-ups in the inbox worker", () => {
  it("incremental batch: reads due threads, updates the pipeline and creates one follow-up draft under the tenant", async () => {
    const result = await runOneInboxBatch(identity, { mailbox: mailbox as never, model: { classify: vi.fn(), draft: vi.fn() }, followupModel, entitlement: allowed });
    expect(result.stats?.followups).toMatchObject({ checked: 1, drafted: 1 });
    expect(createReplyDraft.mock.calls[0]![0]).toMatchObject({ recipient: "claire@client.test", threadId: "th" });
    const pipelineSql = mock.query.mock.calls.filter(([sql]) => /pipeline_items|followups|pipeline_usage|pipeline_settings/.test(String(sql)));
    expect(pipelineSql.length).toBeGreaterThan(3);
    for (const [, params] of pipelineSql) expect(params).toEqual(expect.arrayContaining(["ws-a", "tenant-a"]));
    // Spend reserved in the shared monthly cap before the model call.
    expect(mock.query.mock.calls.some(([sql]) => String(sql).startsWith("INSERT INTO pipeline_usage"))).toBe(true);
  });
  it("draft quota exhausted: threads are still observed but no follow-up draft or model call", async () => {
    const quota = vi.fn(async () => ({ canProcess: true, draftsRemaining: 0 })) as never;
    const result = await runOneInboxBatch(identity, { mailbox: mailbox as never, model: { classify: vi.fn(), draft: vi.fn() }, followupModel, entitlement: quota });
    expect(result.stats?.followups).toMatchObject({ checked: 1, quotaReached: true, drafted: 0 });
    expect(followupModel.draftFollowup).not.toHaveBeenCalled();
    expect(createReplyDraft).not.toHaveBeenCalled();
  });
  it("blocked plan: no mailbox read at all (batch ends before)", async () => {
    const blocked = vi.fn(async () => ({ canProcess: false, reason: "past_due", draftsRemaining: 0, plan: "solo" })) as never;
    await runOneInboxBatch(identity, { mailbox: mailbox as never, model: { classify: vi.fn(), draft: vi.fn() }, followupModel, entitlement: blocked });
    expect(mailbox).not.toHaveBeenCalled();
  });
  it("first runs do not run follow-ups", async () => {
    claimed = batch("first_run");
    const result = await runOneInboxBatch(identity, { mailbox: mailbox as never, model: { classify: vi.fn(), draft: vi.fn() }, followupModel, entitlement: allowed });
    expect(result.stats?.followups).toBeUndefined();
  });
});
