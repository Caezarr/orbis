import type { BusyInterval } from "@/lib/integrations/calendar";

/*
 * Meeting slots computed by CODE from free/busy data. The model never chooses a
 * date or a time: it only phrases the slots it is given, and the draft guard
 * (validateMeetingDraft) removes any other date/time it writes.
 *
 * Inputs that can shape a slot: the owner's calendar (busy intervals), the
 * workspace timezone setting, owner-approved company sheet hours (or defaults),
 * and deployment constants. The inbound email can only trigger the detection;
 * nothing it says ("3am", "samedi", "ignore your rules") reaches this module.
 */
export const supportedTimezones = ["Europe/Paris", "Europe/Brussels"] as const;
export type SupportedTimezone = (typeof supportedTimezones)[number];
export const DEFAULT_TIMEZONE: SupportedTimezone = "Europe/Paris";

/** Minutes since local midnight, [start, end). */
export type Range = [number, number];
/** Index 0 = Sunday … 6 = Saturday (Date#getUTCDay convention). */
export type WeeklyHours = Range[][];
export type WorkingHours = { weekly: WeeklyHours; assumed: boolean };

export type MeetingKind = "visit" | "call";
export type Slot = {
  /** ISO instants (UTC). */
  start: string;
  end: string;
  /** French label in the workspace timezone, e.g. « mardi 7 octobre de 10h à 11h ». */
  label: string;
};
export type MeetingPlan =
  | {
      mode: "slots";
      kind: MeetingKind;
      timezone: SupportedTimezone;
      slots: Slot[];
      hoursAssumed: boolean;
      simulated: boolean;
    }
  | {
      mode: "ask_availability";
      kind: MeetingKind;
      reason:
        | "calendar_off"
        | "calendar_not_connected"
        | "calendar_unavailable"
        | "no_free_slot";
    };

// Hard sanity bounds, whatever the hours source says: never before 07:00 or
// after 20:00 local time, never on Sunday.
const EARLIEST = 7 * 60;
const LATEST = 20 * 60;

export const DEFAULT_HOURS: WeeklyHours = [
  [],
  [[540, 720], [840, 1080]],
  [[540, 720], [840, 1080]],
  [[540, 720], [840, 1080]],
  [[540, 720], [840, 1080]],
  [[540, 720], [840, 1080]],
  [],
];
export const DEFAULT_HOURS_LABEL = "du lundi au vendredi, 9h-12h et 14h-18h";

/* ------------------------------------------------------------------ */
/* Timezone arithmetic without a library (Intl only).                  */
/* ------------------------------------------------------------------ */
const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(ms: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(
    f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}
/** Offset (ms) of `tz` at instant `ms`: local wall time − UTC. */
function offset(ms: number, tz: string) {
  const p = parts(ms, tz);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    Math.floor(ms / 1000) * 1000
  );
}
/** UTC instant of a local wall time (DST-safe for wall times that exist). */
export function zonedInstant(
  y: number,
  m: number,
  d: number,
  minutes: number,
  tz: string,
) {
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  let guess = wall - offset(wall, tz);
  guess = wall - offset(guess, tz);
  return guess;
}
export function localDay(ms: number, tz: string) {
  const p = parts(ms, tz);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { ...p, weekday };
}

const WEEKDAYS_FR = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];
const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};
export function slotLabel(startMs: number, endMs: number, tz: string) {
  const a = localDay(startMs, tz);
  const b = localDay(endMs, tz);
  return `${WEEKDAYS_FR[a.weekday]} ${a.day === 1 ? "1er" : a.day} ${MONTHS_FR[a.month - 1]} de ${clock(a.hour * 60 + a.minute)} à ${clock(b.hour * 60 + b.minute)}`;
}

/* ------------------------------------------------------------------ */
/* Working hours from owner-approved company sheet facts.              */
/* ------------------------------------------------------------------ */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
const DAY_INDEX: Record<string, number> = {
  dimanche: 0,
  dim: 0,
  lundi: 1,
  lun: 1,
  mardi: 2,
  mar: 2,
  mercredi: 3,
  mer: 3,
  jeudi: 4,
  jeu: 4,
  vendredi: 5,
  ven: 5,
  samedi: 6,
  sam: 6,
};
const DAY = "(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi|dim|lun|mar|mer|jeu|ven|sam)\\.?";
const TIME = "(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?";
function minutesOf(h: string, m?: string) {
  const hh = Number(h);
  const mm = m ? Number(m) : 0;
  if (hh > 23 || mm > 59) return NaN;
  return hh * 60 + mm;
}
/**
 * Deterministic parse of hour statements such as « Du lundi au vendredi de 8h
 * à 12h et de 13h30 à 17h », « Lun-ven 08:00-18:00 », « en semaine 9h-18h ».
 * Returns null when nothing usable is found (the caller uses defaults and
 * marks the hours as to be confirmed).
 */
