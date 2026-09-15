import type { MemoryItem, StoreState } from "@/lib/domain/types";
import { accessibleSources } from "./retrieval";

/** Optional metadata stored with memory; legacy items remain readable. */
export type KnowledgeMemory = MemoryItem & {
  version?: string;
  expiresAt?: string;
  validFrom?: string;
  conflictKey?: string;
  sourceRefs?: { sourceId: string; sourceVersion: string }[];
};

export type MemoryContext = {
  state: StoreState;
  sourceIds: readonly string[];
  missionId?: string;
  versionId?: string;
  customerKey?: string;
  runId?: string;
  now?: Date;
};

/** Fail closed on malformed validity dates and stale/deleted/revoked citations.
 * Conflicts mean different bodies under the same explicit key (or title), not
 * semantic contradiction detection. Never silently choose a winner.
 */
export function resolveApprovedMemory(context: MemoryContext) {
  const { state, missionId, customerKey, runId } = context;
  const now = (context.now ?? new Date()).getTime();
  const sources = accessibleSources(context);
  const candidates = (state.memory as KnowledgeMemory[]).filter((item) => {
    if (
      !Number.isFinite(now) ||
      item.tenantId !== state.workspace.tenantId ||
      item.status !== "approved"
    )
      return false;
    if (item.missionId && item.missionId !== missionId) return false;
    if (
      item.scope === "general_rule" &&
      (!item.missionId || item.missionId !== missionId)
    )
      return false;
    if (
      item.scope === "this_customer" &&
      (!customerKey || item.customerKey !== customerKey)
    )
      return false;
    if (item.scope === "this_result" && (!runId || item.runId !== runId))
      return false;
    if (item.validFrom && !(Date.parse(item.validFrom) <= now)) return false;
    if (item.expiresAt && !(Date.parse(item.expiresAt) > now)) return false;
    if (
      item.sourceRefs &&
      (!item.sourceRefs.length ||
        !item.sourceRefs.every((ref) =>
          sources.some(
            (s) => s.id === ref.sourceId && s.version === ref.sourceVersion,
          ),
        ))
    )
      return false;
    return true;
  });
  // A mission must itself be accessible, even for memories without sourceRefs.
  if (
    missionId &&
    !state.missions.some(
      (m) =>
        m.id === missionId &&
        m.tenantId === state.workspace.tenantId &&
        m.state !== "archived",
    )
  )
    return { items: [], conflicts: [] };
  const groups = new Map<string, KnowledgeMemory[]>();
  for (const item of candidates) {
    const key = (item.conflictKey ?? item.title).trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const conflicts = [...groups]
    .filter(([, items]) => new Set(items.map((i) => i.body.trim())).size > 1)
    .map(([key, items]) => ({ key, memoryIds: items.map((i) => i.id) }));
  const blocked = new Set(conflicts.flatMap((c) => c.memoryIds));
  return { items: candidates.filter((i) => !blocked.has(i.id)), conflicts };
}
