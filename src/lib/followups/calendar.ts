/*
 * French business calendar (Europe/Paris). Pure, dependency-free.
 * Business day = Monday–Friday in Paris local time, excluding French
 * metropolitan public holidays (jours fériés). Used for "no customer reply
 * after N business days" (follow-ups) and the weekly report window.
 */
export const PARIS = "Europe/Paris";
export type LocalDate = { y: number; m: number; d: number };

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PARIS,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function parisParts(at: Date) {
  const p = Object.fromEntries(
    partsFormatter.formatToParts(at).map((x) => [x.type, x.value]),
  );
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    min: Number(p.minute),
    s: Number(p.second),
  };
}
/** Paris calendar date of an instant. */
export function parisDate(at: Date): LocalDate {
  const { y, m, d } = parisParts(at);
  return { y, m, d };
}
/** Instant of 00:00 Paris time on a local date (DST-safe). */
export function parisMidnight(date: LocalDate): Date {
  const guess = Date.UTC(date.y, date.m - 1, date.d);
  // Offset of Paris at that moment (UTC+1 or UTC+2), applied twice for DST edges.
  let instant = guess;
  for (let i = 0; i < 2; i++) {
    const p = parisParts(new Date(instant));
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    instant = guess - (asUtc - instant);
  }
  return new Date(instant);
}
const toUtcDay = (d: LocalDate) => Date.UTC(d.y, d.m - 1, d.d);
const fromUtcDay = (ms: number): LocalDate => {
  const x = new Date(ms);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
};
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcDay(toUtcDay(date) + days * 86_400_000);
}
export const sameDate = (a: LocalDate, b: LocalDate) =>
  a.y === b.y && a.m === b.m && a.d === b.d;
export const compareDates = (a: LocalDate, b: LocalDate) =>
  toUtcDay(a) - toUtcDay(b);
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (date: LocalDate) => new Date(toUtcDay(date)).getUTCDay();

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easter(year: number): LocalDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y: year, m: month, d: day };
}
const holidayCache = new Map<number, Set<number>>();
/** French metropolitan public holidays (11 days; Alsace-Moselle extras excluded). */
export function frenchHolidays(year: number): Set<number> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const e = easter(year);
  const days: LocalDate[] = [
    { y: year, m: 1, d: 1 }, // Jour de l'an
    addDays(e, 1), // Lundi de Pâques
    { y: year, m: 5, d: 1 }, // Fête du travail
    { y: year, m: 5, d: 8 }, // Victoire 1945
    addDays(e, 39), // Ascension
    addDays(e, 50), // Lundi de Pentecôte
    { y: year, m: 7, d: 14 }, // Fête nationale
    { y: year, m: 8, d: 15 }, // Assomption
    { y: year, m: 11, d: 1 }, // Toussaint
    { y: year, m: 11, d: 11 }, // Armistice
    { y: year, m: 12, d: 25 }, // Noël
  ];
  const set = new Set(days.map(toUtcDay));
  holidayCache.set(year, set);
  return set;
}
export function isBusinessDay(date: LocalDate) {
  const w = weekday(date);
  return w !== 0 && w !== 6 && !frenchHolidays(date.y).has(toUtcDay(date));
}
/** The Nth business day strictly after `date` (N ≥ 1). */
export function addBusinessDays(date: LocalDate, n: number): LocalDate {
  let current = date;
  let left = Math.max(1, Math.floor(n));
  while (left > 0) {
    current = addDays(current, 1);
    if (isBusinessDay(current)) left--;
  }
  return current;
}
/**
 * When a follow-up becomes due: 00:00 Paris on the Nth business day after the
 * Paris date of the owner's message. Sent Friday, N=5 → due next Friday 00:00.
 */
export function followupDueAt(ownerMessageAt: Date, businessDays: number): Date {
  return parisMidnight(addBusinessDays(parisDate(ownerMessageAt), businessDays));
}
/** Business days fully elapsed between two instants (Paris dates, start excluded). */
export function businessDaysBetween(from: Date, to: Date) {
  let current = parisDate(from);
  const end = parisDate(to);
  let n = 0;
  while (compareDates(current, end) < 0 && n < 400) {
    current = addDays(current, 1);
    if (isBusinessDay(current)) n++;
  }
  return n;
}
/** ISO week (Monday 00:00 Paris → next Monday 00:00 Paris) containing `at`. */
export function parisWeek(at: Date) {
  const today = parisDate(at);
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  return { start: parisMidnight(monday), end: parisMidnight(addDays(monday, 7)), monday };
}
export const formatLocalDate = (d: LocalDate) =>
  `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
export function parseLocalDate(text: string): LocalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const date = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const back = fromUtcDay(toUtcDay(date));
  return sameDate(back, date) ? date : null;
}
