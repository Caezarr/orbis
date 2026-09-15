import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ construct: vi.fn(), retrieve: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/billing/stripe", () => ({ stripe: () => ({ webhooks: {constructEvent: mock.construct}, subscriptions: {retrieve: mock.retrieve} }), stripePrices: { Solo: () => "solo", BusinessBase: () => "business", BusinessExtraSeat: () => "seat" } }));
vi.mock("@/lib/platform/db", () => ({ transaction: mock.transaction }));
import { POST } from "./route";
const subscription = { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false, items: { data: [{price: {id: "business"}, quantity: 1, current_period_end: 1800000000}, {price: {id: "seat"}, quantity: 2, current_period_end: 1800000000}] }, metadata: {tenant_id: "attacker", plan: "Solo"} };
const request = (signed = true) => new Request("https://orbis.test/api/v1/billing/webhook", { method: "POST", headers: signed ? { "stripe-signature": "test-signature" } : {}, body: "raw-payload" });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-only");
  mock.transaction.mockImplementation(fn => fn({query: mock.query}));
  mock.construct.mockReturnValue({id: "evt_1", type: "customer.subscription.updated", data: {object: {...subscription, status: "past_due"}}});
  mock.retrieve.mockResolvedValue(subscription);
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT tenant_id")) return { rows: [{tenant_id: "tenant-server"}], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
});
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
    mock.construct.mockImplementation(() => {throw new Error("bad signature");});
    expect((await POST(request())).status).toBe(400);
    expect(mock.query).not.toHaveBeenCalled();
  });
  it("deduplicates retries", async () => {
    mock.query.mockResolvedValue({rowCount: 0, rows: []});
    expect((await POST(request())).status).toBe(200);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it("uses current Stripe state and mapped customer, not stale event or metadata", async () => {
    expect((await POST(request())).status).toBe(200);
    const insert = mock.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO stripe_subscriptions"));
    expect(insert?.[1]).toEqual(["tenant-server", "sub_1", "cus_1", "active", "Business", 7, 1800000000, false]);
  });
  it("returns retryable failure if mapping has not committed", async () => {
    mock.query.mockImplementation(async (sql: string) => ({rowCount: 1, rows: sql.startsWith("SELECT tenant_id") ? [] : []}));
    expect((await POST(request())).status).toBe(503);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it("does not activate an unknown commercial offer", async () => {
    mock.retrieve.mockResolvedValue({...subscription, items: {data: [{price: {id: "other"}, quantity: 1}]}});
    expect((await POST(request())).status).toBe(503);
    expect(mock.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO stripe_subscriptions"))).toBe(false);
  });
  it("does not let an old cancellation replace a newer active subscription", async () => {
    mock.retrieve.mockResolvedValue({...subscription, status: "canceled"});
    mock.query.mockImplementation(async (sql: string) => ({rowCount: 1, rows: sql.startsWith("SELECT tenant_id") ? [{tenant_id:"tenant-server"}] : sql.startsWith("SELECT stripe_subscription_id") ? [{stripe_subscription_id:"sub_new",status:"active"}] : []}));
    expect((await POST(request())).status).toBe(200);
    expect(mock.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO stripe_subscriptions"))).toBe(false);
  });
});
