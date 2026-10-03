import { describe, expect, it } from "vitest";
import {
  computeFreeSlots,
  DEFAULT_HOURS,
  detectMeetingRequest,
  localDay,
  parseWorkingHours,
  slotLabel,
  validateMeetingDraft,
  workingHours,
  zonedInstant,
  type MeetingPlan,
} from "./slots";
import { guardDraft } from "@/lib/runtime/inbox-replies";

const TZ = "Europe/Paris" as const;
// Friday 2 October 2026, 15:00 Paris (13:00 UTC, CEST = UTC+2).
const NOW = new Date("2026-10-02T13:00:00Z");
const base = {
  now: NOW,
  timezone: TZ,
  hours: DEFAULT_HOURS,
  busy: [],
  durationMinutes: 60,
  bufferMinutes: 30,
  minLeadMinutes: 18 * 60,
  horizonDays: 10,
  count: 3,
};
const local = (iso: string) => {
  const d = localDay(Date.parse(iso), TZ);
  return { weekday: d.weekday, minutes: d.hour * 60 + d.minute, day: d.day };
};

describe("timezone arithmetic", () => {
  it("maps Paris wall time to UTC across the October DST change", () => {
    expect(new Date(zonedInstant(2026, 10, 7, 600, TZ)).toISOString()).toBe("2026-10-07T08:00:00.000Z");
    // 25 October 2026: clocks go back, CET = UTC+1.
    expect(new Date(zonedInstant(2026, 10, 26, 600, TZ)).toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(new Date(zonedInstant(2026, 10, 7, 600, "Europe/Brussels")).toISOString()).toBe("2026-10-07T08:00:00.000Z");
  });
  it("labels slots in French, local time", () => {
    const s = zonedInstant(2026, 10, 7, 600, TZ);
    expect(slotLabel(s, s + 3_600_000, TZ)).toBe("mercredi 7 octobre de 10h à 11h");
    const t = zonedInstant(2026, 10, 1, 870, TZ);
    expect(slotLabel(t, t + 1_800_000, TZ)).toBe("jeudi 1er octobre de 14h30 à 15h");
  });
});

describe("working hours from the company sheet", () => {
  it("parses common French statements", () => {
    const w = parseWorkingHours(["Du lundi au vendredi de 8h à 12h et de 13h30 à 17h"])!;
    expect(w[1]).toEqual([[480, 720], [810, 1020]]);
    expect(w[5]).toEqual([[480, 720], [810, 1020]]);
    expect(w[6]).toEqual([]);
    expect(w[0]).toEqual([]);
    const v = parseWorkingHours(["Lun-sam 08:00-18:00"])!;
    expect(v[6]).toEqual([[480, 1080]]);
  });
  it("clamps to 07:00–20:00 and never opens Sunday", () => {
    const w = parseWorkingHours(["Ouvert du lundi au dimanche de 3h à 23h"])!;
    expect(w[0]).toEqual([]);
    expect(w[2]).toEqual([[420, 1200]]);
  });
  it("falls back to defaults marked as assumed", () => {
    expect(workingHours(["Nous répondons vite."]).assumed).toBe(true);
    expect(workingHours([]).weekly).toBe(DEFAULT_HOURS);
    expect(workingHours(["En semaine 9h-18h"]).assumed).toBe(false);
  });
});

describe("computeFreeSlots", () => {
  it("returns 3 slots inside working hours, after the lead time, one per day first", () => {
    const slots = computeFreeSlots(base);
    expect(slots).toHaveLength(3);
    const days = new Set(slots.map((s) => local(s.start).day));
    expect(days.size).toBe(3);
    for (const s of slots) {
      const { weekday, minutes } = local(s.start);
      expect([1, 2, 3, 4, 5]).toContain(weekday);
      expect(DEFAULT_HOURS[weekday].some(([a, b]) => minutes >= a && minutes + 60 <= b)).toBe(true);
      expect(Date.parse(s.start)).toBeGreaterThanOrEqual(NOW.getTime() + 18 * 3_600_000);
    }
    // Friday 15:00 + 18h lead → nothing on the weekend → Monday 5 October 9h first.
    expect(slots[0].label).toBe("lundi 5 octobre de 9h à 10h");
  });
  it("never overlaps a busy interval, including the buffer", () => {
    const busy = [
      // Monday 9:00–10:45 busy → with a 30 min buffer the first free start is 11:15 → rounded to the 30 min grid: none before 12h end; afternoon 14h.
      { start: zonedInstant(2026, 10, 5, 540, TZ), end: zonedInstant(2026, 10, 5, 645, TZ) },
    ];
    const slots = computeFreeSlots({ ...base, busy });
    for (const s of slots)
      for (const b of busy) {
        const start = Date.parse(s.start) - 30 * 60_000;
        const end = Date.parse(s.end) + 30 * 60_000;
        expect(start < b.end && b.start < end).toBe(false);
      }
    expect(slots[0].label).toBe("lundi 5 octobre de 14h à 15h");
  });
  it("returns nothing when the whole horizon is busy (no double booking)", () => {
    const busy = [{ start: NOW.getTime(), end: NOW.getTime() + 30 * 86_400_000 }];
    expect(computeFreeSlots({ ...base, busy })).toEqual([]);
  });
  it("held slots (already offered to someone else) are treated as busy", () => {
    const first = computeFreeSlots(base);
    const held = first.map((s) => ({ start: Date.parse(s.start), end: Date.parse(s.end) }));
    const second = computeFreeSlots({ ...base, busy: held });
    for (const s of second) expect(first.map((f) => f.start)).not.toContain(s.start);
  });
});

describe("detectMeetingRequest", () => {
  it.each([
    ["Visite chantier", "Pourriez-vous passer voir le chantier la semaine prochaine ?", "visit"],
    ["Rendez-vous", "Je souhaiterais un rendez-vous pour un devis.", "visit"],
    ["Question", "Êtes-vous dispo pour un appel demain ?", "call"],
    ["Contact", "Can we schedule a call?", "call"],
    ["Offerte", "Kunnen we een afspraak maken?", "visit"],
  ])("detects %s", (subject, text, kind) => {
    expect(detectMeetingRequest(subject, text)).toBe(kind);
  });
  it.each([
    ["Devis", "Combien coûte le remplacement d'une fenêtre ?"],
    ["Appel d'offres", "Nous lançons un appel d'offres pour la rénovation."],
    ["Stock", "Ce modèle est-il disponible en blanc ?"],
  ])("ignores %s", (subject, text) => {
    expect(detectMeetingRequest(subject, text)).toBeNull();
  });
});

const slotsPlan: MeetingPlan = {
  mode: "slots",
  kind: "visit",
  timezone: TZ,
  hoursAssumed: false,
  simulated: false,
  slots: [
    { start: "2026-10-05T07:00:00Z", end: "2026-10-05T08:00:00Z", label: "lundi 5 octobre de 9h à 10h" },
    { start: "2026-10-06T07:00:00Z", end: "2026-10-06T08:00:00Z", label: "mardi 6 octobre de 9h à 10h" },
  ],
};
describe("validateMeetingDraft (critique step)", () => {
  it("keeps offered slots untouched", () => {
    const body =
      "Bonjour,\n\nNous pouvons passer lundi 5 octobre de 9h à 10h ou mardi 6 octobre de 9h à 10h.\n\nCordialement";
    const r = validateMeetingDraft(body, slotsPlan);
    expect(r.body).toBe(body);
    expect(r.issues).toEqual([]);
  });
  it("replaces any other date or time and keeps durations", () => {
    const body =
      "Bonjour,\n\nNous pouvons venir à 3am, ou jeudi 8 octobre à 15h, ou lundi 5 octobre de 9h à 10h. Intervention sous 2h, garantie 48h.\n\nCordialement";
    const r = validateMeetingDraft(body, slotsPlan);
    expect(r.body).not.toMatch(/3am|jeudi 8|15h/);
    expect(r.body).toContain("lundi 5 octobre de 9h à 10h");
    expect(r.body).toContain("sous 2h");
    expect(r.body).toContain("48h");
    expect(r.issues).toContain("slot_unlisted");
  });
  it("inserts the code-built slot list when the model omitted it", () => {
    const r = validateMeetingDraft("Bonjour,\n\nAvec plaisir.\n\nCordialement", slotsPlan);
    expect(r.issues).toContain("slot_missing");
    expect(r.body).toContain("- lundi 5 octobre de 9h à 10h");
    expect(r.body.endsWith("Cordialement")).toBe(true);
  });
  it("flags default hours with a placeholder and a question", () => {
    const r = validateMeetingDraft("Bonjour, lundi 5 octobre de 9h à 10h ?", { ...slotsPlan, hoursAssumed: true });
    expect(r.body).toMatch(/^\[\[À CONFIRMER : horaires/);
    expect(r.questions[0]).toMatch(/Horaires d’intervention à confirmer/);
  });
  it("ask mode: no time proposed, availability question ensured", () => {
    const ask: MeetingPlan = { mode: "ask_availability", kind: "visit", reason: "calendar_off" };
    const r = validateMeetingDraft("Bonjour,\n\nJe peux venir mardi 6 octobre à 10h30.\n\nCordialement", ask);
    expect(r.body).not.toMatch(/10h30|mardi 6/);
    expect(r.body).toContain("Pourriez-vous nous indiquer vos disponibilités ?");
    const ok = validateMeetingDraft("Bonjour, quelles sont vos disponibilités ?", ask);
    expect(ok.issues).toEqual([]);
  });
  it("slot labels survive the contact/amount guard", () => {
    const g = guardDraft(
      { body: "Bonjour, lundi 5 octobre de 9h à 10h ou mardi 6 octobre de 9h à 10h ?", questions: [], citations: [] },
      { sources: [], message: { from: { address: "c@example.com" } } as never },
    );
    expect(g.body).toContain("lundi 5 octobre de 9h à 10h");
    expect(g.issues).toEqual([]);
  });
});
