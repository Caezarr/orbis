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
vi.mock("@/lib/platform/auth", () => ({
  PlatformError: class extends Error {
    constructor(
      message: string,
      public status = 500,
    ) {
      super(message);
    }
  },
}));
import type { PoolClient } from "pg";
import { brainJobBlock, type Entitlement } from "@/lib/billing/entitlements";
import { countDrafts } from "@/lib/billing/entitlements-store";
import { workspaceStorage, type WorkspaceContext } from "@/lib/platform/context";
import { requestExtraction, requestRegeneration } from "./service";
import { BRAIN_PLAN_RETRY_MINUTES, runOneBrainJob } from "./worker";

/*
 * V1 integration (#21 trial/subscription × #22 company brain): brain jobs
 * respect the plan. Regenerations are drafts (gate + quota); extraction is
 * not a draft (no quota) but needs a live plan and spends the cost cap.
 */
const ent = (over: Partial<Entitlement>) =>
  ({ canProcess: true, draftsRemaining: 10, ...over }) as Entitlement;

describe("brainJobBlock", () => {
  it.each([
    ["trialing with drafts", ent({}), null, null],
    ["paid plan, drafts used up", ent({ canProcess: false, reason: "quota_reached", draftsRemaining: 0 }), "quota_reached", null],
    ["trial drafts used", ent({ canProcess: false, reason: "trial_drafts_used", draftsRemaining: 0 }), "trial_drafts_used", "trial_drafts_used"],
    ["trial expired", ent({ canProcess: false, reason: "trial_expired", draftsRemaining: 0 }), "trial_expired", "trial_expired"],
    ["past due", ent({ canProcess: false, reason: "past_due", draftsRemaining: 0 }), "past_due", "past_due"],
    ["canceled", ent({ canProcess: false, reason: "canceled", draftsRemaining: 0 }), "canceled", "canceled"],
  ])("%s → regenerate %s, extract %s", (_label, e, regen, extract) => {
    expect(brainJobBlock(e, "regenerate_draft")).toBe(regen);
    expect(brainJobBlock(e, "extract_sent")).toBe(extract);
  });
  it("a regeneration needs at least one draft left", () => {
    expect(brainJobBlock(ent({ draftsRemaining: 0 }), "regenerate_draft")).toBe("quota_reached");
  });
});

describe("draft quota counts regenerations", () => {
  it("sums inbox drafts and brain regeneration drafts in the period", async () => {
    const query = vi.fn(async () => ({ rows: [{ n: "7" }] }));
    const start = new Date("2026-10-01T00:00:00Z");
    expect(await countDrafts({ query } as never, { workspaceId: "ws", tenantId: "t" }, start, null)).toBe(7);
    const sql = String((query.mock.calls[0] as unknown[])[0]);
    expect(sql).toContain("FROM inbox_messages");
    expect(sql).toMatch(/FROM brain_jobs WHERE .*kind='regenerate_draft' AND draft_state IN \('created','simulated'\)/);
  });
});

describe("session API plan gate (402)", () => {
  const query = vi.fn();
  const ctx: WorkspaceContext = {
    tenantId: "tenant-a",
    workspaceId: "ws-a",
    userId: "user-a",
    role: "owner",
    state: { profile: null } as unknown as WorkspaceContext["state"],
    db: { query } as unknown as PoolClient,
  };
  const trialUsed = (sql: string) =>
    sql.startsWith("SELECT started_at")
      ? { rows: [{ started_at: new Date(Date.now() - 86_400_000), ends_at: new Date(Date.now() + 86_400_000), draft_limit: 50 }] }
      : sql.startsWith("SELECT count(*)")
        ? { rows: [{ n: "50" }] }
        : undefined;
  beforeEach(() => {
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "100");
    query.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  it("refuses a regeneration once the trial drafts are used; nothing queued", async () => {
    query.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT id,provider,connected_account_id")
        ? { rows: [{ id: "m", provider: "gmail", connected_account_id: "acc", status: "drafted", draft_state: "created" }] }
        : (trialUsed(sql) ?? { rows: [], rowCount: 1 }),
    );
    await expect(
      workspaceStorage.run(ctx, () => requestRegeneration("11111111-1111-4111-8111-111111111111")),
    ).rejects.toMatchObject({ status: 402, message: expect.stringContaining("brouillons de l’essai") });
    expect(query.mock.calls.some(([s]) => String(s).startsWith("INSERT INTO brain_jobs"))).toBe(false);
  });
  it("refuses a manual extraction on an ended trial", async () => {
    query.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT provider,connected_account_id")
        ? { rows: [{ provider: "gmail", connected_account_id: "acc" }] }
        : (trialUsed(sql) ?? { rows: [], rowCount: 1 }),
    );
    await expect(workspaceStorage.run(ctx, () => requestExtraction("manual-key-1"))).rejects.toMatchObject({ status: 402 });
    expect(query.mock.calls.some(([s]) => String(s).startsWith("INSERT INTO brain_jobs"))).toBe(false);
  });
});

