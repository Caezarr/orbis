import { fail, ok } from "@/lib/api/http";
import { getStore, mutateStore } from "@/lib/store/store";
import { id } from "@/lib/ids";
import { nowIso } from "@/lib/time";

export async function GET() {
  return ok({ items: getStore().sources });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    excerpt?: string;
    kind?: "upload" | "website" | "fixture";
  } | null;
  if (!body?.name || !body.excerpt) return fail("name and excerpt required");
  const source = mutateStore((state) => {
    const item = {
      id: id("src"),
      tenantId: state.workspace.tenantId,
      name: body.name!,
      kind: body.kind ?? "upload",
      status: "ready" as const,
      origin: `upload://${body.name}`,
      excerpt: body.excerpt!,
      version: id("sv"),
      required: false,
      createdAt: nowIso(),
    };
    state.sources.unshift(item);
    state.outbox.unshift({
      id: id("evt"),
      tenantId: state.workspace.tenantId,
      type: "source.ready",
      payload: { sourceId: item.id },
      createdAt: nowIso(),
    });
    return item;
  });
  return ok(source, 201);
}
