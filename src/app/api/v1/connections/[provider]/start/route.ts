import { fail, ok } from "@/lib/api/http";
import { isLocalMutation } from "@/lib/api/local-request";
import { getStore } from "@/lib/store/store";
import { isIntegrationSlug } from "@/lib/integrations/catalog";
import {
  startConnection,
  integrationUser,
  connectionStatus,
} from "@/lib/integrations/composio";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  if (!isLocalMutation(request))
    return fail(
      "Authenticated workspace access is required. This installation is local-only.",
      403,
    );
  const { provider } = await params;
  if (!isIntegrationSlug(provider))
    return fail("Unsupported integration.", 404);
  const body = await request.json().catch(() => ({}));
  const { workspace } = getStore();
  const userId = integrationUser(workspace.tenantId, workspace.id);
  try {
    if (body?.action === "status")
      return ok(await connectionStatus(userId, provider));
    if (body?.action !== "connect") return fail("Choose connect or status.");
    return ok(
      await startConnection(
        userId,
        provider,
        new URL("/connections", request.url).href,
      ),
    );
  } catch {
    return fail(
      "The connection could not be verified. Check the server configuration or retry the authorisation.",
      502,
    );
  }
}
