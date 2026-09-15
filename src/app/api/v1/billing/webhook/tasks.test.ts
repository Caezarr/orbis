import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  construct: vi.fn(),
  retrieve: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/billing/stripe", () => ({
  stripe: () => ({
    webhooks: { constructEvent: mock.construct },
    checkout: { sessions: { retrieve: mock.retrieve } },
  }),
  stripePrices: {},
}));
vi.mock("@/lib/platform/db", () => ({
  transaction: (fn: (db: unknown) => unknown) => fn({ query: mock.query }),
}));
import { POST } from "./route";
const session = {
  id: "session",
  client_reference_id: "batch",
  customer: "customer",
  amount_total: 150,
  currency: "eur",
  mode: "payment",
  payment_status: "paid",
  status: "complete",
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-secret");
  mock.construct.mockReturnValue({
    id: "event",
    type: "checkout.session.completed",
    data: { object: { id: "session", metadata: { task_batch_id: "batch" } } },
  });
  mock.retrieve.mockResolvedValue(session);
  mock.query.mockImplementation(async (sql: string) => ({
    rowCount: 1,
    rows: sql.startsWith("SELECT * FROM task_payment_batches")
      ? [
          {
            id: "batch",
            customer_id: "customer",
            amount_cents: 150,
            session_id: "session",
          },
        ]
      : [],
  }));
});
const request = () =>
  new Request("https://orbis.example/api/v1/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": "signature" },
    body: "payload",
  });
describe("task payment webhook", () => {
  it("confirms a matching payment using current Stripe state", async () => {
    expect((await POST(request())).status).toBe(200);
    const update = mock.query.mock.calls.find(([sql]) =>
      sql.startsWith("UPDATE task_payment_batches"),
    );
    expect(update?.[1]).toEqual(["batch", "session", "paid"]);
    expect(update?.[0]).toContain("status<>'paid'");
  });
  it.each([
    { amount_total: 999 },
    { customer: "other" },
    { currency: "usd" },
    { mode: "subscription" },
    { id: "other" },
  ])("rejects mismatched payment %j", async (change) => {
    mock.retrieve.mockResolvedValue({ ...session, ...change });
    expect((await POST(request())).status).toBe(503);
    expect(
      mock.query.mock.calls.some(([sql]) =>
        sql.startsWith("UPDATE task_payment_batches"),
      ),
    ).toBe(false);
  });
  it("does not call an unpaid completed checkout paid", async () => {
    mock.retrieve.mockResolvedValue({ ...session, payment_status: "unpaid" });
    expect((await POST(request())).status).toBe(200);
    expect(
      mock.query.mock.calls.find(([sql]) =>
        sql.startsWith("UPDATE task_payment_batches"),
      )?.[1][2],
    ).toBe("pending");
  });
  it("does not process a replayed event twice", async () => {
    mock.query.mockResolvedValue({ rowCount: 0, rows: [] });
    expect((await POST(request())).status).toBe(200);
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
});
