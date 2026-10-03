import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/platform/db", () => ({
  transaction: vi.fn(),
  setTenantContext: vi.fn(),
}));
import {
  dispatchInboxPass,
  type DueWorkspace,
  type DispatchDeps,
} from "./dispatcher";
import type { Identity } from "./worker";

const ws = (id: string, over: Partial<DueWorkspace> = {}): DueWorkspace => ({
  tenantId: `t-${id}`,
  workspaceId: id,
  workerUserId: `u-${id}`,
  dueBatches: 3,
  pollDue: false,
  dueSince: new Date(0),
  ...over,
});

/**
 * In-memory queue with the database's claim semantics: a claim is atomic
 * (FOR UPDATE SKIP LOCKED + lease) and at most one batch per workspace runs at
 * a time. `delay` interleaves concurrent passes.
 */
function fakeQueue(batches: Record<string, number>, delay = 1) {
  const queue = Object.entries(batches).flatMap(([workspace, n]) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${workspace}-${i}`,
      workspace,
      state: "queued" as "queued" | "running" | "done",
    })),
  );
  const processed: string[] = [];
  const identities: Identity[] = [];
  const runBatch: DispatchDeps["runBatch"] = async (identity) => {
    identities.push(identity);
    if (
      queue.some(
        (b) => b.workspace === identity.workspaceId && b.state === "running",
      )
    )
      return { processed: false };
    const next = queue.find(
      (b) => b.workspace === identity.workspaceId && b.state === "queued",
    );
    if (!next) return { processed: false };
    next.state = "running";
    await new Promise((r) => setTimeout(r, delay));
    next.state = "done";
    processed.push(next.id);
    return { processed: true };
  };
  return { queue, processed, identities, runBatch };
}

beforeEach(() => vi.stubEnv("ORBIS_INBOX_DRAFTS_ENABLED", "true"));
afterEach(() => vi.unstubAllEnvs());

describe("multi-tenant dispatcher", () => {
  it("does nothing while inbox drafts are disabled", async () => {
    vi.stubEnv("ORBIS_INBOX_DRAFTS_ENABLED", "false");
    const discover = vi.fn();
    expect(await dispatchInboxPass({}, { discover })).toMatchObject({
      stoppedBy: "disabled",
    });
    expect(discover).not.toHaveBeenCalled();
  });
  it("round-robins oldest-first across workspaces and honours the per-workspace limit", async () => {
    const q = fakeQueue({ a: 3, b: 3, c: 1 });
    const result = await dispatchInboxPass(
      { perWorkspace: 2, maxBatches: 100 },
      {
        discover: async () => [ws("a"), ws("b"), ws("c")],
        runBatch: q.runBatch,
      },
    );
    // Round 1: a, b, c. Round 2: a, b (c is empty). Never a,a before b.
    expect(q.processed).toEqual(["a-0", "b-0", "c-0", "a-1", "b-1"]);
    expect(result).toMatchObject({ processed: 5, stoppedBy: "idle" });
  });
  it("a busy tenant cannot starve the others (global limit)", async () => {
    const q = fakeQueue({ big: 50, small1: 1, small2: 1 });
    const result = await dispatchInboxPass(
      { perWorkspace: 10, maxBatches: 4 },
      {
        discover: async () => [ws("big"), ws("small1"), ws("small2")],
        runBatch: q.runBatch,
      },
    );
    expect(q.processed).toEqual(["big-0", "small1-0", "small2-0", "big-1"]);
    expect(result.stoppedBy).toBe("max_batches");
  });
  it("processes each workspace under its own identity only", async () => {
    const q = fakeQueue({ a: 1, b: 1 });
    await dispatchInboxPass(
      {},
      { discover: async () => [ws("a"), ws("b")], runBatch: q.runBatch },
    );
    expect(q.identities[0]).toEqual({
      userId: "u-a",
      workspaceId: "a",
      tenantId: "t-a",
    });
    expect(q.identities[1]).toEqual({
      userId: "u-b",
      workspaceId: "b",
      tenantId: "t-b",
    });
  });
  it("never processes the same batch twice under concurrent invocations", async () => {
    const q = fakeQueue({ a: 4, b: 4, c: 4 }, 3);
    const discover = async () => [ws("a"), ws("b"), ws("c")];
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        dispatchInboxPass(
          { perWorkspace: 4, maxBatches: 100 },
          { discover, runBatch: q.runBatch },
        ),
      ),
    );
    expect(new Set(q.processed).size).toBe(q.processed.length);
    expect(results.reduce((n, r) => n + r.processed, 0)).toBe(
      q.processed.length,
    );
    expect(q.queue.filter((b) => b.state === "running")).toHaveLength(0);
  });
  it("stops gracefully when the time budget is spent", async () => {
    let now = 0;
    const runBatch = vi.fn(async () => {
      now += 20_000;
      return { processed: true };
    });
    const result = await dispatchInboxPass(
      { budgetMs: 50_000, reserveMs: 15_000, perWorkspace: 5, maxBatches: 100 },
      { discover: async () => [ws("a"), ws("b")], runBatch, clock: () => now },
    );
    // 0s: a, 20s: b, 40s: only 10s left < 15s reserve → stop.
    expect(runBatch).toHaveBeenCalledTimes(2);
    expect(result.stoppedBy).toBe("deadline");
    // The batch itself receives the per-message deadline (budget minus reserve).
    expect(runBatch.mock.calls[0]).toEqual([expect.anything(), 35_000]);
  });
  it("stops after a batch yields on the deadline", async () => {
    const runBatch = vi.fn(async () => ({ processed: true, yielded: true }));
    const result = await dispatchInboxPass(
      {},
      { discover: async () => [ws("a"), ws("b")], runBatch },
    );
    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ yielded: 1, stoppedBy: "deadline" });
  });
  it("isolates failures: one broken workspace does not block the others", async () => {
    const q = fakeQueue({ b: 1 });
    const runBatch: DispatchDeps["runBatch"] = async (identity, deadline) => {
      if (identity.workspaceId === "a") throw new Error("membership revoked");
      return q.runBatch!(identity, deadline);
    };
    const result = await dispatchInboxPass(
      {},
      { discover: async () => [ws("a"), ws("b")], runBatch },
    );
    expect(q.processed).toEqual(["b-0"]);
    expect(result).toMatchObject({ errors: 1, processed: 1 });
  });
  it("enqueues the incremental poll once per due workspace before processing", async () => {
    const q = fakeQueue({ a: 0, b: 1 });
    const enqueue = vi.fn(async (identity: Identity) => {
      q.queue.push({
        id: `${identity.workspaceId}-poll`,
        workspace: identity.workspaceId,
        state: "queued",
      });
      return "batch-id";
    });
    const result = await dispatchInboxPass(
      { perWorkspace: 3 },
      {
        discover: async () => [ws("a", { pollDue: true }), ws("b")],
        enqueue,
        runBatch: q.runBatch,
      },
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0].workspaceId).toBe("a");
    expect(q.processed).toEqual(["a-poll", "b-0"]);
    expect(result.enqueued).toBe(1);
  });
});

describe("company brain jobs in the dispatcher", () => {
  it("runs one brain job per due workspace, under that workspace's identity, counted in the pass cap", async () => {
    const q = fakeQueue({ a: 1, b: 1 });
    const runBrain = vi.fn(async () => ({ processed: true }));
    const result = await dispatchInboxPass(
      { maxBatches: 3, budgetMs: 60_000, reserveMs: 0 },
      {
        discover: async () => [ws("a", { brainDue: 1 }), ws("b")],
        runBatch: q.runBatch,
        runBrain,
      },
    );
    expect(runBrain).toHaveBeenCalledTimes(1);
    expect(runBrain).toHaveBeenCalledWith(
      { userId: "u-a", workspaceId: "a", tenantId: "t-a" },
      expect.any(Number),
    );
    expect(result).toMatchObject({ brainProcessed: 1, processed: 2, stoppedBy: "max_batches" });
  });
  it("a brain job that yields stops the pass", async () => {
    const q = fakeQueue({ a: 1 });
    const result = await dispatchInboxPass(
      { budgetMs: 60_000, reserveMs: 0 },
      {
        discover: async () => [ws("a", { brainDue: 1 })],
        runBatch: q.runBatch,
        runBrain: async () => ({ processed: true, yielded: true }),
      },
    );
    expect(result).toMatchObject({ stoppedBy: "deadline", yielded: 1, processed: 0 });
  });
});

const plan = vi.hoisted(() => ({ canProcess: true }));
vi.mock("@/lib/billing/entitlements-store", () => ({
  currentEntitlement: vi.fn(async () => ({ canProcess: plan.canProcess })),
}));
describe("dispatcher plan gate (default enqueue)", () => {
  async function pass(canProcess: boolean) {
    plan.canProcess = canProcess;
    vi.stubEnv("ORBIS_INBOX_DRAFTS_ENABLED", "true");
    const { transaction } = await import("@/lib/platform/db");
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT 1 FROM memberships")) return { rowCount: 1, rows: [{}] };
      if (sql.startsWith("SELECT continuous_enabled"))
        return {
          rows: [
            {
              continuous_enabled: true,
              provider: "gmail",
              connected_account_id: "acc",
              interval_minutes: 15,
              cursor_at: new Date("2026-10-02T10:00:00Z"),
              next_run_at: new Date("2026-10-02T10:15:00Z"),
            },
          ],
        };
      if (sql.startsWith("SELECT 1 FROM inbox_batches")) return { rows: [], rowCount: 0 };
      if (sql.startsWith("INSERT INTO inbox_batches")) return { rows: [{ id: "new" }] };
      return { rows: [], rowCount: 1 };
    });
    vi.mocked(transaction).mockImplementation(async (fn) => fn({ query } as never));
    const result = await dispatchInboxPass(
      {},
      { discover: async () => [ws("a", { pollDue: true })], runBatch: async () => ({ processed: false }) },
    );
    return { result, query };
  }
  it("pauses continuous drafting when the plan cannot process: schedule advances, no batch", async () => {
    const { result, query } = await pass(false);
    expect(result.enqueued).toBe(0);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE inbox_settings SET next_run_at"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO inbox_batches"))).toBe(false);
  });
  it("queues the incremental batch when the plan allows it", async () => {
    const { result, query } = await pass(true);
    expect(result.enqueued).toBe(1);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO inbox_batches"))).toBe(true);
  });
});
