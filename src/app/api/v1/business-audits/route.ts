import { ok, fail } from "@/lib/api/http";
import { isLocalMutation } from "@/lib/api/local-request";
import { auditSchema } from "@/lib/product/audit";
import { getStore, mutateStore } from "@/lib/store/store";
import { id } from "@/lib/ids";
export async function GET() {
  const s = getStore();
  return ok({
    items: (s.businessAudits ?? []).filter(
      (a) => a.tenantId === s.workspace.tenantId,
    ),
  });
}
export async function POST(request: Request) {
  if (!isLocalMutation(request))
    return fail(
      "Accès local requis avant configuration de l’authentification.",
      403,
    );
  const parsed = auditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return fail(
      "Complétez l’activité, la priorité, le volume et le résultat attendu.",
    );
  const result = mutateStore((s) => {
    const audit = {
      ...parsed.data,
      id: id("audit"),
      tenantId: s.workspace.tenantId,
      createdAt: new Date().toISOString(),
      installations: [],
    };
    (s.businessAudits ??= []).unshift(audit);
    return audit;
  });
  return ok(result, 201);
}
