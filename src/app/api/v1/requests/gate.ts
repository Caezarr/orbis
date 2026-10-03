import { isOfflineMode } from "@/lib/platform/context";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";

/** Requests, follow-ups and the weekly report live on top of inbox drafts: same flag, database only. */
export function requestsUnavailable() {
  if (inboxDraftsEnabled() && !isOfflineMode()) return null;
  return Response.json(
    { error: "Les demandes et le rapport ne sont pas activés sur ce déploiement." },
    { status: 503 },
  );
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
