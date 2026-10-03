import type { PoolClient } from "pg";
import type { BusyInterval, CalendarClient } from "@/lib/integrations/calendar";
import type { MailboxMode } from "@/lib/integrations/mailbox";
import {
  computeFreeSlots,
  slotSettings,
  type MeetingKind,
  type MeetingPlan,
  type Slot,
  type SupportedTimezone,
  type WorkingHours,
} from "@/lib/calendar/slots";
import type { MeetingPlanner } from "./pipeline";

/**
 * Meeting planner for one batch.
 *  - calendar opt-in off → ask the client for their availabilities;
 *  - test mode → no calendar read, slots from working hours only (simulated);
 *  - otherwise one free/busy read per batch (cached), then code-computed slots.
 * Slots already offered in other open drafts (`held`) and in this batch count
 * as busy, so two customers are never offered the same slot.
 */
export function meetingPlanner(deps: {
  calendarEnabled: boolean;
  mode: MailboxMode;
  timezone: SupportedTimezone;
  hours: WorkingHours;
  /** null = no connected calendar account for this workspace. */
  calendar: (() => Promise<CalendarClient | null>) | null;
  held: BusyInterval[];
  now?: () => Date;
}): MeetingPlanner {
  const held = [...deps.held];
  let busy: Promise<BusyInterval[] | "not_connected"> | null = null;
  const readBusy = (now: Date) => {
    busy ??= (async () => {
      const client = await deps.calendar?.();
      if (!client) return "not_connected" as const;
      return client.freeBusy({
        from: now,
        to: new Date(now.getTime() + 21 * 86_400_000),
      });
    })();
    return busy;
  };
  return {
    async plan(kind: MeetingKind): Promise<MeetingPlan> {
      if (!deps.calendarEnabled)
        return { mode: "ask_availability", kind, reason: "calendar_off" };
      const now = deps.now?.() ?? new Date();
      let calendarBusy: BusyInterval[] = [];
      const simulated = deps.mode === "test";
      if (!simulated) {
        try {
          const result = await readBusy(now);
          if (result === "not_connected")
            return { mode: "ask_availability", kind, reason: "calendar_not_connected" };
          calendarBusy = result;
        } catch {
          return { mode: "ask_availability", kind, reason: "calendar_unavailable" };
        }
      }
      const settings = slotSettings(kind);
      const slots = computeFreeSlots({
        now,
        timezone: deps.timezone,
        hours: deps.hours.weekly,
        busy: [...calendarBusy, ...held],
        ...settings,
      });
      if (!slots.length)
        return { mode: "ask_availability", kind, reason: "no_free_slot" };
      for (const s of slots)
        held.push({ start: Date.parse(s.start), end: Date.parse(s.end) });
      return {
        mode: "slots",
        kind,
        timezone: deps.timezone,
        slots,
        hoursAssumed: deps.hours.assumed,
        simulated,
      };
    },
  };
}

/** Slots offered in still-open drafts of the last 7 days (soft holds). */
export async function heldSlots(
  db: PoolClient,
  ids: { workspaceId: string; tenantId: string },
): Promise<BusyInterval[]> {
  const rows = (
    await db.query<{ proposed_slots: Slot[] | null }>(
      `SELECT proposed_slots FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2
       AND proposed_slots IS NOT NULL AND status='drafted' AND drafted_at > now() - interval '7 days'
       ORDER BY drafted_at DESC LIMIT 100`,
      [ids.workspaceId, ids.tenantId],
    )
  ).rows;
  const out: BusyInterval[] = [];
  for (const r of rows)
    for (const s of Array.isArray(r.proposed_slots) ? r.proposed_slots : []) {
      const start = Date.parse(String(s?.start));
      const end = Date.parse(String(s?.end));
      if (Number.isFinite(start) && Number.isFinite(end) && end > start)
        out.push({ start, end });
    }
  return out;
}
