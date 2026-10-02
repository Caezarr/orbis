import { withWorkspaceRequest } from "@/lib/platform/request";
import { getStore } from "@/lib/store/store";
import { connectMailbox, mailboxActionSchema, verifyMailbox } from "@/lib/start/server";

export const runtime = "nodejs";
/** Connect (Composio link) or verify (server-side account check) a mailbox. */
export async function POST(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      const parsed = mailboxActionSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success)
        return Response.json({ error: "Choisissez Gmail ou Outlook.", code: "invalid_input" }, { status: 400 });
      const { workspace } = getStore();
      const identity = { tenantId: workspace.tenantId, workspaceId: workspace.id };
      if (parsed.data.action === "verify")
        return Response.json(await verifyMailbox(parsed.data.provider, identity));
      try {
        const result = await connectMailbox(
          parsed.data.provider,
          identity,
          process.env.APP_ORIGIN ?? new URL(request.url).origin,
        );
        if ("error" in result)
          return Response.json(
            { error: "Cette messagerie n’est pas configurée sur ce déploiement.", code: result.error },
            { status: 503 },
          );
        return Response.json(result);
      } catch {
        return Response.json(
          { error: "L’autorisation n’a pas pu démarrer. Réessayez dans un instant.", code: "connect_failed" },
          { status: 502 },
        );
      }
    },
    { requireRole: ["owner", "admin", "operator"] },
  );
}
