"use client";

import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { getCrew } from "@/lib/capabilities/crews";
import type { StoreState } from "@/lib/domain/types";

const DEPARTMENTS = ["Growth", "Sales", "Operations", "Customer Care", "Finance"] as const;

export default function CompanyPage() {
  const { data, loading } = useWorkspace<StoreState>();
  if (loading || !data) return <p className="text-muted">Loading…</p>;

  const byDept = DEPARTMENTS.map((dept) => ({
    dept,
    missions: data.missions.filter((mission) => getCrew(mission.packageSlug).department === dept),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm text-muted">1 human · {data.missions.length} missions · {data.impact?.runsThisWeek ?? 0} runs this week</p>
      <h1 className="serif mt-1 text-4xl">Your company</h1>
      <p className="mt-3 max-w-2xl text-muted">
        You set direction. The shared brain holds facts, instructions and memory. Missions run underneath — never as a swarm of unnamed agents.
      </p>

      <div className="mt-10 flex flex-col items-center gap-4">
        <div className="rounded-[14px] border border-ink bg-ink px-6 py-4 text-canvas">
          You · direction and exceptions
        </div>
        <div className="h-8 w-px bg-line" />
        <Link href="/knowledge" className="rounded-[14px] border border-line bg-surface px-6 py-4 text-center">
          <p className="font-medium">Shared brain</p>
          <p className="mt-1 text-sm text-muted">
            {data.sources.length} sources · {data.instructions.length} instructions · {data.memory.length} memories
          </p>
        </Link>
        <div className="h-8 w-px bg-line" />
        <div className="grid w-full gap-3 md:grid-cols-3 lg:grid-cols-5">
          {byDept.map(({ dept, missions }) => (
            <article key={dept} className="rounded-[14px] border border-line bg-surface p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                {dept}
                {missions.length > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-green pulse-dot" /> : null}
              </p>
              {missions.length === 0 ? (
                <p className="mt-2 text-xs text-muted">Not installed</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {missions.map((mission) => (
                    <li key={mission.id}>
                      <Link href={`/missions/${mission.id}/lab`} className="hover:text-ink">
                        {mission.name} · {mission.state}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
