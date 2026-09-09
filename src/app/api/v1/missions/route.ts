import { fail, ok } from "@/lib/api/http";
import { getStore, mutateStore } from "@/lib/store/store";
import { createMissionFromPackage } from "@/lib/runtime/engine";
import { nowIso } from "@/lib/time";

export async function GET() {
  return ok({ items: getStore().missions });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { slug?: string } | null;
  if (!body?.slug) return fail("Package slug required.");
  try {
    const created = createMissionFromPackage(body.slug, getStore().workspace.tenantId);
    return ok(created, 201);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not create mission", 400);
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    missionId?: string;
    instructions?: string;
    knowledgeSourceIds?: string[];
    budgetEur?: number;
    operatingMode?: "test" | "supervised" | "scoped_autonomy";
    outcome?: string;
    tools?: string[];
  } | null;
  if (!body?.missionId) return fail("missionId required");
  const updated = mutateStore((state) => {
    const mission = state.missions.find((item) => item.id === body.missionId);
    if (!mission) throw new Error("Mission not found");
    const version = state.missionVersions.find((item) => item.id === mission.draftVersionId);
    if (!version) throw new Error("Version not found");
    if (version.immutable) throw new Error("Active versions are immutable. Create a draft.");
    if (body.instructions !== undefined) version.instructions = body.instructions;
    if (body.knowledgeSourceIds) version.knowledgeSourceIds = body.knowledgeSourceIds;
    if (body.budgetEur !== undefined) version.budgetEur = body.budgetEur;
    if (body.operatingMode) version.operatingMode = body.operatingMode;
    if (body.outcome) version.outcome = body.outcome;
    if (body.tools) version.tools = body.tools;
    mission.updatedAt = nowIso();
    return { mission, version };
  });
  return ok(updated);
}
