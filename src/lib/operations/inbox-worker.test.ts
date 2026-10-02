import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  setTenant: vi.fn(),
  configured: true,
}));
vi.mock("@/lib/platform/db", () => ({
  transaction: mock.transaction,
  setTenantContext: mock.setTenant,
}));
vi.mock("@/lib/runtime/provider", () => ({
  providerStatus: () => ({ configured: mock.configured }),
  getModel: vi.fn(),
}));
vi.mock("@/lib/runtime/agent-engine", () => ({ contextSnapshot: vi.fn() }));
import { MailboxPolicyError } from "@/lib/integrations/mailbox";
import { runOneInboxBatch } from "./inbox-worker";

const identity = { userId: "user", workspaceId: "ws-a", tenantId: "tenant-a" };
const batchRow = (over = {}) => ({
  id: "batch-1",
  workspace_id: "ws-a",
  tenant_id: "tenant-a",
  kind: "first_run",
  provider: "gmail",
  connected_account_id: "account",
  mission_version: "inbox-replies@1",
  mode: "test",
  window_days: 14,
  max_messages: 50,
  max_drafts: 5,
  attempts: 1,
  lease_token: "lease",
  ...over,
});
let claimed: Record<string, unknown> | null;
const listInbound = vi.fn();
const mailbox = vi.fn(() => ({
  listInbound,
  listSent: vi.fn(async () => []),
  readThread: vi.fn(async () => []),
  createReplyDraft: vi.fn(),
}));
const model = { classify: vi.fn(), draft: vi.fn() };
const finalUpdate = () =>
  mock.query.mock.calls.find(([sql]) => String(sql).includes("stats=$5"));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ORBIS_INBOX_DRAFTS_ENABLED", "true");
  vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "1000");
  mock.configured = true;
  claimed = batchRow();
  listInbound.mockResolvedValue([]);
  mailbox.mockImplementation(() => ({
    listInbound,
    listSent: vi.fn(async () => []),
    readThread: vi.fn(async () => []),
    createReplyDraft: vi.fn(),
  }));
  mock.transaction.mockImplementation((fn) => fn({ query: mock.query }));
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT 1 FROM memberships"))
      return { rowCount: 1, rows: [{}] };
    if (sql.startsWith("SELECT * FROM inbox_batches"))
      return { rows: claimed ? [claimed] : [] };
    if (sql.includes("attempts=attempts+1")) return { rows: [claimed] };
    if (sql.startsWith("SELECT state FROM workspace_state"))
      return {
        rows: [
          {
            state: {
              workspace: { id: "ws-a", tenantId: "tenant-a" },
              profile: null,
              sources: [],
              instructions: [],
              memory: [],
              missions: [],
              missionVersions: [],
            },
          },
        ],
      };
    return { rows: [], rowCount: 1 };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("inbox worker job", () => {
  it("is off unless ORBIS_INBOX_DRAFTS_ENABLED=true", async () => {
    vi.stubEnv("ORBIS_INBOX_DRAFTS_ENABLED", "false");
    expect(await runOneInboxBatch(identity, { mailbox, model })).toMatchObject({
      processed: false,
      reason: "disabled",
    });
    expect(mock.query).not.toHaveBeenCalled();
  });
  it("refuses to run without a model provider or a monthly cap", async () => {
    mock.configured = false;
    await expect(
      runOneInboxBatch(identity, { mailbox, model }),
    ).rejects.toThrow();
    mock.configured = true;
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "");
    await expect(
      runOneInboxBatch(identity, { mailbox, model }),
    ).rejects.toThrow("CAP");
    expect(mock.query).not.toHaveBeenCalled();
  });
  it("verifies membership and scopes every inbox query to the worker tenant", async () => {
    await runOneInboxBatch(identity, { mailbox, model });
    expect(mock.setTenant).toHaveBeenCalledWith(expect.anything(), identity);
    for (const [sql, params] of mock.query.mock.calls) {
      if (
        !/inbox_(batches|messages)/.test(sql) ||
        sql.includes("WHERE id=$1 RETURNING")
      )
        continue;
      expect(params).toEqual(expect.arrayContaining(["ws-a", "tenant-a"]));
    }
    expect(mailbox).toHaveBeenCalledWith(
      "gmail",
      {
        tenantId: "tenant-a",
        workspaceId: "ws-a",
        connectedAccountId: "account",
      },
      { mode: "test" },
    );
  });
  it("never processes a batch belonging to another tenant", async () => {
    claimed = batchRow({ tenant_id: "tenant-b", workspace_id: "ws-b" });
    await expect(
      runOneInboxBatch(identity, { mailbox, model }),
    ).rejects.toThrow("identity mismatch");
    expect(listInbound).not.toHaveBeenCalled();
  });
  it("requires workspace membership before claiming", async () => {
    mock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(
      runOneInboxBatch(identity, { mailbox, model }),
    ).rejects.toThrow("Worker membership required");
  });
  it("completes with stats and releases the lease", async () => {
    const result = await runOneInboxBatch(identity, { mailbox, model });
    expect(result).toMatchObject({ processed: true, batchId: "batch-1" });
    const [sql, params] = finalUpdate()!;
    expect(params[3]).toBe("completed");
    expect(sql).toContain("lease_token=$7");
    expect(params[6]).toBe("lease");
  });
  it("re-queues transient failures and fails policy errors without echoing details", async () => {
    listInbound.mockRejectedValue(new Error("provider SECRET"));
    await runOneInboxBatch(identity, { mailbox, model });
    expect(finalUpdate()![1][3]).toBe("queued");
    expect(JSON.stringify(finalUpdate())).not.toContain("SECRET");
    mock.query.mockClear();
    listInbound.mockRejectedValue(new MailboxPolicyError("revoked"));
    await runOneInboxBatch(identity, { mailbox, model });
    expect(finalUpdate()![1][3]).toBe("failed");
  });
  it("does nothing when no batch is available", async () => {
    claimed = null;
    expect(await runOneInboxBatch(identity, { mailbox, model })).toEqual({
      processed: false,
    });
    expect(mailbox).not.toHaveBeenCalled();
  });
});

