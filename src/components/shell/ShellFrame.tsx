"use client";

import { AppShell } from "@/components/shell/AppShell";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";

export function ShellFrame({ children }: { children: React.ReactNode }) {
  const { data } = useWorkspace<StoreState>();
  return (
    <AppShell
      workspaceName={data?.workspace.name ?? "Workspace"}
      userName={data?.memberships[0]?.name ?? "You"}
      decisionCount={
        data?.runs.filter(
          (r) => r.engine === "agent-v1" && r.state === "waiting_input",
        ).length ?? 0
      }
    >
      {children}
    </AppShell>
  );
}
