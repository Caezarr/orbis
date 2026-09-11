import { describe, it, expect } from "vitest";
import { planRentalEvent } from "./rental";
import { contentProductionGate } from "./content";
const event = {
  eventId: "evt1",
  kind: "reservation_created",
  reservationId: "r1",
  propertyId: "p1",
  arrivalAt: "2026-10-10T16:00:00+02:00",
  departureAt: "2026-10-12T10:00:00+02:00",
};
const properties = [
  { id: "p1", guideVersion: "v1", cleanerId: "cleaner1", allowDrafts: true },
];
describe("rental operational rules", () => {
  it("plans a property-specific arrival and turnover", () => {
    const a = planRentalEvent(event, properties);
    expect(a.map((x) => x.kind)).toEqual([
      "prepare_arrival",
      "assign_turnover",
    ]);
    expect(a.every((x) => x.requiresApproval)).toBe(true);
    expect(a[0].dueAt).toBe("2026-10-08T14:00:00.000Z");
  });
  it("deduplicates processed events", () => {
    expect(planRentalEvent(event, properties, ["p1:r1:evt1"])).toEqual([]);
  });
  it("blocks unknown properties and urgent messages", () => {
    expect(
      planRentalEvent({ ...event, propertyId: "p2" }, properties)[0].kind,
    ).toBe("escalate");
    expect(
      planRentalEvent({ ...event, urgent: true }, properties)[0].kind,
    ).toBe("escalate");
  });
  it("cancels only scheduled work, not bookings", () => {
    expect(
      planRentalEvent(
        { ...event, kind: "reservation_cancelled" },
        properties,
      )[0].kind,
    ).toBe("cancel_scheduled_work");
  });
  it("rejects invalid stay dates", () => {
    expect(() =>
      planRentalEvent({ ...event, departureAt: event.arrivalAt }, properties),
    ).toThrow();
  });
});
const pack = {
  script: "An original script with a useful, sourced point of view.",
  sourceIds: ["s1"],
  claims: [{ text: "A verifiable statement", sourceIds: ["s1"] }],
  rightsConfirmed: true,
  approvedScript: true,
  estimatedCostEur: 2,
  perPieceLimitEur: 5,
  remainingBudgetEur: 10,
};
describe("creator production gates", () => {
  it("allows an approved, scoped and budgeted pack without granting publication permission", () => {
    expect(contentProductionGate(pack, ["s1"])).toEqual({
      allowed: true,
      reasons: [],
      requiresPublicationApproval: true,
    });
  });
  it("blocks unapproved scripts, missing rights, unscoped sources and excessive spend", () => {
    for (const bad of [
      { approvedScript: false },
      { rightsConfirmed: false },
      { sourceIds: ["private"] },
      { remainingBudgetEur: 1 },
      { bannedPhrases: ["original"] },
    ])
      expect(contentProductionGate({ ...pack, ...bad }, ["s1"]).allowed).toBe(
        false,
      );
  });
});
