"use client";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";
import { SourcePicker } from "./SourcePicker";
import s from "./workspace.module.css";
export function KnowledgeSelectionPage({ missionId }: { missionId?: string }) {
  const { data, reload } = useWorkspace<StoreState>();
  return (
    <div className={s.page}>
      <h1>Your knowledge sources</h1>
      {data ? (
        <SourcePicker
          state={data}
          onSaved={reload}
          initialMission={missionId}
        />
      ) : (
        <p role="status">Opening your knowledge…</p>
      )}
    </div>
  );
}
