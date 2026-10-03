import { isOfflineMode } from "@/lib/platform/context";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";

/** The company brain lives on top of inbox drafts: same flag, database only. */
export function brainUnavailable() {
  if (inboxDraftsEnabled() && !isOfflineMode()) return null;
  return Response.json(
    { error: "La fiche entreprise n’est pas activée sur ce déploiement." },
    { status: 503 },
  );
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
