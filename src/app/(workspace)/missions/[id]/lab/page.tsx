"use client";
import { use } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import { MissionStudio } from "@/components/missions/MissionStudio";
import type { StoreState } from "@/lib/domain/types";

export default function LabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, loading, reload } = useWorkspace<StoreState>();
  if (loading) return <p role="status">Opening your mission…</p>;
  const mission = data?.missions.find((m) => m.id === id);
  if (!data || !mission)
    return (
      <div>
        Mission unavailable. <Link href="/missions">Back to missions</Link>
      </div>
    );
  return (
    <MissionStudio key={id} data={data} mission={mission} reload={reload} />
  );
}
