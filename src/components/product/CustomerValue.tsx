"use client";
import { useEffect, useState } from "react";
import { businessWorkflows } from "@/lib/workflows/blueprints";
import s from "./workspace.module.css";
type Row = {
  workflow_id: string;
  tasks: number;
  accepted: number;
  failed: number;
  awaiting_review: number;
  execution_ms: number | null;
  delivery_ms: number | null;
  review_wait_ms: number | null;
  active_ms: number;
  measured_outcomes: number;
  estimated_saved_ms: number | null;
  accepted_value_cents: number;
};
const minutes = (ms: number | null) =>
  ms === null ? "—" : `${Math.round(ms / 6000) / 10} min`;
export function CustomerValue() {
  const [data, setData] = useState<{
      available: boolean;
      workflows: Row[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/analytics/value", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load task measurements.");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className={s.section} aria-label="Customer value">
      <h2>What Orbi gives back to your day</h2>
      <p>Last 30 days. Recorded task outcomes and time spent reviewing them.</p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Loading measurements…</p>}
      {data && !data.workflows.length && (
        <p>
          Your first accepted task will start this view. Add your usual manual
          duration when you queue it to estimate time saved.
        </p>
      )}
      {data?.workflows.map((row) => (
        <article key={row.workflow_id} className={s.source}>
          <h3>
            {businessWorkflows.find((w) => w.id === row.workflow_id)?.name ??
              row.workflow_id}
          </h3>
          <p>
            {row.accepted} accepted · {row.awaiting_review} waiting for you ·{" "}
            {row.failed} failed / {row.tasks} tasks
          </p>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              gap: 20,
            }}
          >
            {[
              ["Average processing", minutes(row.execution_ms)],
              ["Average time to result", minutes(row.delivery_ms)],
              ["Average wait for approval", minutes(row.review_wait_ms)],
              ["Active review time", minutes(row.active_ms)],
              ["Estimated time saved", minutes(row.estimated_saved_ms)],
              [
                "Accepted task value",
                new Intl.NumberFormat("en", {
                  style: "currency",
                  currency: "EUR",
                }).format(row.accepted_value_cents / 100),
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd style={{ margin: 0, fontSize: 22, color: "#192f60" }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p>
            <small>
              Time saved uses your manual estimate minus recorded active review
              time, across {row.measured_outcomes} accepted results. It excludes
              work outside Orbis. Task value is the accepted quote, not a
              payment confirmation.
            </small>
          </p>
        </article>
      ))}
    </section>
  );
}
