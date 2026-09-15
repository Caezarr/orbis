import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskRow } from "@/lib/operations/domain";
const mocks = vi.hoisted(() => ({ query: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/platform/context", () => ({
  workspaceContext: () => ({
    db: { query: mocks.query },
    tenantId: "tenant",
    workspaceId: "workspace",
    userId: "user",
    role: "owner",
  }),
}));
vi.mock("./stripe", () => ({
  stripe: () => ({ checkout: { sessions: { create: mocks.create } } }),
  appUrl: () => "https://orbis.example",
}));
import {
  recordTaskCharge,
  createReservedCheckout,
  type PaymentReservation,
} from "./task-ledger";
const row = (mode?: string) =>
  ({ id: "task", total_cents: 150, input: { billingMode: mode } }) as TaskRow;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
});
describe("accepted task ledger", () => {
  it("never retroactively charges a task without billing consent", async () => {
    await recordTaskCharge(row());
    expect(mocks.query.mock.calls.at(-1)?.[1]).toEqual([
      "task",
      "tenant",
      "workspace",
      150,
      0,
      "preview",
      null,
    ]);
  });
  it("records the immutable quoted amount once when no allowance applies", async () => {
    await recordTaskCharge(row("pay_per_task"));
    const [sql, params] = mocks.query.mock.calls.at(-1)!;
    expect(sql).toContain("ON CONFLICT(task_id) DO NOTHING");
    expect(params).toEqual([
      "task",
      "tenant",
      "workspace",
      150,
      150,
      "payable",
      null,
    ]);
  });
  it("records included tasks at zero under the tenant lock", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith("SELECT plan")
        ? [{ plan: "Solo", current_period_start: "2026-09-01T00:00:00Z" }]
        : sql.includes("count(*)")
          ? [{ count: 0 }]
          : [],
    }));
    await recordTaskCharge(row("pay_per_task"));
    expect(mocks.query.mock.calls[0][0]).toContain("pg_advisory_xact_lock");
    expect(mocks.query.mock.calls.at(-1)?.[1]).toEqual([
      "task",
      "tenant",
      "workspace",
      150,
      0,
      "included",
      "2026-09-01T00:00:00.000Z",
    ]);
  });
  it("charges overflow at the quoted rate", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.startsWith("SELECT plan")
        ? [{ plan: "Solo", current_period_start: "2026-09-01T00:00:00Z" }]
        : sql.includes("count(*)")
          ? [{ count: 99999 }]
          : [],
    }));
    await recordTaskCharge(row("pay_per_task"));
    expect(mocks.query.mock.calls.at(-1)?.[1][4]).toBe(150);
  });
  it("refuses to retry an ambiguous reservation outside the idempotency window", async () => {
    await expect(
      createReservedCheckout({
        id: "old",
        created_at: new Date(Date.now() - 24 * 3600000).toISOString(),
      } as PaymentReservation),
    ).rejects.toThrow("reconciliation");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("uses identical checkout payload and idempotency key on retry", async () => {
    mocks.create.mockResolvedValue({
      url: "https://checkout.stripe.com/session",
    });
    const reservation = {
      id: "batch",
      customer_id: "customer",
      amount_cents: 150,
      created_at: new Date().toISOString(),
    } as PaymentReservation;
    await createReservedCheckout(reservation);
    await createReservedCheckout({ ...reservation, task_count: 0 });
    expect(mocks.create.mock.calls[0]).toEqual(mocks.create.mock.calls[1]);
    expect(
      mocks.create.mock.calls[0][0].line_items[0].price_data.unit_amount,
    ).toBe(150);
  });
});
