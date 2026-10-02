import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import {
  workspaceStorage,
  type WorkspaceContext,
} from "@/lib/platform/context";
import type { PoolClient } from "pg";
import { enqueueFirstRun, triggerSchema } from "./service";
import { postgresInboxStore, reserveInboxBudget } from "./store";

const query = vi.fn();
function ctx(tenant = "tenant-a"): WorkspaceContext {
  return {
    tenantId: tenant,
    workspaceId: `ws-${tenant}`,
    userId: "user",
    role: "owner",
    state: {} as WorkspaceContext["state"],
    db: { query } as unknown as PoolClient,
  };
}
const inSession = <T>(fn: () => Promise<T>, c = ctx()) =>
  workspaceStorage.run(c, fn);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "500");
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.startsWith("SELECT * FROM inbox_batches")) return { rows: [] };
    if (sql.startsWith("INSERT INTO inbox_batches"))
      return {
        rows: [
          {
            id: params[0],
            request_hash: params[5],
            kind: "first_run",
            provider: params[6],
            mode: params[9],
            status: "queued",
            stats: {},
            error: null,
            window_days: params[10],
            max_messages: params[11],
            max_drafts: params[12],
            created_at: new Date(),
            completed_at: null,
          },
        ],
      };
    return { rows: [], rowCount: 1 };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("first-run trigger", () => {
  it("never accepts a client-supplied tenant or workspace", () => {
    expect(
      triggerSchema.safeParse({ provider: "gmail", tenantId: "tenant-b" })
        .success,
    ).toBe(false);
    expect(
      triggerSchema.safeParse({ provider: "gmail", workspaceId: "ws-b" })
        .success,
    ).toBe(false);
    expect(triggerSchema.parse({ provider: "outlook" })).toEqual({
      provider: "outlook",
      windowDays: 14,
      maxMessages: 50,
    });
  });
  it("binds the batch to the session tenant and a mailbox owned by that workspace", async () => {
    const accounts = vi.fn(async () => ["acc-a"]);
    const batch = await inSession(() =>
      enqueueFirstRun(triggerSchema.parse({ provider: "gmail" }), "key-1", {
        accounts,
      }),
    );
    expect(accounts).toHaveBeenCalledWith("gmail", "tenant-a", "ws-tenant-a");
    const insert = query.mock.calls.find(([sql]) => sql.startsWith("INSERT"))!;
    expect(insert[1].slice(1, 4)).toEqual(["ws-tenant-a", "tenant-a", "user"]);
    expect(insert[1][7]).toBe("acc-a");
    expect(batch).toMatchObject({
      status: "queued",
      mode: "test",
      maxDrafts: 5,
    });
  });
  it("refuses an account that is not connected to this workspace", async () => {
    const accounts = vi.fn(async () => ["acc-a"]);
    await expect(
      inSession(() =>
        enqueueFirstRun(
          triggerSchema.parse({
            provider: "gmail",
            connectedAccountId: "acc-of-tenant-b",
          }),
          "key-1",
          { accounts },
        ),
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      inSession(() =>
        enqueueFirstRun(triggerSchema.parse({ provider: "gmail" }), "key-2", {
          accounts: async () => ["a", "b"],
        }),
      ),
    ).rejects.toThrow("Choose which connected mailbox");
  });
  it("replays an idempotency key and rejects reuse with a different request", async () => {
    const accounts = vi.fn(async () => ["acc-a"]);
    const input = triggerSchema.parse({ provider: "gmail" });
    const first = await inSession(() =>
      enqueueFirstRun(input, "key-1", { accounts }),
    );
    const row = query.mock.calls.find(([sql]) => sql.startsWith("INSERT"))![1];
    query.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT * FROM inbox_batches")
        ? {
            rows: [
              {
                id: first.id,
                request_hash: row[5],
                kind: "first_run",
                provider: "gmail",
                mode: "test",
                status: "queued",
                stats: {},
                error: null,
                window_days: 14,
                max_messages: 50,
                max_drafts: 5,
                created_at: new Date(),
                completed_at: null,
              },
            ],
          }
        : { rows: [] },
    );
    expect(
      (await inSession(() => enqueueFirstRun(input, "key-1", { accounts }))).id,
    ).toBe(first.id);
    await expect(
      inSession(() =>
        enqueueFirstRun({ ...input, windowDays: 7 }, "key-1", { accounts }),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("requires a monthly budget before queueing", async () => {
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "");
    await expect(
      inSession(() =>
        enqueueFirstRun(triggerSchema.parse({ provider: "gmail" }), "key-1", {
          accounts: async () => ["acc-a"],
        }),
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe("postgres store", () => {
  const ids = { workspaceId: "ws-a", tenantId: "tenant-a" };
  it("reserves budget against the shared monthly cap, serialized per tenant", async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes("AS reserved")
        ? { rows: [{ reserved: "498" }] }
        : { rows: [], rowCount: 1 },
    );
    const db = { query } as unknown as PoolClient;
    expect(await reserveInboxBudget(db, ids, "row", 2)).toBe(true);
    expect(await reserveInboxBudget(db, ids, "row", 3)).toBe(false);
    expect(query.mock.calls[0][1]).toEqual(["orbis-budget:tenant-a"]);
    const spend = query.mock.calls.find(([sql]) =>
      sql.includes("AS reserved"),
    )!;
    expect(spend[0]).toContain("operational_tasks");
    expect(spend[0]).toContain("inbox_messages");
    expect(spend[1]).toEqual(["ws-a", "tenant-a"]);
  });
  it("enforces a per-workspace cap below the global ceiling", async () => {
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "500");
    query.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT monthly_cap_cents")
        ? { rows: [{ monthly_cap_cents: 100 }] }
        : sql.includes("AS reserved")
          ? { rows: [{ reserved: "98" }] }
          : { rows: [], rowCount: 1 },
    );
    const db = { query } as unknown as PoolClient;
    expect(await reserveInboxBudget(db, ids, "row", 2)).toBe(true);
    expect(await reserveInboxBudget(db, ids, "row", 3)).toBe(false);
    const capRead = query.mock.calls.find(([sql]) =>
      sql.startsWith("SELECT monthly_cap_cents"),
    )!;
    expect(capRead[1]).toEqual(["ws-a", "tenant-a"]);
    // The cap is read after the per-tenant lock, so it is serialized too.
    const order = query.mock.calls.map(([sql]) => String(sql).slice(0, 30));
    expect(order.indexOf("SELECT pg_advisory_xact_lock(h")).toBeLessThan(
      order.findIndex((q) => q.startsWith("SELECT monthly_cap_cents")),
    );
  });
  it("the global cap stays a hard ceiling over a higher workspace cap", async () => {
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "500");
    query.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT monthly_cap_cents")
        ? { rows: [{ monthly_cap_cents: 100_000 }] }
        : sql.includes("AS reserved")
          ? { rows: [{ reserved: "499" }] }
          : { rows: [], rowCount: 1 },
    );
    const db = { query } as unknown as PoolClient;
    expect(await reserveInboxBudget(db, ids, "row", 2)).toBe(false);
  });
  it("defaults each workspace to ORBIS_WORKSPACE_MONTHLY_CAP_CENTS; a stored 0 blocks spend", async () => {
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "500");
    vi.stubEnv("ORBIS_WORKSPACE_MONTHLY_CAP_CENTS", "50");
    let stored: number | null = null;
    query.mockImplementation(async (sql: string) =>
      sql.startsWith("SELECT monthly_cap_cents")
        ? { rows: stored === null ? [] : [{ monthly_cap_cents: stored }] }
        : sql.includes("AS reserved")
          ? { rows: [{ reserved: "49" }] }
          : { rows: [], rowCount: 1 },
    );
    const db = { query } as unknown as PoolClient;
    expect(await reserveInboxBudget(db, ids, "row", 1)).toBe(true);
    expect(await reserveInboxBudget(db, ids, "row", 2)).toBe(false);
    stored = 0;
    expect(await reserveInboxBudget(db, ids, "row", 1)).toBe(false);
  });
  it("ledger claims once, then returns the receipt or an uncertain state, always tenant-scoped", async () => {
    const run = <T>(fn: (db: PoolClient) => Promise<T>) =>
      fn({ query } as unknown as PoolClient);
    const store = postgresInboxStore(
      run,
      {
        id: "b",
        tenantId: "tenant-a",
        workspaceId: "ws-a",
        provider: "gmail",
        connectedAccountId: "acc",
        missionVersion: "v1",
        windowDays: 14,
        maxMessages: 50,
        maxDrafts: 5,
      },
      { token: "lease" },
    );
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "row" }] });
    expect(await store.ledger("row").claim("k", "h")).toEqual({
      state: "claimed",
    });
    query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            draft_state: "created",
            draft_id: "d1",
            thread_id: "t",
            draft_payload_hash: "h",
            draft_policy_hash: "p",
            draft_reconciled: false,
            draft_claimed_at: new Date(),
            draft_attempts: 1,
          },
        ],
      });
    expect(await store.ledger("row").claim("k", "h")).toMatchObject({
      state: "done",
      receipt: { draftId: "d1" },
    });
    query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            draft_state: "uncertain",
            draft_claimed_at: new Date(0),
            draft_attempts: 2,
          },
        ],
      });
    expect(await store.ledger("row").claim("k", "h")).toMatchObject({
      state: "uncertain",
      attempts: 2,
    });
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toMatch(/workspace_id=\$\d AND tenant_id=\$\d/);
      expect(params).toEqual(expect.arrayContaining(["ws-a", "tenant-a"]));
    }
  });
});
