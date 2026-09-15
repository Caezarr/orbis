import { describe, expect, it } from "vitest";
import {
  balance,
  createAccount,
  createQuote,
  getTaskQuote,
  planQuote,
  proposedRateCard,
  refund,
  release,
  reserve,
  settle,
} from "./index";
import type { TaskQuote } from "./domain";

const quote = (key = "booking-1:arrival", media = false) =>
  createQuote(proposedRateCard, {
    id: `quote:${key}`,
    tenantId: "tenant-a",
    outcomeKey: key,
    verticalId: "rental-operations",
    createdAt: 100,
    expiresAt: 200,
    media: media ? [{ rateId: "image", units: 2 }] : [],
  });
const accept = (q: TaskQuote, at = 110) => ({
  quoteId: q.id,
  acceptedTotalCents: q.totalCents,
  at,
});

describe("task economics", () => {
  it("prices all ten runtime verticals without exact task-type coupling", () => {
    expect(proposedRateCard.tasks).toHaveLength(10);
    for (const rate of proposedRateCard.tasks) {
      expect(
        getTaskQuote({
          workflowId: rate.id,
          taskId: "generic-task",
          quantity: 3,
        }),
      ).toEqual({
        workflowId: rate.id,
        taskId: "generic-task",
        quantity: 3,
        currency: "EUR",
        unitPriceCents: rate.taskCents,
        totalCents: rate.taskCents * 3,
        rateVersion: proposedRateCard.version,
        billableOutcome: "completed_task",
      });
    }
  });
  it("requires explicit unknown workflow mapping", () => {
    expect(() => getTaskQuote({ workflowId: "unknown", taskId: "x" })).toThrow(
      "WORKFLOW_RATE",
    );
    expect(
      getTaskQuote(
        { workflowId: "custom", taskId: "x" },
        { workflowRates: { custom: "ecommerce-operations" } },
      ).unitPriceCents,
    ).toBe(150);
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    "rejects invalid or overflowing quantity %s",
    (quantity) => {
      expect(() =>
        getTaskQuote({ workflowId: "commerce", taskId: "x", quantity }),
      ).toThrow();
    },
  );
  it("snapshots rates and holds the agreed price after a new rate card", () => {
    const card = structuredClone(proposedRateCard);
    const q = createQuote(card, {
      id: "q",
      tenantId: "tenant-a",
      outcomeKey: "result",
      verticalId: "ecommerce-operations",
      createdAt: 100,
      expiresAt: 200,
    });
    Object.assign(card.tasks[2], { taskCents: 999 });
    const account = reserve(
      createAccount("tenant-a", "month", 500),
      q,
      accept(q),
    );
    expect(
      balance(settle(account, "result", "succeeded", 120)).spentCents,
    ).toBe(150);
    expect(Object.isFrozen(q.lines[0])).toBe(true);
  });
  it("reserves then settles once; duplicate attempts and refunds never create a new charge", () => {
    const q = quote();
    const empty = createAccount("tenant-a", "month", 150);
    const held = reserve(empty, q, accept(q));
    expect(balance(empty).availableCents).toBe(150);
    expect(balance(held)).toMatchObject({
      heldCents: 150,
      spentCents: 0,
      availableCents: 0,
    });
    expect(reserve(held, q, accept(q, 999))).toBe(held);
    const paid = settle(held, q.outcomeKey, "succeeded", 120);
    expect(settle(paid, q.outcomeKey, "succeeded", 130)).toBe(paid);
    expect(balance(paid).spentCents).toBe(150);
    const refunded = refund(paid, q.outcomeKey, 140);
    expect(balance(refunded).availableCents).toBe(150);
    expect(refund(refunded, q.outcomeKey, 150)).toBe(refunded);
    expect(reserve(refunded, q, accept(q))).toBe(refunded);
    expect(settle(refunded, q.outcomeKey, "succeeded", 160)).toBe(refunded);
  });
  it.each(["failed", "cancelled"] as const)(
    "releases cash and included tasks for %s",
    (status) => {
      const q = quote("r", true);
      const held = reserve(
        createAccount("tenant-a", "month", 200, 1),
        q,
        accept(q),
      );
      expect(balance(held)).toMatchObject({
        heldCents: 200,
        availableTasks: 0,
      });
      const closed = release(held, q.outcomeKey, status, 130);
      expect(balance(closed)).toEqual({
        heldCents: 0,
        spentCents: 0,
        availableCents: 200,
        availableTasks: 1,
      });
      expect(settle(closed, q.outcomeKey, "succeeded", 140)).toBe(closed);
    },
  );
  it.each([
    "unknown",
    "running",
    "completed",
    "timeout",
    "new-provider-status",
  ])("holds funds for unnormalized status %s", (status) => {
    const q = quote();
    const held = reserve(createAccount("tenant-a", "month", 150), q, accept(q));
    expect(settle(held, q.outcomeKey, status, 120)).toBe(held);
  });
  it("prevents overspending across outcomes and reuses freed included units", () => {
    const a = quote("a"),
      b = quote("b");
    const held = reserve(
      createAccount("tenant-a", "month", 0, 1),
      a,
      accept(a),
    );
    expect(() => reserve(held, b, accept(b))).toThrow("INSUFFICIENT_BUDGET");
    const freed = release(held, a.outcomeKey, "cancelled", 120);
    expect(balance(reserve(freed, b, accept(b, 130))).availableTasks).toBe(0);
  });
  it("requires acceptance of explicit media quantities before holding money", () => {
    const q = quote("media", true);
    expect(q.totalCents).toBe(350);
    const empty = createAccount("tenant-a", "month", 349);
    expect(() => reserve(empty, q, accept(q))).toThrow("INSUFFICIENT_BUDGET");
    expect(() =>
      reserve(empty, q, { ...accept(q), acceptedTotalCents: 150 }),
    ).toThrow("QUOTE_NOT_ACCEPTED");
    const held = reserve(createAccount("tenant-a", "month", 500), q, accept(q));
    const changed = createQuote(proposedRateCard, {
      id: q.id,
      tenantId: q.tenantId,
      outcomeKey: q.outcomeKey,
      verticalId: "rental-operations",
      createdAt: 100,
      expiresAt: 200,
      media: [{ rateId: "image", units: 3 }],
    });
    expect(() => reserve(held, changed, accept(changed))).toThrow(
      "IDEMPOTENCY_CONFLICT",
    );
  });
  it("rejects forged totals, tenant mismatch, expired quotes and refund before settlement", () => {
    const q = quote();
    const account = createAccount("tenant-a", "month", 500);
    expect(() => reserve(account, { ...q, totalCents: 1 }, accept(q))).toThrow(
      "INVALID_TOTAL",
    );
    expect(() =>
      reserve(createAccount("other", "month", 500), q, accept(q)),
    ).toThrow("TENANT_MISMATCH");
    expect(() => reserve(account, q, accept(q, 200))).toThrow("QUOTE_EXPIRED");
    expect(() => reserve(account, q, accept(q, 99))).toThrow("QUOTE_EXPIRED");
    expect(() =>
      refund(reserve(account, q, accept(q)), q.outcomeKey, 120),
    ).toThrow("NOT_SETTLED");
  });
  it("accepts PostgreSQL jsonb key reordering for a duplicate snapshot", () => {
    const q = quote();
    const held = reserve(createAccount("tenant-a", "month", 500), q, accept(q));
    const reordered = Object.fromEntries(
      Object.entries(q).reverse(),
    ) as TaskQuote;
    expect(reserve(held, reordered, accept(q))).toBe(held);
  });
  it("restores included entitlement on refund", () => {
    const q = quote();
    const paid = settle(
      reserve(createAccount("tenant-a", "month", 0, 1), q, accept(q)),
      q.outcomeKey,
      "succeeded",
      120,
    );
    expect(balance(paid).availableTasks).toBe(0);
    expect(balance(refund(paid, q.outcomeKey, 130)).availableTasks).toBe(1);
  });
  it("calculates seat thresholds and rejects invalid configuration", () => {
    expect(planQuote("Business", 5).monthlyCents).toBe(39900);
    expect(planQuote("Business", 6).monthlyCents).toBe(43800);
    expect(planQuote("Business", 50).monthlyCents).toBe(215400);
    expect(() => planQuote("Business", 51)).toThrow();
    expect(() => planQuote("Solo", 2)).toThrow();
  });
});
