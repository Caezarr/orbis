import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  businessDaysBetween,
  easter,
  followupDueAt,
  formatLocalDate,
  isBusinessDay,
  isPublicHoliday,
  parisDate,
  parisMidnight,
  parisWeek,
  parseLocalDate,
} from "./calendar";

const d = (s: string) => parseLocalDate(s)!;
describe("French business calendar (Europe/Paris)", () => {
  it("computes Easter and the movable holidays", () => {
    expect(formatLocalDate(easter(2026))).toBe("2026-04-05");
    expect(formatLocalDate(easter(2027))).toBe("2027-03-28");
    expect(isBusinessDay(d("2026-04-06"))).toBe(false); // Lundi de Pâques
    expect(isBusinessDay(d("2026-05-14"))).toBe(false); // Ascension
    expect(isBusinessDay(d("2026-05-25"))).toBe(false); // Lundi de Pentecôte
  });
  it("weekends and fixed holidays are not business days", () => {
    expect(isBusinessDay(d("2026-10-03"))).toBe(false); // Saturday
    expect(isBusinessDay(d("2026-10-04"))).toBe(false); // Sunday
    expect(isBusinessDay(d("2026-11-11"))).toBe(false); // Armistice (Wednesday)
    expect(isBusinessDay(d("2026-12-25"))).toBe(false);
    expect(isBusinessDay(d("2026-10-02"))).toBe(true); // Friday
  });
  it("adds business days skipping weekends", () => {
    expect(formatLocalDate(addBusinessDays(d("2026-10-02"), 5))).toBe("2026-10-09"); // Fri → next Fri
    expect(formatLocalDate(addBusinessDays(d("2026-10-03"), 1))).toBe("2026-10-05"); // Sat → Mon
  });
  it("adds business days skipping holidays", () => {
    // Mon 9 Nov 2026 + 5: Tue 10, (Wed 11 holiday), Thu 12, Fri 13, Mon 16, Tue 17.
    expect(formatLocalDate(addBusinessDays(d("2026-11-09"), 5))).toBe("2026-11-17");
    // Thu 24 Dec + 2: (Fri 25 Christmas), Mon 28, Tue 29.
    expect(formatLocalDate(addBusinessDays(d("2026-12-24"), 2))).toBe("2026-12-29");
  });
  it("uses the Paris calendar date, not UTC, and is DST-safe", () => {
    // 23:30 UTC on Friday 2 Oct = 01:30 Saturday in Paris.
    expect(formatLocalDate(parisDate(new Date("2026-10-02T23:30:00Z")))).toBe("2026-10-03");
    expect(parisMidnight(d("2026-10-05")).toISOString()).toBe("2026-10-04T22:00:00.000Z"); // CEST
    expect(parisMidnight(d("2026-11-02")).toISOString()).toBe("2026-11-01T23:00:00.000Z"); // CET
    expect(parisMidnight(d("2026-10-25")).toISOString()).toBe("2026-10-24T22:00:00.000Z"); // DST change day
  });
  it("a follow-up is due at 00:00 Paris on the Nth business day after the owner's message", () => {
    // Sent Friday 2 Oct 18:00 Paris; N=5 → Friday 9 Oct 00:00 Paris.
    expect(followupDueAt(new Date("2026-10-02T16:00:00Z"), 5).toISOString()).toBe("2026-10-08T22:00:00.000Z");
    // Sent Saturday: counting starts Monday.
    expect(followupDueAt(new Date("2026-10-03T09:00:00Z"), 1).toISOString()).toBe("2026-10-04T22:00:00.000Z");
  });
  it("counts business days between two instants", () => {
    expect(businessDaysBetween(new Date("2026-10-02T10:00:00Z"), new Date("2026-10-09T10:00:00Z"))).toBe(5);
    expect(businessDaysBetween(new Date("2026-10-02T10:00:00Z"), new Date("2026-10-04T10:00:00Z"))).toBe(0);
  });
  it("weeks run Monday 00:00 → Monday 00:00 Paris", () => {
    const w = parisWeek(new Date("2026-10-02T12:00:00Z"));
    expect(formatLocalDate(w.monday)).toBe("2026-09-28");
    expect(w.start.toISOString()).toBe("2026-09-27T22:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-10-04T22:00:00.000Z");
    // Week containing the end of DST (Sun 25 Oct 2026) lasts 169 hours.
    const dst = parisWeek(new Date("2026-10-21T12:00:00Z"));
    expect((dst.end.getTime() - dst.start.getTime()) / 3_600_000).toBe(169);
  });
  it("rejects invalid dates", () => {
    expect(parseLocalDate("2026-02-30")).toBeNull();
    expect(parseLocalDate("2026-13-01")).toBeNull();
    expect(parseLocalDate("x")).toBeNull();
  });
});

