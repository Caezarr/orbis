import { integrationUser } from "@/lib/integrations/composio";
import { resolveDemoConsent } from "@/lib/integrations/demo-mailbox/fake-sdk";
import { demoMailboxActive, isProductionRuntime } from "@/lib/integrations/demo-mailbox/guard";
import { withWorkspaceRequest } from "@/lib/platform/request";
import { getStore } from "@/lib/store/store";

export const runtime = "nodejs";
const notFound = () => new Response("Not found", { status: 404 });

/**
 * Demo consent (local development only, 404 elsewhere). Activates the pending
 * demo account of THIS session's workspace, then returns to the callback the
 * fake recorded at link time (same origin only). Like the real OAuth return,
 * nothing here is proof of connection: /start re-verifies server-side.
 */
export async function POST(request: Request) {
  if (isProductionRuntime() || !demoMailboxActive()) return notFound();
  return withWorkspaceRequest(
    request,
    async () => {
      const form = await request.formData().catch(() => null);
      const accountId = String(form?.get("account") ?? "");
      const approve = form?.get("decision") === "approve";
      if (!/^ca_demo_[A-Za-z0-9]{1,40}$/.test(accountId))
        return Response.json({ error: "Invalid demo account." }, { status: 400 });
      const { workspace } = getStore();
      const result = resolveDemoConsent({
        accountId,
        userId: integrationUser(workspace.tenantId, workspace.id),
        approve,
        origin: new URL(process.env.APP_ORIGIN ?? request.url).origin,
      });
      if (!result) return Response.json({ error: "No pending demo connection for this workspace." }, { status: 404 });
      return new Response(null, { status: 303, headers: { Location: result.callbackUrl } });
    },
    { requireRole: ["owner", "admin", "operator"] },
  );
}
