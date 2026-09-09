import { fail, ok } from "@/lib/api/http";
import { mutateStore } from "@/lib/store/store";
import { nowIso } from "@/lib/time";
import { id } from "@/lib/ids";

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  try {
    const connection = mutateStore((state) => {
      const found = state.connections.find((item) => item.provider === provider);
      if (!found) throw new Error("Unknown provider");
      found.status = "connected";
      found.health = "Connected · adapter stub · secrets stay server-side";
      found.secretRef = `secret://adapter/${provider}/${id("ref")}`;
      state.audit.unshift({
        id: id("aud"),
        tenantId: state.workspace.tenantId,
        actor: "user_gabriel",
        action: "connection.start",
        target: found.id,
        result: "connected_stub",
        createdAt: nowIso(),
      });
      return found;
    });
    return ok({
      connection,
      notice:
        "OAuth is delegated to a Nango/Composio adapter in production. This MVP records scopes and a secret reference only — the browser never receives a credential.",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Connection failed");
  }
}