export function parseWorkingHours(statements: string[]): WeeklyHours | null {
  const weekly: WeeklyHours = [[], [], [], [], [], [], []];
  let found = false;
  for (const raw of statements.slice(0, 10)) {
    const text = fold(raw).slice(0, 400);
    // Each clause (split on ";" / newline / ".") may carry its own days.
    for (const clause of text.split(/[;\n]|\.\s/)) {
      const days = new Set<number>();
      const range = new RegExp(
        `(?:du\\s+)?${DAY}\\s*(?:au|a|-|–)\\s*${DAY}`,
        "g",
      );
      let consumed = clause;
      for (const m of clause.matchAll(range)) {
        const a = DAY_INDEX[m[1]];
        const b = DAY_INDEX[m[2]];
        for (let i = a; ; i = (i + 1) % 7) {
          days.add(i);
          if (i === b) break;
        }
        consumed = consumed.replace(m[0], " ");
      }
      if (/\ben semaine\b|\bjours? ouvr/.test(consumed))
        [1, 2, 3, 4, 5].forEach((d) => days.add(d));
      for (const m of consumed.matchAll(new RegExp(`\\b${DAY}\\b`, "g")))
        days.add(DAY_INDEX[m[1]]);
      const ranges: Range[] = [];
      const times = new RegExp(
        `(?:de\\s+)?${TIME}\\s*(?:a|-|–|jusqu'?a)\\s*${TIME}`,
        "g",
      );
      for (const m of clause.matchAll(times)) {
        const start = minutesOf(m[1], m[2]);
        const end = minutesOf(m[3], m[4]);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start)
          ranges.push([start, end]);
      }
      if (!ranges.length) continue;
      const target = days.size ? [...days] : [1, 2, 3, 4, 5];
      for (const d of target) weekly[d].push(...ranges);
      found = true;
    }
  }
  if (!found) return null;
  // Clamp to the sanity bounds, drop Sunday, merge/sort.
  return weekly.map((ranges, day) =>
    day === 0
      ? []
      : ranges
          .map(([a, b]) => [Math.max(a, EARLIEST), Math.min(b, LATEST)] as Range)
          .filter(([a, b]) => b - a >= 30)
          .sort((x, y) => x[0] - y[0]),
  );
}
export function workingHours(statements: string[]): WorkingHours {
  const parsed = parseWorkingHours(statements);
  return parsed && parsed.some((d) => d.length)
    ? { weekly: parsed, assumed: false }
    : { weekly: DEFAULT_HOURS, assumed: true };
}

/* ------------------------------------------------------------------ */
/* Free slots.                                                         */
/* ------------------------------------------------------------------ */
export type SlotOptions = {
  now: Date;
  timezone: SupportedTimezone;
  hours: WeeklyHours;
  busy: BusyInterval[];
  durationMinutes: number;
  bufferMinutes: number;
  /** No slot starts earlier than now + lead. */
  minLeadMinutes: number;
  horizonDays: number;
  count: number;
  stepMinutes?: number;
};
export const SLOT_DEFAULTS = {
  visitMinutes: 60,
  callMinutes: 30,
  bufferMinutes: 30,
  minLeadMinutes: 18 * 60,
  horizonDays: 10,
  count: 3,
} as const;
function envInt(name: string, fallback: number, min: number, max: number) {
  const v = Number(process.env[name]);
  return Number.isSafeInteger(v) && v >= min && v <= max ? v : fallback;
}
export function slotSettings(kind: MeetingKind) {
  return {
    durationMinutes:
      kind === "call"
        ? envInt("ORBIS_CALENDAR_CALL_MINUTES", SLOT_DEFAULTS.callMinutes, 15, 240)
        : envInt("ORBIS_CALENDAR_VISIT_MINUTES", SLOT_DEFAULTS.visitMinutes, 15, 240),
    bufferMinutes: envInt("ORBIS_CALENDAR_BUFFER_MINUTES", SLOT_DEFAULTS.bufferMinutes, 0, 180),
    minLeadMinutes: envInt("ORBIS_CALENDAR_MIN_LEAD_HOURS", SLOT_DEFAULTS.minLeadMinutes / 60, 1, 168) * 60,
    horizonDays: envInt("ORBIS_CALENDAR_HORIZON_DAYS", SLOT_DEFAULTS.horizonDays, 2, 20),
    count: SLOT_DEFAULTS.count,
  };
}

