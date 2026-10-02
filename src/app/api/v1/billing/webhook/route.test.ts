import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ construct: vi.fn(), retrieve: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/billing/stripe", () => ({ stripe: () => ({ webhooks: { constructEvent: mock.construct }, subscriptions: { retrieve: mock.retrieve } }) }));
vi.mock("@/lib/platform/db", () => ({ transaction: mock.transaction }));
import { POST } from "./route";

const subscription = (over: Record<string, unknown> = {}) => ({
  id: "sub_1",
  customer: "cus_1",
  status: "active",
  cancel_at_period_end: false,
  items: { data: [{ price: { id: "price_equipe" }, quantity: 1, current_period_start: 1797000000, current_period_end: 1800000000 }] },
  metadata: { tenant_id: "attacker", plan: "solo" },
  ...over,
});
const request = (signed = true) => new Request("https://orbis.test/api/v1/billing/webhook", { method: "POST", headers: signed ? { "stripe-signature": "test-signature" } : {}, body: "raw-payload" });
/** In-memory event dedup + subscription row, like the real tables. */
let seen: Set<string>;
let row: { stripe_subscription_id: string; status: string } | null;
const calls = (prefix: string) => mock.query.mock.calls.filter(([sql]) => String(sql).startsWith(prefix));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-only");
  vi.stubEnv("STRIPE_PRICE_SOLO_MONTHLY", "price_solo");
  vi.stubEnv("STRIPE_PRICE_EQUIPE_MONTHLY", "price_equipe");
  vi.stubEnv("ORBIS_PLAN_EQUIPE_CAP_CENTS", "12000");
  seen = new Set();
  row = null;
  mock.transaction.mockImplementation(async (fn) => {
    const snapshot = { seen: new Set(seen), row };
    try {
      return await fn({ query: mock.query });
    } catch (error) {
      seen = snapshot.seen; // rollback
      row = snapshot.row;
      throw error;
    }
  });
  mock.construct.mockReturnValue({ id: "evt_1", type: "customer.subscription.updated", data: { object: subscription({ status: "past_due" }) } });
  mock.retrieve.mockResolvedValue(subscription());
  mock.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.startsWith("INSERT INTO stripe_events")) {
      if (seen.has(params[0] as string)) return { rows: [], rowCount: 0 };
      seen.add(params[0] as string);
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("SELECT tenant_id")) return { rows: [{ tenant_id: "tenant-server" }], rowCount: 1 };
    if (sql.startsWith("SELECT stripe_subscription_id")) return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    if (sql.startsWith("INSERT INTO stripe_subscriptions")) {
      row = { stripe_subscription_id: params[1] as string, status: params[3] as string };
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("SELECT orbis_sync_workspace_plan_cap")) return { rows: [{ cap: params[2] }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("Stripe webhook", () => {
  it("rejects missing signature before database access", async () => {
    expect((await POST(request(false))).status).toBe(400);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
  it("verifies the unparsed payload", async () => {
    await POST(request());
    expect(mock.construct).toHaveBeenCalledWith("raw-payload", "test-signature", "test-only");
  });
  it("rejects invalid signatures without processing", async () => {
    mock.construct.mockImplementation(() => { throw new Error("bad signature"); });
    expect((await POST(request())).status).toBe(400);
    expect(mock.query).not.toHaveBeenCalled();
  });
  it("uses current Stripe state and mapped customer, not stale event or metadata", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(calls("INSERT INTO stripe_subscriptions")[0]?.[1]).toEqual(["tenant-server", "sub_1", "cus_1", "active", "equipe", 5, 1800000000, false]);
  });
  it("syncs the plan cap through the privileged function in the same transaction", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(calls("SELECT orbis_sync_workspace_plan_cap")[0]?.[1]).toEqual(["tenant-server", "equipe", 12000]);
  });
  it("keeps the plan cap while past_due (processing is blocked by entitlements)", async () => {
    mock.retrieve.mockResolvedValue(subscription({ status: "past_due" }));
    expect((await POST(request())).status).toBe(200);
    expect(calls("SELECT orbis_sync_workspace_plan_cap")[0]?.[1]).toEqual(["tenant-server", "equipe", 12000]);
  });
  it("drops the cap to zero when the subscription is canceled", async () => {
    mock.retrieve.mockResolvedValue(subscription({ status: "canceled" }));
    expect((await POST(request())).status).toBe(200);
    expect(calls("SELECT orbis_sync_workspace_plan_cap")[0]?.[1]).toEqual(["tenant-server", "none", 0]);
  });
  it("leaves the trial cap untouched while checkout is incomplete", async () => {
    mock.retrieve.mockResolvedValue(subscription({ status: "incomplete" }));
    expect((await POST(request())).status).toBe(200);
    expect(calls("SELECT orbis_sync_workspace_plan_cap")).toHaveLength(0);
  });
  it("maps the legacy Business price env to the equipe plan", async () => {
    vi.stubEnv("STRIPE_PRICE_EQUIPE_MONTHLY", "");
    vi.stubEnv("STRIPE_PRICE_BUSINESS_BASE_MONTHLY", "price_equipe");
    expect((await POST(request())).status).toBe(200);
    expect(calls("INSERT INTO stripe_subscriptions")[0]?.[1]?.[4]).toBe("equipe");
  });
  it("replayed event: processed once, second delivery is a no-op 200", async () => {
    expect((await POST(request())).status).toBe(200);
    mock.retrieve.mockClear();
    expect((await POST(request())).status).toBe(200);
    expect(mock.retrieve).not.toHaveBeenCalled();
    expect(calls("SELECT orbis_sync_workspace_plan_cap")).toHaveLength(1);
  });
  it("out-of-order events converge on the current Stripe state", async () => {
    // A stale 'created (incomplete)' event delivered AFTER 'updated (active)'.
    mock.construct.mockReturnValueOnce({ id: "evt_2", type: "customer.subscription.updated", data: { object: subscription() } });
    expect((await POST(request())).status).toBe(200);
    mock.construct.mockReturnValueOnce({ id: "evt_1", type: "customer.subscription.created", data: { object: subscription({ status: "incomplete" }) } });
    expect((await POST(request())).status).toBe(200);
    // Both runs used the current provider state ('active'), never the stale payload.
    expect(calls("INSERT INTO stripe_subscriptions").map(([, p]) => p[3])).toEqual(["active", "active"]);
    expect(row?.status).toBe("active");
  });
  it("a failed cap sync rolls back the event so Stripe retries it", async () => {
    const base = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith("SELECT orbis_sync_workspace_plan_cap")) throw new Error("function missing");
      return base(sql, params);
    });
    expect((await POST(request())).status).toBe(503);
    expect(seen.has("evt_1")).toBe(false);
    mock.query.mockImplementation(base);
    expect((await POST(request())).status).toBe(200);
    expect(seen.has("evt_1")).toBe(true);
  });
  it("returns retryable failure if mapping has not committed", async () => {
    const base = mock.query.getMockImplementation()!;
    mock.query.mockImplementation(async (sql: string, params: unknown[]) => (sql.startsWith("SELECT tenant_id") ? { rowCount: 0, rows: [] } : base(sql, params)));
    expect((await POST(request())).status).toBe(503);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it.each([
    [{ items: { data: [{ price: { id: "other" }, quantity: 1, current_period_start: 1, current_period_end: 2 }] } }],
    [{ items: { data: [{ price: { id: "price_solo" }, quantity: 1, current_period_start: 1, current_period_end: 2 }, { price: { id: "seat" }, quantity: 2, current_period_start: 1, current_period_end: 2 }] } }],
    [{ items: { data: [{ price: { id: "price_solo" }, quantity: 3, current_period_start: 1, current_period_end: 2 }] } }],
  ])("does not activate an unknown or modified offer %#", async (over) => {
    mock.retrieve.mockResolvedValue(subscription(over));
    expect((await POST(request())).status).toBe(503);
    expect(calls("INSERT INTO stripe_subscriptions")).toHaveLength(0);
    expect(calls("SELECT orbis_sync_workspace_plan_cap")).toHaveLength(0);
  });
  it("does not let an old cancellation replace a newer active subscription", async () => {
    row = { stripe_subscription_id: "sub_new", status: "active" };
    mock.retrieve.mockResolvedValue(subscription({ status: "canceled" }));
    expect((await POST(request())).status).toBe(200);
    expect(calls("INSERT INTO stripe_subscriptions")).toHaveLength(0);
    expect(calls("SELECT orbis_sync_workspace_plan_cap")).toHaveLength(0);
  });
});
