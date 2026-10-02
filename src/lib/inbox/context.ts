import type { StoreState } from "@/lib/domain/types";
import { resolveApprovedMemory, retrieveKnowledge } from "@/lib/knowledge";
import type { ReplySource } from "@/lib/runtime/inbox-replies";

/**
 * Trusted reply sources for one workspace: confirmed website profile, approved
 * workspace rules/memory and imported (ready, non-fixture) knowledge. State must
 * come from the authenticated workspace snapshot loaded by the worker.
 * `facts` = owner-approved company sheet facts (src/lib/brain factSources()):
 * only approved, unexpired facts are ever passed here.
 */
export function replyContext(state: StoreState, facts: ReplySource[] = []) {
  const tenantId = state.workspace.tenantId;
  const knowledgeIds = state.sources
    .filter(
      (s) =>
        s.tenantId === tenantId && s.status === "ready" && s.kind !== "fixture",
    )
    .map((s) => s.id);
  const fixed: ReplySource[] = [];
  const profile = state.profile;
  if (profile && profile.tenantId === tenantId) {
    const claims = profile.claims
      .map((c) => `${c.label}: ${c.value}`)
      .join("\n");
    fixed.push({
      id: "profile",
      kind: "profile",
      name: profile.website
        ? `Website profile (${profile.website})`
        : "Company profile",
      content: [profile.summary, claims]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000),
    });
  }
  for (const item of resolveApprovedMemory({ state, sourceIds: knowledgeIds })
    .items)
    fixed.push({
      id: `memory:${item.id}`,
      kind: "memory",
      name: item.title,
      content: item.body.slice(0, 1500),
    });
  for (const rule of state.instructions.filter(
    (i) =>
      i.tenantId === tenantId &&
      i.scope === "workspace" &&
      i.status === "approved",
  ))
    fixed.push({
      id: `rule:${rule.id}`,
      kind: "instruction",
      name: rule.title,
      content: rule.body.slice(0, 1500),
    });
  return {
    company: { name: profile?.name, summary: profile?.summary },
    sourcesFor(query: string): ReplySource[] {
      const knowledge = retrieveKnowledge({
        state,
        query,
        sourceIds: knowledgeIds,
        limit: 5,
      }).map((e) => ({
        id: e.sourceId,
        kind: "knowledge" as const,
        name: e.sourceName,
        content: e.excerpt,
      }));
      return [...fixed.slice(0, 12), ...facts.slice(0, 20), ...knowledge];
    },
  };
}
export type ReplyContext = ReturnType<typeof replyContext>;