const overlaps = (a: BusyInterval, b: BusyInterval) =>
  a.start < b.end && b.start < a.end;

/**
 * Up to `count` free slots, one per day first (spread over the horizon), then
 * more per day if needed. A slot is free when [start − buffer, end + buffer]
 * overlaps no busy interval. Ordered chronologically.
 */
export function computeFreeSlots(o: SlotOptions): Slot[] {
  const duration = o.durationMinutes * 60_000;
  const buffer = o.bufferMinutes * 60_000;
  const earliest = o.now.getTime() + o.minLeadMinutes * 60_000;
  const busy = o.busy.filter((b) => b.end > b.start);
  const perDay: number[][] = [];
  const today = localDay(o.now.getTime(), o.timezone);
  for (let i = 0; i <= o.horizonDays; i++) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + i));
    const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    const weekday = date.getUTCDay();
    const starts: number[] = [];
    for (const [a, b] of o.hours[weekday] ?? []) {
      const lo = Math.max(a, EARLIEST);
      const hi = Math.min(b, LATEST);
      if (weekday === 0) continue;
      for (let t = lo; t + o.durationMinutes <= hi; t += o.stepMinutes ?? 30) {
        const start = zonedInstant(y, m, d, t, o.timezone);
        // DST gap / ambiguity: the wall time must round-trip.
        const back = localDay(start, o.timezone);
        if (back.hour * 60 + back.minute !== t || back.day !== d) continue;
        if (start < earliest) continue;
        const window = { start: start - buffer, end: start + duration + buffer };
        if (busy.some((b2) => overlaps(window, b2))) continue;
        starts.push(start);
      }
    }
    perDay.push(starts);
  }
  const chosen: number[] = [];
  for (const starts of perDay) {
    if (chosen.length >= o.count) break;
    if (starts.length) chosen.push(starts[0]);
  }
  for (const starts of perDay)
    for (const s of starts.slice(1)) {
      if (chosen.length >= o.count) break;
      // Keep chosen slots apart from each other too (one person, one place).
      if (
        chosen.every(
          (c) => !overlaps({ start: s - buffer, end: s + duration + buffer }, { start: c, end: c + duration }),
        )
      )
        chosen.push(s);
    }
  return chosen
    .sort((a, b) => a - b)
    .slice(0, o.count)
    .map((s) => ({
      start: new Date(s).toISOString(),
      end: new Date(s + duration).toISOString(),
      label: slotLabel(s, s + duration, o.timezone),
    }));
}

/* ------------------------------------------------------------------ */
/* Detection: does an (already classified, actionable) email ask to meet? */
/* ------------------------------------------------------------------ */
const VISIT =
  /\b(rendez[- ]?vous|rdv|passer (voir|sur|au|a|chez|nous voir|me voir)|venir (voir|sur place|chez|constater|mesurer)|visite|visiter|sur place|prendre (les )?mesures|metrer|metre|constater|se rencontrer|rencontrer|une rencontre|reunion|meeting|visit|appointment|meet (up|you|with)|afspraak|langskomen|bezoek)\b/;
