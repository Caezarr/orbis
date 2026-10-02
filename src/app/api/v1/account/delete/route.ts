import { cookies } from "next/headers";
import { z } from "zod";
import { deleteAuthIdentity } from "@/lib/account/auth-user";
import {
  cancelTenantSubscription,
  eraseTenantRows,
  eraseWorkspace,
  EraseError,
  erasurePreconditions,
  type EraseResult,
} from "@/lib/account/erase";
import { stripe } from "@/lib/billing/stripe";
import { revokeWorkspaceConnections } from "@/lib/integrations/action-broker";
import { authClient, authenticatedUser } from "@/lib/platform/auth";
import { workspaceContext } from "@/lib/platform/context";
import { logEvent } from "@/lib/platform/observability";
import { withWorkspaceRequest } from "@/lib/platform/request";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ confirm: z.string().max(40) }).strict();

/**
 * Owner-only workspace + account deletion. Requires a sign-in younger than
 * 15 minutes and the typed word SUPPRIMER. See src/lib/account/erase.ts for the
 * order of operations and failure behaviour.
 */
export async function POST(request: Request) {
  let erased: (EraseResult & { userId: string; otherWorkspaces: number }) | null = null;
  const response = await withWorkspaceRequest(
    request,
    async () => {
      const ctx = workspaceContext();
      if (!ctx?.db) return Response.json({ error: "La suppression nécessite la base de données de production." }, { status: 503 });
      const parsed = bodySchema.safeParse(await request.json().catch(() => null));
      const user = await authenticatedUser();
      const blocked = erasurePreconditions({
        role: ctx.role,
        confirm: parsed.success ? parsed.data.confirm : undefined,
        lastSignInAt: user.last_sign_in_at,
      });
      if (blocked) return Response.json({ error: blocked.error, code: blocked.status === 401 ? "reauth_required" : "refused" }, { status: blocked.status });
      const db = ctx.db;
      const identity = { userId: ctx.userId, workspaceId: ctx.workspaceId, tenantId: ctx.tenantId };
      // memberships policy = the user's own rows: other workspaces of this user.
      const otherWorkspaces = Number(
        (await db.query<{ n: string }>("SELECT count(*)::text AS n FROM memberships WHERE user_id=$1 AND workspace_id<>$2", [ctx.userId, ctx.workspaceId]))
          .rows[0]?.n ?? 0,
      );
      try {
        const result = await eraseWorkspace(identity, {
          revokeConnections: (tenantId, workspaceId) => revokeWorkspaceConnections(tenantId, workspaceId),
          cancelSubscription: (tenantId) =>
            cancelTenantSubscription(db, tenantId, process.env.STRIPE_SECRET_KEY ? () => stripe() : null),
          eraseRows: (who) => eraseTenantRows(db, who),
        });
        // The snapshot row is gone: never write it back.
        ctx.dirty = false;
        erased = { ...result, userId: ctx.userId, otherWorkspaces };
        return Response.json({ ok: true });
      } catch (error) {
        const step = error instanceof EraseError ? error.step : "rows";
        logEvent("error", "workspace_erase_failed", { step });
        return Response.json(
          { error: error instanceof EraseError ? error.message : "Suppression impossible. Réessayez.", step },
          { status: 502 },
        );
      }
    },
    { requireRole: "owner" },
  );
  if (!erased || response.status !== 200) return response;
  const done = erased as EraseResult & { userId: string; otherWorkspaces: number };
  // After commit: identity deletion (optional) and sign-out.
  const identity = await deleteAuthIdentity(done.userId, done.otherWorkspaces);
  try {
    await (await authClient()).auth.signOut();
  } catch {}
  (await cookies()).delete("orbis_workspace");
  logEvent("info", "workspace_erased", {
    connections_revoked: done.connections.revoked,
    connections: done.connections.status,
    subscription: done.subscription,
    tables: Object.keys(done.rows).length,
    identity,
  });
  return Response.json(
    { ok: true, connections: done.connections, subscription: done.subscription, identity },
    { headers: { "Cache-Control": "no-store" } },
  );
}
