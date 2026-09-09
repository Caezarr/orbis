"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { postJson } from "@/lib/api/client";
import type { StoreState } from "@/lib/domain/types";
import { formatEuro, formatTimeAgo } from "@/lib/time";

export default function TodayPage() {
  const { data, loading, reload } = useWorkspace<StoreState>();
  const [cursor, setCursor] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "j") setCursor((n) => n + 1);
      if (event.key === "k") setCursor((n) => Math.max(0, n - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading || !data) return <p className="text-muted">Loading…</p>;
  const selected = data.decisions[cursor % Math.max(1, data.decisions.length)];
  const impact = data.impact;

  async function decide(actionId: string, decision: "approved" | "rejected") {
    try {
      await postJson(`/api/v1/actions/${actionId}/decisions`, { decision });
      setMsg(decision === "approved" ? "Payload approved. Broker still blocks send in test." : "Rejected. Nothing left the company.");
      await reload();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Decision failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Exceptions only, {data.memberships[0]?.name}. Everything else already ran.</p>
          <h1 className="serif mt-1 text-4xl">Today</h1>
        </div>
        <p className="text-xs text-muted">j / k move · ⌘K ask</p>
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-4">
        <Metric label="Hours given back" value={`${impact?.hoursSaved ?? 0}h`} hint="this week" />
        <Metric label="Accepted-result cost" value={formatEuro(impact?.acceptedResultCostEur ?? 0)} hint="inference + fee" />
        <Metric label="Second capability" value={`${impact?.secondCapabilityMinutes ?? 0} min`} hint="reused company context" />
        <Metric label="Correction rate" value={`${Math.round((impact?.correctionRate ?? 0) * 100)}%`} hint="going down is the point" />
      </div>

      {(data.signals ?? []).length > 0 ? (
        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Why these exist</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {data.signals.map((signal) => (
              <li key={signal.id} className="rounded-[14px] border border-line bg-surface p-4">
                <p className="text-xs text-muted">{signal.evidence}</p>
                <p className="mt-2 text-sm font-medium">{signal.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{signal.whyNow}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Needs attention · {data.decisions.length}</h2>
        <div className="mt-3 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
          {data.decisions.map((decision, index) => {
            const approval = data.approvals.find((item) => item.id === decision.approvalId);
            const action = data.actions.find((item) => item.id === approval?.actionId);
            const active = selected?.id === decision.id;
            return (
              <div
                key={decision.id}
                className={`flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between ${active ? "bg-blue-soft/40" : ""}`}
              >
                <div>
                  <p className="font-medium">{decision.title}</p>
                  <p className="mt-1 text-sm text-muted">{decision.reason}</p>
                  {decision.whyNow ? <p className="mt-2 text-sm text-ink">Why now · {decision.whyNow}</p> : null}
                  <p className="mt-1 text-xs text-muted">
                    {decision.source} · {formatEuro(decision.estimatedCostEur)} · {formatTimeAgo(decision.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/missions/${decision.missionId}/lab`} className="rounded-[8px] border border-line px-3 py-2 text-sm">
                    Inspect
                  </Link>
                  {action ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void decide(action.id, "rejected")}
                        className="rounded-[8px] border border-line px-3 py-2 text-sm"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => void decide(action.id, "approved")}
                        className="rounded-[8px] bg-ink px-3 py-2 text-sm text-canvas"
                      >
                        Approve payload
                      </button>
                    </>
                  ) : (
                    <Link href={`/missions/${decision.missionId}/lab`} className="rounded-[8px] bg-ink px-3 py-2 text-sm text-canvas">
                      Review
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {msg ? <p className="mt-3 text-sm text-muted">{msg}</p> : null}
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Copilot · next moves</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-3">
          {(data.copilot ?? []).map((item) => (
            <li key={item.id}>
              <Link href={`/missions/${item.missionId}/lab`} className="block rounded-[14px] border border-line bg-surface p-4">
                <p className="text-xs text-muted">{item.when}</p>
                <p className="mt-2 text-sm font-medium">{item.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="rounded-[14px] border border-line bg-surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </article>
  );
}
