/** Server-supplied, workspace-authorized events. Never derive acceptance dates from run creation. */
export type ContributionEvent = {
  id: string;
  tenantId: string;
  kind: "accepted_work" | "approved_memory" | "reviewed_decision";
  occurredAt: string;
  title: string;
  proofHref: string;
  teamId?: string;
};

export function dayKey(value: string | Date, timeZone: string): string | null {
  // Reject ambiguous timestamps: their meaning must not depend on the host TZ.
  if (typeof value === "string" && !/(Z|[+-]\d{2}:\d{2})$/i.test(value))
    return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((key) => parts.find((p) => p.type === key)!.value)
    .join("-");
}

export function safeProof(href: string) {
  return /^\/(?!\/)[^\\\s]*$/.test(href);
}

export function contributionActivity(
  events: readonly ContributionEvent[],
  options: {
    tenantId: string;
    timeZone: string;
    now?: Date;
    days?: number;
    teamId?: string;
  },
) {
  const { tenantId, timeZone, teamId, now = new Date(), days = 91 } = options;
  if (!Number.isInteger(days) || days < 1 || days > 366)
    throw new Error("Invalid activity window");
  const today = dayKey(now, timeZone);
  if (!today) throw new Error("Invalid current date");
  // Iterate calendar days in UTC, never 24-hour intervals in the target timezone (DST).
  const end = Date.parse(`${today}T00:00:00Z`);
  const cells = Array.from({ length: days }, (_, i) => ({
    date: new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
    events: [] as ContributionEvent[],
  }));
  const byDay = new Map(cells.map((cell) => [cell.date, cell]));
  const seen = new Set<string>();
  const accepted = events.filter((event) => {
    if (
      event.tenantId !== tenantId ||
      (teamId && event.teamId !== teamId) ||
      !["accepted_work", "approved_memory", "reviewed_decision"].includes(
        event.kind,
      ) ||
      !safeProof(event.proofHref) ||
      !event.id ||
      seen.has(event.id)
    )
      return false;
    const key = dayKey(event.occurredAt, timeZone);
    if (!key || !byDay.has(key) || Date.parse(event.occurredAt) > now.getTime())
      return false;
    seen.add(event.id);
    byDay.get(key)!.events.push(event);
    return true;
  });
  const teams = new Map<string, number>();
  for (const event of accepted)
    if (event.teamId)
      teams.set(event.teamId, (teams.get(event.teamId) ?? 0) + 1);
  const leaderboard = [...teams]
    .map(([teamId, count]) => ({ teamId, count }))
    .sort((a, b) => b.count - a.count || a.teamId.localeCompare(b.teamId));
  return { cells, events: accepted, leaderboard, today };
}
