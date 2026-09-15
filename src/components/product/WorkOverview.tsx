"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState, Run } from "@/lib/domain/types";
import {
  dailyWork,
  dailyOperations,
  needsAttention,
  type OperationalTask,
} from "@/lib/product/work-overview";
import s from "./workspace.module.css";
import { DailyRecap } from "./DailyRecap";
import { ContributionActivity } from "./ContributionActivity";
import type { ContributionEvent } from "@/lib/product/contributions";
import { Orbi } from "./Orbi";

export function WorkOverview({ analytics = false }: { analytics?: boolean }) {
  const { data, loading } = useWorkspace<
    StoreState & { contributionEvents?: ContributionEvent[] }
  >();
  const [filter, setFilter] = useState("attention");
  const [now, setNow] = useState(() => new Date());
  const [timeZone, setTimeZone] = useState("UTC");
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [operationEvents, setOperationEvents] = useState<ContributionEvent[]>(
    [],
  );
  const [operationsError, setOperationsError] = useState("");
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/v1/operations", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Operations unavailable");
        const payload = await response.json();
        if (!Array.isArray(payload.tasks))
          throw new Error("Invalid operations response");
        if (active) {
          setTasks(payload.tasks);
          setOperationEvents(
            Array.isArray(payload.contributionEvents)
              ? payload.contributionEvents
              : [],
          );
          setOperationsError("");
        }
      } catch {
        if (active)
          setOperationsError(
            "Could not refresh operational tasks. Displayed tasks may be out of date.",
          );
      } finally {
        pending = false;
        if (active) setOperationsLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [retry]);
  useEffect(() => {
    const tick = () => {
      setNow(new Date());
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    };
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  if (loading || !data) return <p role="status">Loading your work…</p>;
  const work = dailyWork(data, now, timeZone);
  const contributionEvents = [
    ...(data.contributionEvents ?? []),
    ...operationEvents,
  ];
  const operations = dailyOperations(tasks, now, timeZone);
  const shownTasks = analytics
    ? operations.tasks
    : filter === "attention"
      ? operations.attention
      : filter === "done"
        ? operations.done
        : operations.remaining;
  const runs = work.runs;
  const attention = (r: Run) => needsAttention(r, data.evaluations);
  const completed = runs.filter((r) => r.state === "succeeded");
  const failed = runs.filter((r) => r.state === "failed");
  const shown = analytics
    ? runs
    : filter === "attention"
      ? work.attention
      : filter === "done"
        ? work.done
        : work.remaining;
  const labels: Record<string, string> = {
    succeeded: "Result ready",
    failed: "Needs a retry",
    waiting_input: "Needs your input",
    waiting_approval: "Needs your approval",
    queued: "Queued",
    running: "In progress",
    cancelled: "Cancelled",
    needs_reconciliation: "Needs checking",
  };
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <h1>
            {analytics
              ? "What’s working. What needs attention."
              : "Your day, in one place."}
          </h1>
          <p>
            {analytics
              ? "Results and quality across your recorded executions."
              : "See what’s done, what’s next, and where your agents need you."}
          </p>
        </div>
        <Link className={s.primary} href="/chat">
          New conversation
        </Link>
      </header>
      {operationsLoading && <p role="status">Loading operational tasks…</p>}
      {operationsError && (
        <p role="alert">
          {operationsError}{" "}
          <button
            className={s.secondary}
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry
          </button>
        </p>
      )}
      <DailyRecap
        data={data}
        tasks={tasks}
        events={contributionEvents}
        now={now}
        timeZone={timeZone}
      />
      {analytics && (
        <ContributionActivity
          events={contributionEvents}
          tenantId={data.workspace.tenantId}
          teams={data.teamGroups}
          now={now}
          timeZone={timeZone}
        />
      )}
      {analytics ? (
        <>
          <div className={s.stats}>
            <div className={s.stat}>
              <span>Completed executions</span>
              <strong>{completed.length}</strong>
            </div>
            <div className={s.stat}>
              <span>Failed executions</span>
              <strong>{failed.length}</strong>
            </div>
            <div className={s.stat}>
              <span>Accepted results</span>
              <strong>
                {
                  runs.filter(
                    (r) =>
                      data.evaluations.find((e) => e.id === r.evaluationId)
                        ?.humanFeedback?.accepted,
                  ).length
                }
              </strong>
            </div>
          </div>
          <section className={s.section}>
            <h2>Execution completion</h2>
            <p>
              {completed.length + failed.length
                ? `${Math.round((completed.length / (completed.length + failed.length)) * 100)}% of finished executions completed successfully.`
                : "Your first executions will appear here."}{" "}
              Completion measures execution, not the quality of the business
              outcome.
            </p>
            <div className={s.bar}>
              <span
                style={{
                  width: `${completed.length + failed.length ? (completed.length / (completed.length + failed.length)) * 100 : 0}%`,
                }}
              />
            </div>
          </section>
        </>
      ) : (
        <nav className={s.tabs} aria-label="Filter tasks">
          {[
            ["attention", "Needs you"],
            ["done", "Done today"],
            ["remaining", "Upcoming"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}{" "}
              <span className="ml-2">
                {id === "attention"
                  ? work.attention.length + operations.attention.length
                  : id === "done"
                    ? work.done.length + operations.done.length
                    : work.remaining.length + operations.remaining.length}
              </span>
            </button>
          ))}
        </nav>
      )}
      {shown.length || shownTasks.length ? (
        <section className={s.section}>
          <h2>
            {analytics
              ? "Execution history"
              : filter === "attention"
                ? "Your decisions"
                : filter === "done"
                  ? "Completed today"
                  : "Work in progress"}
          </h2>
          {shownTasks.map((task) => (
            <div className={s.row} key={`task-${task.id}`}>
              <div>
                <strong>{task.title}</strong>
                <p>
                  {task.status.replaceAll("_", " ")} ·{" "}
                  {new Date(task.createdAt).toLocaleString("en-GB", {
                    timeZone,
                  })}
                </p>
                {task.output && <p>{task.output.title}</p>}
                {task.error && <p>{task.error}</p>}
              </div>
              <Link href={`/tasks/${encodeURIComponent(task.id)}`}>
                {["needs_review", "failed"].includes(task.status)
                  ? "Review task"
                  : "Open task"}{" "}
                ↗
              </Link>
            </div>
          ))}
          {shown.slice().map((r) => (
            <div className={s.row} key={r.id}>
              <div>
                <strong>
                  {data.missions.find((m) => m.id === r.missionId)?.name ??
                    "Mission"}
                </strong>
                <p>
                  {labels[r.state] ?? r.state} ·{" "}
                  {new Date(r.createdAt).toLocaleString("en-GB", { timeZone })}
                </p>
                {r.error && <p>{r.error}</p>}
                {data.approvals
                  .filter((a) => a.runId === r.id && a.status === "pending")
                  .map((a) => (
                    <p key={a.id}>
                      Approval requested: {a.preview} — {a.consequence}
                    </p>
                  ))}
              </div>
              <Link href={`/missions/${r.missionId}/lab?run=${r.id}`}>
                {attention(r) ? "Review task" : "View result"} ↗
              </Link>
            </div>
          ))}
        </section>
      ) : (
        <div className={s.empty}>
          <Orbi
            mood={runs.length && filter === "attention" ? "done" : "welcome"}
            size={80}
          />
          <h2>
            {analytics
              ? "Your results start here."
              : filter === "attention"
                ? "Nothing needs your attention."
                : filter === "done"
                  ? "No completed tasks today yet."
                  : "No upcoming tasks recorded."}
          </h2>
          <p>Start a conversation or choose a mission from the marketplace.</p>
          <Link className={s.secondary} href="/chat">
            Describe what you need
          </Link>
        </div>
      )}
      {!analytics && (
        <section className={s.section}>
          <h2>Your missions</h2>
          {data.missions
            .filter((m) => m.flowId)
            .map((m) => (
              <div className={s.row} key={m.id}>
                <div>
                  <strong>{m.name}</strong>
                  <p>
                    {m.state === "configuring"
                      ? "Finish setup to get started"
                      : m.state}
                  </p>
                </div>
                <Link href={`/missions/${m.id}/lab`}>Open mission ↗</Link>
              </div>
            ))}
          <Link className={s.secondary} href="/catalog">
            Add a mission
          </Link>
        </section>
      )}
    </div>
  );
}
