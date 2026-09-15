import { describe, expect, it } from "vitest";
import {
  contributionActivity,
  dayKey,
  safeProof,
  type ContributionEvent,
} from "./contributions";

const event = (
  id: string,
  occurredAt: string,
  extra: Partial<ContributionEvent> = {},
): ContributionEvent => ({
  id,
  occurredAt,
  tenantId: "company",
  kind: "accepted_work",
  title: "Accepted proposal",
  proofHref: `/tasks/${id}`,
  ...extra,
});
describe("contributions", () => {
  it("places the same instant on the correct local day across year boundaries", () => {
    expect(dayKey("2026-01-01T00:30:00Z", "America/Los_Angeles")).toBe(
      "2025-12-31",
    );
    expect(dayKey("2026-01-01T00:30:00Z", "Europe/Paris")).toBe("2026-01-01");
    expect(dayKey("2026-01-01T00:30:00", "Europe/Paris")).toBeNull();
    expect(dayKey("invalid", "UTC")).toBeNull();
  });
  it.each(["2026-03-30T12:00:00Z", "2026-10-26T12:00:00Z"])(
    "keeps calendar days contiguous through DST: %s",
    (instant) => {
      const result = contributionActivity([], {
        tenantId: "company",
        timeZone: "Europe/Paris",
        now: new Date(instant),
        days: 4,
      });
      expect(result.cells).toHaveLength(4);
      expect(new Set(result.cells.map((cell) => cell.date)).size).toBe(4);
      result.cells
        .slice(1)
        .forEach((cell, i) =>
          expect(Date.parse(cell.date) - Date.parse(result.cells[i].date)).toBe(
            86400000,
          ),
        );
    },
  );
  it("excludes other tenants, duplicates, future events, unsafe proofs and undated reviews", () => {
    const valid = event("a", "2026-09-12T08:00:00Z");
    const result = contributionActivity(
      [
        valid,
        valid,
        event("other", valid.occurredAt, { tenantId: "other" }),
        event("future", "2026-09-12T23:00:00Z"),
        event("old", "2026-01-01T00:00:00Z"),
        event("undated", ""),
        event("unsafe", valid.occurredAt, { proofHref: "//example.com" }),
      ],
      {
        tenantId: "company",
        timeZone: "UTC",
        now: new Date("2026-09-12T12:00:00Z"),
      },
    );
    expect(result.events.map((e) => e.id)).toEqual(["a"]);
    expect(result.cells.at(-1)?.events).toHaveLength(1);
  });
  it("counts all three collaboration kinds by team without inventing attribution", () => {
    const events = [
      event("1", "2026-09-12T08:00:00Z", { teamId: "a" }),
      event("2", "2026-09-12T08:00:00Z", {
        kind: "approved_memory",
        teamId: "b",
      }),
      event("3", "2026-09-12T08:00:00Z", {
        kind: "reviewed_decision",
        teamId: "a",
      }),
      event("4", "2026-09-12T08:00:00Z"),
    ];
    const options = {
      tenantId: "company",
      timeZone: "UTC",
      now: new Date("2026-09-12T12:00:00Z"),
    };
    expect(contributionActivity(events, options).leaderboard).toEqual([
      { teamId: "a", count: 2 },
      { teamId: "b", count: 1 },
    ]);
    expect(
      contributionActivity(events, { ...options, teamId: "b" }).events.map(
        (e) => e.id,
      ),
    ).toEqual(["2"]);
  });
  it("rejects external and backslash proof URLs", () => {
    expect(safeProof("javascript:alert(1)")).toBe(false);
    expect(safeProof("/\\example.com")).toBe(false);
    expect(safeProof("/tasks/abc?proof=1")).toBe(true);
  });
});
