/**
 * What the owner is told about the continuous check, computed from what
 * actually happened (last completed incremental batch, next due slot), never
 * from the configured interval alone. The scheduler may run less often than
 * configured (a throttled cron, an outage): the screen must then say so
 * instead of promising "toutes les 15 minutes". Pure and client-safe.
 */
type CadenceInput = {
  continuousEnabled: boolean;
  intervalMinutes: number;
  nextRunAt?: string;
  lastCheckedAt?: string;
  /** Plan blocks continuous drafting: nothing is due, so nothing is "late". */
  paused?: boolean;
};

type Cadence = {
  /** "aujourd’hui à 09:15", "hier à 18:02", "le 21/11 à 07:40"; null when never checked. */
  lastChecked: string | null;
  /** The due check is overdue by more than two intervals (at least 30 minutes). */
  late: boolean;
};

const MIN_LATE_MS = 30 * 60_000;
const TIME_ZONE = "Europe/Paris";

function dayKey(date: Date) {
  return date.toLocaleDateString("fr-FR", { timeZone: TIME_ZONE });
}

export function checkedLabel(iso: string | undefined, now: Date): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const hour = at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE });
  if (dayKey(at) === dayKey(now)) return `aujourd’hui à ${hour}`;
  if (dayKey(at) === dayKey(new Date(now.getTime() - 86_400_000))) return `hier à ${hour}`;
  const day = at.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: TIME_ZONE });
  return `le ${day} à ${hour}`;
}

export function continuousCadence(input: CadenceInput, now = new Date()): Cadence {
  const lastChecked = checkedLabel(input.lastCheckedAt, now);
  if (!input.continuousEnabled || input.paused || !input.nextRunAt) return { lastChecked, late: false };
  const due = new Date(input.nextRunAt).getTime();
  if (Number.isNaN(due)) return { lastChecked, late: false };
  const grace = Math.max(2 * Math.max(input.intervalMinutes, 1) * 60_000, MIN_LATE_MS);
  return { lastChecked, late: now.getTime() - due > grace };
}
