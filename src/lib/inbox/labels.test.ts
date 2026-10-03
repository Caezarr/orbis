import { describe, expect, it, vi } from "vitest";
import { LabelPolicyError, type LabelClient } from "@/lib/integrations/mailbox-labels";
import {
  applyLabels,
  cleanupLabels,
  labelsFor,
  type CleanupStore,
  type LabelCandidate,
  type LabelLedgerRow,
  type LabelStore,
} from "./labels";

const ids = { tenantId: "t", workspaceId: "w", connectedAccountId: "acc" };
const cand = (over: Partial<LabelCandidate> = {}): LabelCandidate => ({
  inboxMessageId: "row-1",
  messageId: "m1",
  classification: "quote_request",
  status: "drafted",
  appliedKeys: [],
  state: null,
  ...over,
});
function memoryStore(candidates: LabelCandidate[]) {
  const records: { messageId: string; keys: string[]; state: string; key: string }[] = [];
  const store: LabelStore = {
    candidates: async () => candidates,
    record: async (c, e) => {
      records.push({ messageId: c.messageId, keys: e.keys, state: e.state, key: e.idempotencyKey });
    },
  };
  return { store, records };
}
const client = () => {
  const setOrbiLabels = vi.fn(async () => {});
  return { client: { provider: "gmail", policyHash: "p", setOrbiLabels } as LabelClient, setOrbiLabels };
};

describe("labelsFor", () => {
  it("is a pure function of classification and status", () => {
    expect(labelsFor({ classification: "quote_request", status: "drafted" })).toEqual(["quote", "draft_ready"]);
    expect(labelsFor({ classification: "supplier", status: "classified" })).toEqual(["supplier"]);
    expect(labelsFor({ classification: "noise", status: "classified" })).toEqual([]);
    // Anything off-schema (even if it reached storage) maps to nothing.
    expect(labelsFor({ classification: "spam", status: "classified" })).toEqual([]);
    expect(labelsFor({ classification: "SPAM" as never, status: "trash" })).toEqual([]);
  });
});

describe("applyLabels", () => {
  it("test mode records a simulation and never calls the provider", async () => {
    const { store, records } = memoryStore([cand()]);
    const factory = vi.fn();
    const stats = await applyLabels({ ids, mode: "test", client: factory, store });
    expect(factory).not.toHaveBeenCalled();
    expect(records).toEqual([expect.objectContaining({ state: "simulated", keys: ["quote", "draft_ready"] })]);
    expect(stats).toMatchObject({ labelled: 1, simulated: true });
  });
  it("scoped_autonomy applies through the label broker, idempotent key per message+keys", async () => {
    const { store, records } = memoryStore([cand(), cand({ inboxMessageId: "r2", messageId: "m2", classification: "admin", status: "classified" })]);
    const { client: c, setOrbiLabels } = client();
    await applyLabels({ ids, mode: "scoped_autonomy", client: () => c, store });
    expect(setOrbiLabels.mock.calls).toEqual([
      ["m1", ["quote", "draft_ready"]],
      ["m2", ["admin"]],
    ]);
    expect(records.every((r) => r.state === "applied" && r.key.length === 64)).toBe(true);
    const again = memoryStore([cand()]);
    await applyLabels({ ids, mode: "scoped_autonomy", client: () => c, store: again.store });
    expect(again.records[0].key).toBe(records[0].key);
  });
  it("skips unchanged rows without a provider call", async () => {
    const { store } = memoryStore([cand({ appliedKeys: ["quote", "draft_ready"], state: "applied" })]);
    const { client: c, setOrbiLabels } = client();
    const stats = await applyLabels({ ids, mode: "scoped_autonomy", client: () => c, store });
    expect(setOrbiLabels).not.toHaveBeenCalled();
    expect(stats.unchanged).toBe(1);
  });
  it("provider failure → uncertain (retried later); policy failure stops the pass", async () => {
    const { store, records } = memoryStore([cand(), cand({ messageId: "m2" })]);
    const failing = { provider: "gmail", policyHash: "p", setOrbiLabels: vi.fn().mockRejectedValueOnce(new Error("timeout")).mockRejectedValueOnce(new LabelPolicyError("x")) } as LabelClient;
    const stats = await applyLabels({ ids, mode: "scoped_autonomy", client: () => failing, store });
    expect(records[0].state).toBe("uncertain");
    expect(stats).toMatchObject({ uncertain: 1, policyError: true });
  });
});

describe("cleanupLabels", () => {
  function cleanupStore(rows: LabelLedgerRow[]) {
    const removed: string[] = [];
    const store: CleanupStore = {
      pending: async () => rows,
      markRemoved: async (id) => void removed.push(id),
      markUncertain: async () => {},
      remaining: async () => ({ total: rows.length - removed.length, real: 0 }),
    };
    return { store, removed };
  }
  const row = (id: string, mode: "test" | "scoped_autonomy"): LabelLedgerRow => ({
    id,
    provider: "outlook",
    connectedAccountId: "acc",
    messageId: `m-${id}`,
    appliedKeys: ["client"],
    mode,
  });
  it("closes simulated rows without a provider call and removes real ones in scoped_autonomy", async () => {
    const { store, removed } = cleanupStore([row("a", "test"), row("b", "scoped_autonomy")]);
    const { client: c, setOrbiLabels } = client();
    const result = await cleanupLabels({ mode: "scoped_autonomy", client: () => c, store });
    expect(setOrbiLabels.mock.calls).toEqual([["m-b", []]]);
    expect(removed).toEqual(["a", "b"]);
    expect(result).toMatchObject({ removed: 2, remaining: 0 });
  });
  it("test mode never writes to the mailbox, even to undo", async () => {
    const { store, removed } = cleanupStore([row("b", "scoped_autonomy")]);
    const factory = vi.fn();
    const result = await cleanupLabels({ mode: "test", client: factory, store });
    expect(factory).not.toHaveBeenCalled();
    expect(removed).toEqual([]);
    expect(result.skippedRealInTestMode).toBe(1);
  });
});
