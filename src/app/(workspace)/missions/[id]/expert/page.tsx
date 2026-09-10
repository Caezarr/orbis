"use client";

import { use } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { ProtocolStrip } from "@/components/cards/ProtocolStrip";
import { getPackage } from "@/lib/capabilities/registry";
import { getCrew } from "@/lib/capabilities/crews";
import type { StoreState } from "@/lib/domain/types";

export default function ExpertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useWorkspace<StoreState>();
  const mission = data?.missions.find((item) => item.id === id);
  const version = data?.missionVersions.find((item) => item.id === mission?.draftVersionId);
  const pkg = mission ? getPackage(mission.packageSlug) : undefined;
  const crew = mission ? getCrew(mission.packageSlug) : undefined;
  const runs = data?.runs.filter((item) => item.missionId === id) ?? [];

  if (!data || !mission || !version || !pkg || !crew) return <p className="text-muted">Loading…</p>;

  const harness = `{
  "kind": "crew",
  "process": "${crew.process}",
  "department": "${crew.department}",
  "why_now": "${crew.whyNow}",
  "agents": [
${crew.roles
  .map(
    (role) => `    {
      "role": "${role.role}",
      "goal": "${role.goal}",
      "cannot": [${role.cannot.map((item) => `"${item}"`).join(", ")}]
    }`,
  )
  .join(",\n")}
  ],
  "tools": [${version.tools.map((item) => `"${item}"`).join(", ")}],
  "must": ["cite_sources", "expose_assumptions", "no_invented_prices"],
  "escalate": ["missing_price", "legal_uncertainty"],
  "budget": { "max_eur": ${version.budgetEur}, "mode": "${version.operatingMode}" },
  "evaluators": [${pkg.evaluations.map((item) => `"${item}"`).join(", ")}],
  "version": "${pkg.version}",
  "mission_version": ${version.version},
  "immutable": ${version.immutable}
}`;

  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm text-muted">
        <Link href={`/missions/${id}/setup`}>Mission setup</Link> / Expert
      </p>
      <h1 className="serif mt-2 text-4xl">{pkg.name} harness</h1>
      <p className="mt-2 text-sm text-muted">
        CrewAI-shaped spec. This is a protocol, not a studio. Active behavior does not change until a new version is tested and approved.
      </p>

      <div className="mt-8">
        <ProtocolStrip slug={pkg.slug} />
      </div>

      <pre className="mt-8 overflow-auto rounded-[14px] border border-line bg-surface p-5 text-xs leading-6">{harness}</pre>

      <section className="mt-6 rounded-[14px] border border-line bg-surface p-5">
        <h2 className="font-medium">Run history</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {runs.map((run) => (
            <li key={run.id}>
              <Link href={`/runs/${run.id}`} className="hover:underline">
                {run.state} · {run.mode} · {run.engine === "agent-v1" ? "Provider cost unknown" : `${run.cost.provider.toFixed(2)}€ example`} · {run.traceId}
              </Link>
            </li>
          ))}
          {runs.length === 0 ? <li className="text-muted">No runs yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