describe("inbox worker scheduling behaviour", () => {
  it("claims at most one running batch per workspace, serialized per workspace", async () => {
    await runOneInboxBatch(identity, { mailbox, model });
    const lock = mock.query.mock.calls.find(([sql]) =>
      String(sql).startsWith("SELECT pg_advisory_xact_lock"),
    )!;
    expect(lock[1]).toEqual(["orbis-inbox-claim:tenant-a:ws-a"]);
    const claim = mock.query.mock.calls.find(([sql]) =>
      String(sql).startsWith("SELECT * FROM inbox_batches"),
    )!;
    expect(claim[0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(claim[0]).toContain(
      "live.status='running' AND live.lease_until>=now()",
    );
  });
  it("passes the incremental cursor to the mailbox listing", async () => {
    claimed = batchRow({
      kind: "incremental",
      since_at: new Date("2026-10-02T10:00:00Z"),
    });
    await runOneInboxBatch(identity, { mailbox, model });
    expect(listInbound).toHaveBeenCalledWith(
      expect.objectContaining({ since: new Date("2026-10-02T10:00:00Z") }),
    );
  });
  it("yields on the deadline: re-queued now, attempt not consumed, cursor untouched", async () => {
    listInbound.mockResolvedValue([
      {
        provider: "gmail",
        id: "m1",
        threadId: "t1",
        from: { address: "c@example.com" },
        replyTo: [],
        to: [],
        receivedAt: "2026-10-02T10:00:00.000Z",
        subject: "s",
        text: "t",
        labels: [],
        headers: {},
        fromOwner: false,
        isDraft: false,
      },
    ]);
    const result = await runOneInboxBatch(identity, {
      mailbox,
      model,
      deadline: Date.now() - 1,
    });
    expect(result).toMatchObject({ processed: true });
    const [sql, params] = finalUpdate()!;
    expect(params[3]).toBe("queued");
    expect(params[7]).toBe(true);
    expect(sql).toContain("greatest(attempts-1,0)");
    expect(
      mock.query.mock.calls.some(([q]) => String(q).includes("cursor_at")),
    ).toBe(false);
  });
  it("transient failures back off exponentially", async () => {
    listInbound.mockRejectedValue(new Error("timeout"));
    await runOneInboxBatch(identity, { mailbox, model });
    const [sql, params] = finalUpdate()!;
    expect(params[3]).toBe("queued");
    expect(params[7]).toBe(false);
    expect(sql).toContain("power(4, greatest(attempts-1,0))");
  });
  it("advances the account cursor only after a completed batch", async () => {
    await runOneInboxBatch(identity, { mailbox, model });
    const cursor = mock.query.mock.calls.find(([sql]) =>
      String(sql).startsWith("SELECT cursor_at FROM inbox_settings"),
    )!;
    expect(cursor[1]).toEqual(["ws-a", "tenant-a", "account"]);
  });
  it("a mailbox policy failure pauses continuous drafting for that account", async () => {
    listInbound.mockRejectedValue(new MailboxPolicyError("revoked"));
    await runOneInboxBatch(identity, { mailbox, model });
    const pause = mock.query.mock.calls.find(([sql]) =>
      String(sql).startsWith(
        "UPDATE inbox_settings SET continuous_enabled=false",
      ),
    )!;
    expect(pause[1]).toEqual(["ws-a", "tenant-a", "account"]);
  });
});

describe("inbox worker plan enforcement", () => {
  const blocked = (reason: string, plan = "solo") =>
    vi.fn(async () => ({
      state: reason === "quota_reached" ? "active" : "past_due",
      plan,
      canProcess: false,
      reason,
      draftsRemaining: 0,
    })) as never;
  const blockedUpdate = () =>
    mock.query.mock.calls.find(([sql]) =>
      String(sql).startsWith("UPDATE inbox_batches SET status=$4, error=$5"),
    );
  it.each([
    ["quota_reached", "quota_reached"],
    ["trial_drafts_used", "quota_reached"],
    ["trial_expired", "plan_inactive"],
    ["past_due", "plan_inactive"],
    ["canceled", "plan_inactive"],
  ])("%s: ends the batch as %s before any mailbox or model call", async (reason, status) => {
    const result = await runOneInboxBatch(identity, {
      mailbox,
      model,
      entitlement: blocked(reason),
    });
    expect(result).toMatchObject({ processed: true, blocked: status });
    expect(mailbox).not.toHaveBeenCalled();
    expect(model.classify).not.toHaveBeenCalled();
    const [sql, params] = blockedUpdate()!;
    expect(params.slice(0, 4)).toEqual(["batch-1", "ws-a", "tenant-a", status]);
    expect(String(params[4])).toMatch(/brouillons passés restent consultables|Quota atteint/);
    expect(sql).toContain("lease_token=$6");
    // The cursor is not advanced: messages are listed again once the plan allows.
    expect(
      mock.query.mock.calls.some(([q]) => String(q).includes("cursor_at")),
    ).toBe(false);
  });
  it("passes the remaining drafts to the pipeline and maps a mid-batch stop to quota_reached", async () => {
    listInbound.mockResolvedValue([
      {
        provider: "gmail",
        id: "m1",
        threadId: "t1",
        from: { address: "c@example.com" },
        replyTo: [],
        to: [],
        receivedAt: "2026-10-02T10:00:00.000Z",
        subject: "s",
        text: "t",
        labels: [],
        headers: {},
        fromOwner: false,
        isDraft: false,
      },
    ]);
    const result = await runOneInboxBatch(identity, {
      mailbox,
      model,
      entitlement: vi.fn(async () => ({
        state: "trialing",
        plan: "trial",
        canProcess: true,
        draftsRemaining: 0,
      })) as never,
    });
    expect(result.stats).toMatchObject({ quotaReached: true });
    expect(model.classify).not.toHaveBeenCalled();
    const [sql, params] = finalUpdate()!;
    expect(params[3]).toBe("quota_reached");
    expect(String(params[5])).toContain("brouillons de l’essai");
    expect(sql).toContain("'quota_reached'");
    expect(
      mock.query.mock.calls.some(([q]) =>
        String(q).startsWith("SELECT cursor_at"),
      ),
    ).toBe(false);
  });
  it("loads the entitlement inside the worker's tenant-scoped transaction", async () => {
    const entitlement = vi.fn(async () => ({ canProcess: true, draftsRemaining: 10 })) as never;
    await runOneInboxBatch(identity, { mailbox, model, entitlement });
    expect(entitlement).toHaveBeenCalledWith(expect.anything(), identity);
  });
});
