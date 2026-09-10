import { fail, ok } from "@/lib/api/http";
import { getStore, mutateStore } from "@/lib/store/store";
import { createMissionFromPackage } from "@/lib/runtime/engine";
import { nowIso } from "@/lib/time";
import { z } from "zod";
import { id } from "@/lib/ids";

export async function GET() {
  return ok({ items: getStore().missions });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    slug?: string;
  } | null;
  if (!body?.slug) return fail("Package slug required.");
  try {
    const created = createMissionFromPackage(
      body.slug,
      getStore().workspace.tenantId,
    );
    return ok(created, 201);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not create mission",
      400,
    );
  }
}

export async function PATCH(request: Request) {
  const parsed = z
    .object({
      missionId: z.string().min(1),
      instructions: z.string().max(8000).optional(),
      knowledgeSourceIds: z.array(z.string()).max(30).optional(),
      budgetEur: z.number().positive().max(1000).optional(),
      operatingMode: z.literal("test").optional(),
      outcome: z.string().min(1).max(2000).optional(),
      tools: z.array(z.string()).max(20).optional(),
    })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return fail(
      "Invalid configuration. Only test mode is currently available.",
    );
  const body = parsed.data;
  try {
    const updated = mutateStore((state) => {
      const mission = state.missions.find((item) => item.id === body.missionId);
      if (!mission || mission.tenantId !== state.workspace.tenantId)
        throw new Error("Mission not found");
      let version = state.missionVersions.find(
        (item) => item.id === mission.draftVersionId,
      );
      if (!version) throw new Error("Version not found");
      if (version.immutable) {
        version = {
          ...version,
          id: id("mv"),
          version: version.version + 1,
          immutable: false,
          operatingMode: "test",
          createdAt: nowIso(),
        };
        state.missionVersions.unshift(version);
        mission.draftVersionId = version.id;
      }
      if (body.instructions !== undefined)
        version.instructions = body.instructions;
      if (body.knowledgeSourceIds) {
        if (
          body.knowledgeSourceIds.some(
            (id) =>
              !state.sources.some(
                (s) =>
                  s.id === id &&
                  s.tenantId === mission.tenantId &&
                  s.status === "ready",
              ),
          )
        )
          throw new Error("Choose ready sources from this workspace.");
        version.knowledgeSourceIds = body.knowledgeSourceIds;
      }
      if (body.budgetEur !== undefined) version.budgetEur = body.budgetEur;
      if (body.operatingMode) version.operatingMode = body.operatingMode;
      if (body.outcome) version.outcome = body.outcome;
      if (body.tools) version.tools = body.tools;
      mission.updatedAt = nowIso();
      mission.state = "configuring";
      return { mission, version };
    });
    return ok(updated);
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not save configuration",
    );
  }
}
