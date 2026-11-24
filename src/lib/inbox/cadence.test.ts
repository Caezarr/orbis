import { describe, expect, it } from "vitest";
import { checkedLabel, continuousCadence } from "./cadence";

// 24/11/2026 10:00 in Paris (UTC+1).
const now = new Date("2026-11-24T09:00:00Z");
const base = { continuousEnabled: true, intervalMinutes: 15 };

describe("checkedLabel", () => {
  it("names the day, in Paris time", () => {
    expect(checkedLabel("2026-11-24T08:45:00Z", now)).toBe("aujourd’hui à 09:45");
    expect(checkedLabel("2026-11-23T17:02:00Z", now)).toBe("hier à 18:02");
    expect(checkedLabel("2026-11-21T06:40:00Z", now)).toBe("le 21/11 à 07:40");
    // 23:30 UTC on the 23rd is already the 24th in Paris.
    expect(checkedLabel("2026-11-23T23:30:00Z", now)).toBe("aujourd’hui à 00:30");
  });
  it("returns null when never checked or unreadable", () => {
    expect(checkedLabel(undefined, now)).toBeNull();
    expect(checkedLabel("not a date", now)).toBeNull();
  });
});

describe("continuousCadence", () => {
  it("is on time while the due slot is within two intervals (30 min floor)", () => {
    const c = continuousCadence(
      { ...base, nextRunAt: "2026-11-24T08:35:00Z", lastCheckedAt: "2026-11-24T08:20:00Z" },
      now,
    );
    expect(c).toEqual({ lastChecked: "aujourd’hui à 09:20", late: false });
  });
  it("is late when the scheduler skipped hours (the throttled-cron case)", () => {
    const c = continuousCadence(
      { ...base, nextRunAt: "2026-11-24T02:49:00Z", lastCheckedAt: "2026-11-24T02:34:00Z" },
      now,
    );
    expect(c).toEqual({ lastChecked: "aujourd’hui à 03:34", late: true });
  });
  it("is late even before any check, once the first slot is long overdue", () => {
    expect(continuousCadence({ ...base, nextRunAt: "2026-11-24T07:00:00Z" }, now)).toEqual({
      lastChecked: null,
      late: true,
    });
  });
  it("scales the grace with longer intervals", () => {
    const c = continuousCadence({ ...base, intervalMinutes: 60, nextRunAt: "2026-11-24T07:30:00Z" }, now);
    expect(c.late).toBe(false);
    expect(continuousCadence({ ...base, intervalMinutes: 60, nextRunAt: "2026-11-24T06:30:00Z" }, now).late).toBe(true);
  });
  it("never reports late when continuous mode is off or not yet scheduled", () => {
    expect(continuousCadence({ ...base, continuousEnabled: false, nextRunAt: "2026-11-20T00:00:00Z" }, now).late).toBe(false);
    expect(continuousCadence({ ...base }, now).late).toBe(false);
  });
});