describe("brain worker plan gate", () => {
  const identity = { userId: "user", workspaceId: "ws-a", tenantId: "tenant-a" };
  const job = (kind: string) => ({
    id: "job-1",
    workspace_id: "ws-a",
    tenant_id: "tenant-a",
    kind,
    provider: "gmail",
    connected_account_id: "acc",
    mode: "test",
    window_days: 90,
    max_messages: 200,
    inbox_message_id: kind === "regenerate_draft" ? "row-1" : null,
    attempts: 1,
    lease_token: "lease",
  });
  let claimed: ReturnType<typeof job>;
  beforeEach(() => {
    vi.stubEnv("ORBIS_INBOX_DRAFTS_ENABLED", "true");
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "1000");
    mock.query.mockReset();
    mock.transaction.mockImplementation((fn) => fn({ query: mock.query }));
    mock.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT 1 FROM memberships")) return { rowCount: 1, rows: [{}] };
      if (sql.startsWith("SELECT * FROM brain_jobs")) return { rows: [claimed] };
      if (sql.includes("attempts=attempts+1")) return { rows: [claimed] };
      return { rows: [], rowCount: 1 };
    });
  });
  afterEach(() => vi.unstubAllEnvs());
  const blocked = vi.fn(async () => ent({ canProcess: false, reason: "trial_expired", draftsRemaining: 0 }));
  it("defers a blocked extraction without consuming an attempt, before any mailbox/model call", async () => {
    claimed = job("extract_sent");
    const mailbox = vi.fn();
    const model = { extract: vi.fn(), explain: vi.fn() };
    const r = await runOneBrainJob(identity, { mailbox, model: model as never, entitlement: blocked });
    expect(r).toMatchObject({ processed: true, blocked: "trial_expired" });
    expect(mailbox).not.toHaveBeenCalled();
    const update = mock.query.mock.calls.find(([s]) => String(s).startsWith("UPDATE brain_jobs SET status='queued'"))!;
    expect(update[0]).toContain("attempts=greatest(attempts-1,0)");
    expect(update[1]).toEqual(["job-1", "ws-a", "tenant-a", "lease", expect.stringContaining("essai"), BRAIN_PLAN_RETRY_MINUTES]);
  });
  it("fails a blocked regeneration with the plan message (no draft, no model call)", async () => {
    claimed = job("regenerate_draft");
    const mailbox = vi.fn();
    const inboxModel = { classify: vi.fn(), draft: vi.fn() };
    const r = await runOneBrainJob(identity, {
      mailbox,
      inboxModel,
      entitlement: vi.fn(async () => ent({ canProcess: false, reason: "quota_reached", draftsRemaining: 0 })),
    });
    expect(r).toMatchObject({ processed: true, blocked: "quota_reached" });
    expect(mailbox).not.toHaveBeenCalled();
    expect(inboxModel.draft).not.toHaveBeenCalled();
    const update = mock.query.mock.calls.find(([s]) => String(s).includes("plan_blocked"))!;
    expect(update[1]).toEqual(["job-1", "ws-a", "tenant-a", "lease", expect.stringContaining("Quota atteint")]);
  });
  it("a paid plan with drafts used up still runs the extraction (cost cap applies)", async () => {
    claimed = job("extract_sent");
    const listSent = vi.fn(async () => []);
    const mailbox = vi.fn(() => ({ listSent, readThread: vi.fn(), listThreadSent: vi.fn(), createReplyDraft: vi.fn() }));
    mock.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT 1 FROM memberships")) return { rowCount: 1, rows: [{}] };
      if (sql.startsWith("SELECT * FROM brain_jobs")) return { rows: [claimed] };
      if (sql.includes("attempts=attempts+1")) return { rows: [claimed] };
      if (sql.startsWith("SELECT state FROM workspace_state"))
        return { rows: [{ state: { workspace: { id: "ws-a", tenantId: "tenant-a" }, profile: null } }] };
      return { rows: [], rowCount: 1 };
    });
    const r = await runOneBrainJob(identity, {
      mailbox: mailbox as never,
      entitlement: vi.fn(async () => ent({ canProcess: false, reason: "quota_reached", draftsRemaining: 0 })),
    });
    expect(r).not.toHaveProperty("blocked");
    expect(listSent).toHaveBeenCalled();
  });
});
