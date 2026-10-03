import { withWorkspaceRequest } from "@/lib/platform/request";
import { isOfflineMode } from "@/lib/platform/context";
import { PlatformError } from "@/lib/platform/auth";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import { calendarAction, calendarActionSchema } from "@/lib/inbox/features";

export const runtime = "nodejs";

/** Connect (Composio link) or verify (server-side) the workspace calendar. Owner/admin. */
export async function POST(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      if (!inboxDraftsEnabled() || isOfflineMode())
        return Response.json(
          { error: "Inbox drafts are not enabled for this deployment." },
          { status: 503 },
        );
      const parsed = calendarActionSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return Response.json({ error: "Action invalide." }, { status: 400 });
      try {
        return Response.json(
          await calendarAction(
            parsed.data.action,
            process.env.APP_ORIGIN ?? new URL(request.url).origin,
          ),
        );
      } catch (error) {
        if (error instanceof PlatformError) throw error;
        return Response.json(
          { error: "L’autorisation n’a pas pu démarrer. Réessayez dans un instant." },
          { status: 502 },
        );
      }
    },
    { requireRole: ["owner", "admin"] },
  );
}
