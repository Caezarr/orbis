import { withWorkspaceRequest } from "@/lib/platform/request";
import { getStore, mutateStore } from "@/lib/store/store";
import { readRemote } from "@/lib/knowledge/remote";
import { id as newId } from "@/lib/ids";
import { PlatformError } from "@/lib/platform/auth";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withWorkspaceRequest(
    request,
    async () => {
      const { id } = await params;
      const body = await request.json().catch(() => null);
      if (!["refresh", "revoke"].includes(body?.action))
        throw new PlatformError("Choose refresh or revoke.", 400);
      const state = getStore(),
        source = state.sources.find(
          (s) => s.id === id && s.tenantId === state.workspace.tenantId,
        );
      if (!source) throw new PlatformError("Source not found.", 404);
      if (body.action === "revoke") {
        mutateStore((s) => {
          const item = s.sources.find((v) => v.id === id)!;
          item.status = "revoked";
          item.excerpt = "";
          item.version = newId("sv");
        });
        return Response.json({ status: "revoked" });
      }
      if (!source.remote)
        throw new PlatformError(
          "Only connected sources can be refreshed.",
          400,
        );
      try {
        const result = await readRemote(source.remote.location);
        mutateStore((s) => {
          const item = s.sources.find((v) => v.id === id)!;
          if (item.excerpt !== result.text || item.status !== "ready")
            item.version = newId("sv");
          item.excerpt = result.text;
          item.name = result.resource.name;
          item.status = "ready";
          item.remote!.verifiedAt = new Date().toISOString();
        });
        return Response.json({ status: "ready" });
      } catch {
        mutateStore((s) => {
          s.sources.find((v) => v.id === id)!.status = "stale";
        });
        // Persist stale status even when provider access fails, so agents stop using it.
        return Response.json({
          status: "stale",
          error:
            "Could not refresh. This source is paused; reconnect the tool and try again.",
        });
      }
    },
    { requireRole: ["owner", "admin"] },
  );
}
