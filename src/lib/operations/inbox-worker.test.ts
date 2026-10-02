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
