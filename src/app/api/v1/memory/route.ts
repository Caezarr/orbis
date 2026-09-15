import { z } from "zod";
import { withWorkspaceRequest } from "@/lib/platform/request";
import { workspaceContext } from "@/lib/platform/context";
import { getStore, mutateStore } from "@/lib/store/store";
import { id } from "@/lib/ids";
const schema = z
  .object({
    missionId: z.string().min(1),
    title: z.string().trim().min(2).max(150),
    body: z.string().trim().min(5).max(4000),
    sourceIds: z.array(z.string()).max(20).default([]),
  })
  .strict();
export async function POST(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      const input = schema.safeParse(await request.json().catch(() => null));
      if (!input.success)
        return Response.json(
          { error: "Choose a mission, title and rule." },
          { status: 400 },
        );
      const state = getStore(),
        tenantId = state.workspace.tenantId;
      const mission = state.missions.find(
        (m) => m.id === input.data.missionId && m.tenantId === tenantId,
      );
      if (!mission)
        return Response.json({ error: "Mission not found." }, { status: 404 });
      const version = state.missionVersions.find(
        (v) => v.id === mission.draftVersionId && v.tenantId === tenantId,
      );
      const refs = input.data.sourceIds.map((id) =>
        state.sources.find(
          (s) =>
            s.id === id &&
            s.tenantId === tenantId &&
            s.status === "ready" &&
            version?.knowledgeSourceIds.includes(id),
        ),
      );
      if (refs.some((s) => !s))
        return Response.json(
          { error: "Select ready sources used by this mission." },
          { status: 400 },
        );
      const now = new Date().toISOString();
      const owner = workspaceContext()?.userId ?? "workspace";
      const item = mutateStore((s) => {
        const rule = {
          id: id("mem"),
          tenantId,
          missionId: mission.id,
          kind: "procedural" as const,
          title: input.data.title,
          body: input.data.body,
          scope: "general_rule" as const,
          source: "User correction",
          owner,
          confidence: 1,
          status: "proposed" as const,
          createdAt: now,
          version: id("mv"),
          ...(refs.length
            ? {
                sourceRefs: refs.map((s) => ({
                  sourceId: s!.id,
                  sourceVersion: s!.version,
                })),
              }
            : {}),
          history: [
            {
              at: now,
              actor: owner,
              status: "proposed",
              body: input.data.body,
            },
          ],
        };
        s.memory.unshift(rule);
        return rule;
      });
      return Response.json(item, { status: 201 });
    },
    { requireRole: ["owner", "admin", "operator"] },
  );
}
