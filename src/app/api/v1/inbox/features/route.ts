import { withWorkspaceRequest } from "@/lib/platform/request";
import { isOfflineMode } from "@/lib/platform/context";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import { featuresSchema, featuresView, setFeatures } from "@/lib/inbox/features";

export const runtime = "nodejs";
const unavailable = () =>
  Response.json(
    { error: "Inbox drafts are not enabled for this deployment." },
    { status: 503 },
  );

/** Calendar-aware drafts + visible triage opt-ins of the session workspace. */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    if (!inboxDraftsEnabled() || isOfflineMode()) return unavailable();
    return Response.json(await featuresView());
  });
}
/** Body `{calendarEnabled?, labelsEnabled?, timezone?}` strict; owner/admin. */
export async function PUT(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      if (!inboxDraftsEnabled() || isOfflineMode()) return unavailable();
      const parsed = featuresSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return Response.json({ error: "Réglage invalide." }, { status: 400 });
      return Response.json(await setFeatures(parsed.data));
    },
    { requireRole: ["owner", "admin"] },
  );
}
