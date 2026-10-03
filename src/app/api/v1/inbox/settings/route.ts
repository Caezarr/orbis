import { withWorkspaceRequest } from "@/lib/platform/request";
import { isOfflineMode } from "@/lib/platform/context";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import {
  inboxSettings,
  setContinuous,
  settingsSchema,
} from "@/lib/inbox/today";

export const runtime = "nodejs";
const unavailable = () =>
  Response.json(
    { error: "Inbox drafts are not enabled for this deployment." },
    { status: 503 },
  );

export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    if (!inboxDraftsEnabled() || isOfflineMode()) return unavailable();
    return Response.json(await inboxSettings());
  });
}
/** Continuous drafting opt-in. Body `{continuousEnabled: boolean}` only; owner/admin. */
export async function PUT(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      if (!inboxDraftsEnabled() || isOfflineMode()) return unavailable();
      const parsed = settingsSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return Response.json({ error: "Invalid settings." }, { status: 400 });
      return Response.json(await setContinuous(parsed.data.continuousEnabled));
    },
    { requireRole: ["owner", "admin"] },
  );
}
