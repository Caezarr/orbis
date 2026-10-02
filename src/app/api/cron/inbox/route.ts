import { cronAuthorization } from "@/lib/platform/cron";
import { isOfflineMode } from "@/lib/platform/context";
import { dispatchInboxPass } from "@/lib/operations/dispatcher";

export const runtime = "nodejs";
// Vercel function limit for this route; the pass itself stops after
// ORBIS_SCHEDULER_BUDGET_MS (default 50 s) and never starts work it cannot finish.
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store" };

/**
 * Scheduler trigger (Vercel Cron or any scheduler): one bounded multi-tenant
 * inbox dispatcher pass. Authenticated by CRON_SECRET only; no session, no
 * tenant input. Response carries counts only, never ids or content.
 */
async function handle(request: Request) {
  const auth = cronAuthorization(request);
  if (auth === "unconfigured")
    return Response.json(
      { error: "Scheduler is not configured." },
      { status: 503, headers },
    );
  if (auth === "unauthorized")
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (isOfflineMode())
    return Response.json(
      { stoppedBy: "disabled", reason: "offline" },
      { headers },
    );
  try {
    return Response.json(await dispatchInboxPass(), { headers });
  } catch {
    return Response.json(
      { error: "Dispatcher pass failed." },
      { status: 500, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
