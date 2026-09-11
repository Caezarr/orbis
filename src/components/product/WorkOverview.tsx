"use client";
import { useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState, Run } from "@/lib/domain/types";
import { dailyWork, needsAttention } from "@/lib/product/work-overview";
import s from "./workspace.module.css";

export function WorkOverview({ analytics = false }: { analytics?: boolean }) {
  const { data, loading } = useWorkspace<StoreState>();
  const [filter, setFilter] = useState("attention");
  if (loading || !data) return <p role="status">Loading your work…</p>;
  const work = dailyWork(data);
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
            ["remaining", "In progress"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}{" "}
              <span className="ml-2">
                {id === "attention"
                  ? work.attention.length
                  : id === "done"
                    ? work.done.length
                    : work.remaining.length}
              </span>
            </button>
          ))}
        </nav>
      )}
      {shown.length ? (
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
          {shown.slice().map((r) => (
            <div className={s.row} key={r.id}>
              <div>
                <strong>
                  {data.missions.find((m) => m.id === r.missionId)?.name ??
                    "Mission"}
                </strong>
                <p>
                  {labels[r.state] ?? r.state} ·{" "}
                  {new Date(r.createdAt).toLocaleString()}
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
          <h2>
            {analytics
              ? "Your results start here."
              : filter === "attention"
                ? "Nothing needs your attention."
                : filter === "done"
                  ? "No completed tasks today yet."
                  : "No tasks in progress."}
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
