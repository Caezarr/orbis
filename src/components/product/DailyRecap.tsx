import Link from "next/link";
import type { StoreState } from "@/lib/domain/types";
import {
  dailyWork,
  dailyOperations,
  type OperationalTask,
} from "@/lib/product/work-overview";
import { Orbi } from "./Orbi";
import {
  contributionActivity,
  type ContributionEvent,
} from "@/lib/product/contributions";
import s from "./workspace.module.css";

export function DailyRecap({
  data,
  now,
  timeZone,
  tasks = [],
  events = [],
}: {
  data: StoreState;
  now: Date;
  timeZone: string;
  tasks?: OperationalTask[];
  events?: ContributionEvent[];
}) {
  const work = dailyWork(data, now, timeZone);
  const operations = dailyOperations(tasks, now, timeZone);
  const doneCount = work.done.length + operations.done.length;
  const contributions = contributionActivity(events, {
    tenantId: data.workspace.tenantId,
    now,
    timeZone,
    days: 1,
  });
  return (
    <section className={s.section} aria-label="Daily recap">
      <div className="flex items-center gap-4">
        <Orbi mood={doneCount ? "done" : "welcome"} size={64} />
        <div>
          <h2>Today’s recap</h2>
          <p>
            {new Intl.DateTimeFormat("en-GB", {
              timeZone,
              dateStyle: "long",
            }).format(now)}{" "}
            · {timeZone}
          </p>
        </div>
      </div>
      <p>
        {doneCount} results ready ·{" "}
        {work.attention.length + operations.attention.length} need you ·{" "}
        {work.remaining.length + operations.remaining.length} upcoming or in
        progress.
      </p>
      {operations.done.map((task) => (
        <div className={s.row} key={task.id}>
          <div>
            <strong>{task.title}</strong>
            <p>{task.output?.title ?? "Completed task"}</p>
          </div>
          <Link href={`/tasks/${encodeURIComponent(task.id)}`}>
            View result & evidence ↗
          </Link>
        </div>
      ))}
      {work.done.map((run) => (
        <div className={s.row} key={run.id}>
          <div>
            <strong>
              {data.missions.find((m) => m.id === run.missionId)?.name ??
                "Completed work"}
            </strong>
            <p>
              {data.evaluations.find((e) => e.id === run.evaluationId)
                ?.humanFeedback?.accepted
                ? "Accepted result"
                : "Ready for your review"}
            </p>
            {data.artifacts
              .filter((a) => a.runId === run.id)
              .map((a) => (
                <p key={a.id}>
                  {a.title} · {a.citations.length} source references
                </p>
              ))}
          </div>
          <Link
            href={`/missions/${encodeURIComponent(run.missionId)}/lab?run=${encodeURIComponent(run.id)}`}
          >
            View result & evidence ↗
          </Link>
        </div>
      ))}
      {!doneCount && (
        <p>
          No completed results recorded today. Your first result will appear
          here with its evidence.
        </p>
      )}
      {contributions.events.length > 0 && (
        <div>
          <h3 className="mt-4">Validated contributions today</h3>
          {contributions.events.map((event) => (
            <div className={s.row} key={event.id}>
              <span>
                {event.title} · {event.kind.replaceAll("_", " ")}
              </span>
              <Link href={event.proofHref}>View proof ↗</Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
