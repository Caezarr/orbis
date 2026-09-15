import { withWorkspaceRequest } from "@/lib/platform/request";
import { fail, ok } from "@/lib/api/http";
import { resolveIntent } from "@/lib/runtime/resolver";

export async function POST(request: Request) {
  return withWorkspaceRequest(request, async () => {
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text) return fail("Describe the work you want delegated.");
  return ok(resolveIntent(text));
  });
}
