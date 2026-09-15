"use client";
import { useState } from "react";
import Link from "next/link";
import {
  contributionActivity,
  type ContributionEvent,
} from "@/lib/product/contributions";
import s from "./workspace.module.css";

export function ContributionActivity({
  events,
  tenantId,
  teams = [],
  timeZone,
  now,
}: {
  events: readonly ContributionEvent[];
  tenantId: string;
  teams?: { id: string; name: string }[];
  timeZone: string;
  now: Date;
}) {
  const [teamId, setTeamId] = useState("");
  const [ranking, setRanking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const activity = contributionActivity(events, {
    tenantId,
    timeZone,
    now,
    teamId,
  });
  const company = contributionActivity(events, { tenantId, timeZone, now });
  const selectedCell = activity.cells.find((cell) => cell.date === selected);
  const colors = ["#edf1f7", "#c4d7f4", "#89addd", "#5282ce", "#274e8f"];
  const offset =
    (new Date(`${activity.cells[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <section className={s.section}>
      <h2>Shared contributions</h2>
      <p>
        {activity.events.length} recorded contributions over 91 days ·{" "}
        {timeZone}. Accepted work, approved memory and reviewed decisions.
      </p>
      <label className="my-4">
        Scope
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Company</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="overflow-x-auto py-3" aria-label="Contribution calendar">
        <div
          style={{
            display: "grid",
            gridTemplateRows: "repeat(7, 20px)",
            gridAutoFlow: "column",
            gridAutoColumns: "20px",
            gap: 5,
            width: "max-content",
          }}
        >
          {Array.from({ length: offset }, (_, i) => (
            <span key={`pad-${i}`} aria-hidden="true" />
          ))}
          {activity.cells.map((cell) => (
            <button
              key={cell.date}
              onClick={() => setSelected(cell.date)}
              aria-pressed={selected === cell.date}
              aria-label={`${cell.date}: ${cell.events.length} contributions`}
              title={`${cell.date}: ${cell.events.length} contributions`}
              style={{
                borderRadius: 4,
                background: colors[Math.min(4, cell.events.length)],
                outline:
                  selected === cell.date ? "2px solid #182d5b" : undefined,
              }}
            />
          ))}
        </div>
      </div>
      <p className="flex items-center gap-2 text-sm">
        Less{" "}
        {colors.map((color) => (
          <span
            key={color}
            aria-hidden="true"
            style={{
              background: color,
              width: 14,
              height: 14,
              borderRadius: 3,
            }}
          />
        ))}{" "}
        More · Select a day for proof.
      </p>
      {!activity.events.length && (
        <p>
          No dated contributions recorded yet. Existing reviews without a
          recorded review date are not placed on the calendar.
        </p>
      )}
      {selectedCell && (
        <div aria-live="polite">
          <h3 className="mt-4">{selectedCell.date}</h3>
          {selectedCell.events.length ? (
            selectedCell.events.map((event) => (
              <div className={s.row} key={event.id}>
                <span>
                  {event.title} · {event.kind.replaceAll("_", " ")}
                </span>
                <Link href={event.proofHref}>View proof ↗</Link>
              </div>
            ))
          ) : (
            <p>No recorded contributions this day.</p>
          )}
        </div>
      )}
      <button
        className={`${s.secondary} mt-5`}
        aria-pressed={ranking}
        onClick={() => setRanking(!ranking)}
      >
        {ranking ? "Hide private team ranking" : "Show private team ranking"}
      </button>
      <p>
        Optional, visible only in this view. Team collaboration counts, with no
        individual scores or productivity targets.
      </p>
      {ranking && (
        <div>
          <h3>Team contributions · last 91 days</h3>
          {company.leaderboard.length ? (
            <ol>
              {company.leaderboard.map((t) => (
                <li className={s.row} key={t.teamId}>
                  <span>
                    {teams.find((team) => team.id === t.teamId)?.name ??
                      "Unlisted team"}
                  </span>
                  <span>{t.count} contributions</span>
                </li>
              ))}
            </ol>
          ) : (
            <p>No team-attributed contributions yet.</p>
          )}
          <p>
            Counts reflect recorded events and team size, not team performance.
          </p>
        </div>
      )}
    </section>
  );
}
