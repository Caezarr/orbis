"use client";

import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { getPackage } from "@/lib/capabilities/registry";
import { MaturityBadge } from "@/components/ui/MaturityBadge";
import type { StoreState } from "@/lib/domain/types";

const STATES: Record<string, string> = {
  draft: "Draft",
  configuring: "Configuring",
  testing: "Testing",
  ready: "Ready",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export default function MissionsPage() {
  const { data, loading } = useWorkspace<StoreState>();
  if (loading || !data) return <p className="text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-end justify-between">
        <h1 className="serif text-4xl">Missions</h1>
        <Link href="/discover" className="text-sm text-muted hover:text-ink">
          Install another
        </Link>
      </div>
      <div className="mt-8 divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-surface">
        {data.missions.map((mission) => {
          const pkg = getPackage(mission.packageSlug);
          return (
            <div key={mission.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">{mission.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {STATES[mission.state]} · v{mission.packageVersion} · {pkg?.outcome}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pkg ? <MaturityBadge maturity={pkg.maturity} /> : null}
                <Link href={`/missions/${mission.id}/lab`} className="rounded-[8px] border border-line px-3 py-2 text-sm">
                  Lab
                </Link>
                <Link href={`/missions/${mission.id}/setup`} className="rounded-[8px] bg-ink px-3 py-2 text-sm text-canvas">
                  Setup
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
