"use client";

import { use } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { ProtocolStrip } from "@/components/cards/ProtocolStrip";
import { TracePlayback } from "@/components/cards/TracePlayback";
import { getCrew } from "@/lib/capabilities/crews";
import type { StoreState } from "@/lib/domain/types";

export default function RunTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading } = useWorkspace<StoreState>();
  const run = data?.runs.find((item) => item.id === id);
  const mission = data?.missions.find((item) => item.id === run?.missionId);
  const artifact = data?.artifacts.find((item) => item.id === run?.artifactIds[0]);
  const evaluation = data?.evaluations.find((item) => item.id === run?.evaluationId);

  if (loading || !data) return <p className="text-muted">Loading…</p>;
  if (!run || !mission) return <p>Unknown run.</p>;

  const crew = getCrew(mission.packageSlug);
  const tokens = run.steps.reduce((sum, step) => sum + (step.tokens ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted">
        <Link href={`/missions/${mission.id}/lab`}>Lab</Link> / trace {run.traceId}
      </p>
      <h1 className="serif mt-2 text-4xl">Run {run.state}</h1>
      <p className="mt-2 text-muted">
        {crew.process} process · {crew.department} · {tokens} tokens · mode {run.mode}
      </p>

      <div className="mt-8">
        <ProtocolStrip slug={mission.packageSlug} />
      </div>

      <section className="mt-8 rounded-[14px] border border-line bg-surface p-5">
        <h2 className="text-xs uppercase tracking-[0.14em] text-muted">AMP-style timeline</h2>
        <p className="mt-2 text-sm text-muted">
          Roles, tokens, duration, tool I/O. Policy is a step, not a footnote. Secrets never appear here.
        </p>
        <div className="mt-5">
          <TracePlayback steps={run.steps} model={run.model} cost={run.cost} autoPlay />
        </div>
      </section>

      {artifact ? (
        <section className="mt-6 rounded-[14px] border border-line bg-surface p-5">
          <h2 className="text-xs uppercase tracking-[0.14em] text-muted">Artifact</h2>
          <p className="mt-2 font-medium">{artifact.title}</p>
          <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{artifact.body}</pre>
        </section>
      ) : null}

      {evaluation ? (
        <section className="mt-6 rounded-[14px] border border-line bg-surface p-5">
          <h2 className="text-xs uppercase tracking-[0.14em] text-muted">Gate {evaluation.gatePassed ? "passed" : "blocked"}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {evaluation.checks.map((check) => (
              <li key={check.id}>
                <span className={check.status === "pass" ? "text-green" : check.status === "warn" ? "text-amber" : "text-red"}>
                  {check.status} · {check.label}
                </span>
                <p className="text-muted">{check.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