describe("public holidays by workspace country", () => {
  it("France and Belgium share the common days and differ on the national ones", () => {
    for (const date of ["2027-01-01", "2027-03-29", "2027-05-01", "2027-05-06", "2027-05-17", "2027-08-15", "2027-11-01", "2027-11-11", "2027-12-25"]) {
      expect(isPublicHoliday(d(date), "Europe/Paris")).toBe(true);
      expect(isPublicHoliday(d(date), "Europe/Brussels")).toBe(true);
    }
    expect(isPublicHoliday(d("2027-07-14"), "Europe/Paris")).toBe(true);
    expect(isPublicHoliday(d("2027-07-14"), "Europe/Brussels")).toBe(false);
    expect(isPublicHoliday(d("2027-05-08"), "Europe/Brussels")).toBe(false);
    expect(isPublicHoliday(d("2027-07-21"), "Europe/Brussels")).toBe(true);
    expect(isPublicHoliday(d("2027-07-21"), "Europe/Paris")).toBe(false);
    expect(isPublicHoliday(d("2027-07-22"), "Europe/Brussels")).toBe(false);
  });
  it("business days follow the workspace country (follow-up delays)", () => {
    // Wed 14/07/2027: holiday in France, working day in Belgium; Wed 21/07: the reverse.
    expect(isBusinessDay(d("2027-07-14"), "Europe/Paris")).toBe(false);
    expect(isBusinessDay(d("2027-07-14"), "Europe/Brussels")).toBe(true);
    expect(isBusinessDay(d("2027-07-21"), "Europe/Brussels")).toBe(false);
    expect(isBusinessDay(d("2027-07-21"))).toBe(true);
    expect(formatLocalDate(addBusinessDays(d("2027-07-20"), 1, "Europe/Brussels"))).toBe("2027-07-22");
    expect(formatLocalDate(addBusinessDays(d("2027-07-13"), 1, "Europe/Brussels"))).toBe("2027-07-14");
    // Owner wrote Tue 20/07 at 10:00: due the next Belgian business day (Thu 22), not Wed 21.
    const sent = new Date("2027-07-20T08:00:00Z");
    expect(followupDueAt(sent, 1, "Europe/Brussels").toISOString()).toBe("2027-07-21T22:00:00.000Z");
    expect(followupDueAt(sent, 1, "Europe/Paris").toISOString()).toBe("2027-07-20T22:00:00.000Z");
    expect(followupDueAt(sent, 1).toISOString()).toBe("2027-07-20T22:00:00.000Z");
    expect(businessDaysBetween(new Date("2027-07-13T08:00:00Z"), new Date("2027-07-23T08:00:00Z"), "Europe/Brussels")).toBe(7);
    expect(businessDaysBetween(new Date("2027-07-13T08:00:00Z"), new Date("2027-07-23T08:00:00Z"), "Europe/Paris")).toBe(7);
    expect(businessDaysBetween(new Date("2027-07-13T08:00:00Z"), new Date("2027-07-22T08:00:00Z"), "Europe/Brussels")).toBe(6);
    expect(businessDaysBetween(new Date("2027-07-13T08:00:00Z"), new Date("2027-07-22T08:00:00Z"), "Europe/Paris")).toBe(6);
  });
});
