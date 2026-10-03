import { withWorkspaceRequest } from "@/lib/platform/request";
import { isOfflineMode } from "@/lib/platform/context";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import { markTodaySeen, todayDigest } from "@/lib/inbox/today";

export const runtime = "nodejs";
const unavailable = () =>
  Response.json(
    { error: "Inbox drafts are not enabled for this deployment." },
    { status: 503 },
  );

/** Today: drafts ready to review, pending questions and skipped counts since the last visit. */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    if (!inboxDraftsEnabled() || isOfflineMode()) return unavailable();
    return Response.json(await todayDigest());
  });
}
/** Marks the decisions as seen for the session user (no body). */
export async function POST(request: Request) {
  return withWorkspaceRequest(request, async () => {
    if (!inboxDraftsEnabled() || isOfflineMode()) return unavailable();
    await markTodaySeen();
    return Response.json({ ok: true });
  });
}