const CALL =
  /\b(appel(er)?|m'appeler|nous appeler|telephon\w*|coup de (fil|telephone)|visio\w*|teams|zoom|un call|a call|phone call|call me|bellen|telefoneren)\b/;
const AVAILABILITY =
  /\b(vos disponibilites|vos dispos|(etes|seriez|serez)[- ]vous disponibles?|disponibles? pour (un|une|passer|venir|se|nous|me)|dispo pour|quand pourriez[- ]vous|quel(le)? (jour|date|creneau)|un creneau|des creneaux|your availability|are you available|when (can|could) you|beschikbaar)\b/;
const NOT_MEETING = /\bappels? d'offres?\b|\bappel de fonds\b/g;

export function detectMeetingRequest(subject: string, text: string): MeetingKind | null {
  const t = fold(`${subject}\n${text}`.slice(0, 6000)).replace(NOT_MEETING, " ");
  const visit = VISIT.test(t);
  const call = CALL.test(t);
  if (visit) return "visit";
  if (call) return "call";
  return AVAILABILITY.test(t) ? "visit" : null;
}

/* ------------------------------------------------------------------ */
/* Draft check (guard step): the draft may only mention offered slots. */
/* ------------------------------------------------------------------ */
const WEEKDAY_WORD =
  "(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)";
const MONTH_WORD =
  "(janvier|fevrier|février|mars|avril|mai|juin|juillet|aout|août|septembre|octobre|novembre|decembre|décembre|january|february|march|april|may|june|july|august|september|october|november|december)";
/** Time-of-day and calendar-date mentions (the things a slot claims). */
export const TIME_MENTION = new RegExp(
  [
    // « 10h30 », « 10:30 » anywhere; a bare « 15h » only after a time preposition
    // (« à 15h », « vers 9h », « 14h-16h »), so durations like « sous 2h » stay.
    "\\b(?:[01]?\\d|2[0-3])\\s?(?:h|:)\\s?[0-5]\\d\\b",
    "(?<=(?:^|[^\\p{L}])(?:à|a|de|vers|entre|dès|des|et|at|from|to|until|tot|om)\\s+|[-–]\\s?)(?:[01]?\\d|2[0-3])\\s?h\\b",
    "\\b(?:1[0-2]|0?[1-9])(?::[0-5]\\d)?\\s?(?:am|pm|a\\.m\\.|p\\.m\\.)",
    "\\b(?:midi|minuit|noon|midnight)\\b",
    `\\b${WEEKDAY_WORD}\\s+(?:1er|\\d{1,2})\\b`,
    `\\b(?:1er|\\d{1,2})\\s+${MONTH_WORD}\\b`,
    "\\b\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?\\b",
  ].join("|"),
  "giu",
);
const AVAILABILITY_ASK =
  /disponibilit|vos dispos|availability|available|beschikbaar|quel(le)?s? (jour|date|moment|creneau|créneau)/i;
const SLOT_PLACEHOLDER = "[[À CONFIRMER : créneau]]";

export type MeetingCheck = { body: string; issues: string[]; questions: string[] };
/** Insert `block` before the closing paragraph (greeting/signature) when there is one. */
function insertBeforeClosing(body: string, block: string) {
  const paragraphs = body.split(/\n{2,}/);
  if (paragraphs.length < 2) return `${body}\n\n${block}`;
  const last = paragraphs.pop()!;
  return [...paragraphs, block, last].join("\n\n");
}
/**
 * Deterministic critique of a meeting draft (after guardDraft):
 *  - slots mode: every date/time mention must be inside an offered slot label;
 *    others become [[À CONFIRMER : créneau]]. If no label is present, the
 *    code-built list is inserted. Default hours add a placeholder + question.
 *  - ask mode: no date/time may be proposed; a request for the client's
 *    availabilities is added when missing.
 */
export function validateMeetingDraft(body: string, plan: MeetingPlan): MeetingCheck {
  const issues: string[] = [];
  const questions: string[] = [];
  const labels = plan.mode === "slots" ? plan.slots.map((s) => s.label) : [];
  // Mask offered labels (case-insensitive) so their dates/times are allowed.
  const masks: [number, number][] = [];
  const lower = body.toLowerCase();
  for (const label of labels) {
    let i = lower.indexOf(label.toLowerCase());
    while (i >= 0) {
      masks.push([i, i + label.length]);
      i = lower.indexOf(label.toLowerCase(), i + label.length);
    }
  }
  const inMask = (i: number) => masks.some(([a, b]) => i >= a && i < b);
  const inPlaceholder = (text: string, i: number) => {
    const open = text.lastIndexOf("[[", i);
    return open >= 0 && text.indexOf("]]", open) >= i;
  };
  let out = "";
  let last = 0;
  for (const m of body.matchAll(TIME_MENTION)) {
    if (inMask(m.index) || inPlaceholder(body, m.index)) continue;
    out += body.slice(last, m.index) + SLOT_PLACEHOLDER;
    last = m.index + m[0].length;
    issues.push(plan.mode === "slots" ? "slot_unlisted" : "slot_invented");
  }
  let result = out + body.slice(last);
  if (plan.mode === "slots") {
    const present = labels.filter((l) => result.toLowerCase().includes(l.toLowerCase()));
    if (!present.length) {
      issues.push("slot_missing");
      result = insertBeforeClosing(
        result,
        `Nous pouvons vous proposer les créneaux suivants :\n${labels.map((l) => `- ${l}`).join("\n")}`,
      );
    }
    if (plan.hoursAssumed) {
      issues.push("hours_assumed");
      questions.push(
        `Horaires d’intervention à confirmer (créneaux calculés sur ${DEFAULT_HOURS_LABEL})`,
      );
      result = `[[À CONFIRMER : horaires d’intervention, créneaux calculés sur ${DEFAULT_HOURS_LABEL}]]\n\n${result}`;
    }
  } else if (!AVAILABILITY_ASK.test(fold(result)) && !AVAILABILITY_ASK.test(result)) {
    issues.push("availability_question_added");
    result = insertBeforeClosing(
      result,
      "Pourriez-vous nous indiquer vos disponibilités ?",
    );
  }
  return { body: result.trim(), issues: [...new Set(issues)], questions };
}
