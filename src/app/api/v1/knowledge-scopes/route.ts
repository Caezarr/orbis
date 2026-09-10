import { ok, fail } from "@/lib/api/http";
import { isLocalMutation } from "@/lib/api/local-request";
import { scopeSchema } from "@/lib/product/knowledge-scopes";
import { getStore, mutateStore } from "@/lib/store/store";
import { id } from "@/lib/ids";
export async function GET(request: Request) {
  const state = getStore();
  const missionId = new URL(request.url).searchParams.get("mission");
  return ok({
    items: (state.knowledgeSelections ?? []).filter(
      (s) =>
        s.tenantId === state.workspace.tenantId && s.missionId === missionId,
    ),
  });
}
export async function POST(request: Request) {
  if (!isLocalMutation(request)) return fail("Accès local requis.", 403);
  const input = scopeSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return fail(input.error.issues[0].message, 400);
  const state = getStore();
  if (
    !state.missions.some(
      (m) =>
        m.id === input.data.missionId &&
        m.tenantId === state.workspace.tenantId,
    )
  )
    return fail("Mission introuvable.", 404);
  const selection = mutateStore((s) => {
    const existing = (s.knowledgeSelections ?? []).find(
      (item) =>
        item.tenantId === s.workspace.tenantId &&
        item.missionId === input.data.missionId &&
        item.provider === input.data.provider &&
        item.url === input.data.url,
    );
    if (existing) {
      Object.assign(existing, input.data);
      return existing;
    }
    const item = {
      ...input.data,
      id: id("scope"),
      tenantId: s.workspace.tenantId,
      createdAt: new Date().toISOString(),
      status: "awaiting_connection" as const,
    };
    (s.knowledgeSelections ??= []).push(item);
    return item;
  });
  return ok(selection, 201);
}
