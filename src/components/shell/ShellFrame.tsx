"use client";

import { AppShell } from "@/components/shell/AppShell";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";
import { dailyWork } from "@/lib/product/work-overview";

/**
 * `full` = frozen surfaces enabled (ORBIS_FROZEN_SURFACES_ENABLED). In the
 * focused V1 workspace the « à relire » badge comes from Today's inbox
 * decisions (event `orbis:decisions`), not from the old mission queue.
 */
export function ShellFrame({ children, full = false }: { children: React.ReactNode; full?: boolean }) {
  const { data } = useWorkspace<StoreState>();
  return (
    <AppShell
      full={full}
      workspaceName={data?.workspace.name ?? "Mon espace"}
      userName={data?.memberships[0]?.name ?? "Vous"}
      decisionCount={full && data ? dailyWork(data).attention.length : undefined}
    >
      {children}
    </AppShell>
  );
}
