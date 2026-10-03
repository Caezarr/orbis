import { guardCron } from "@/lib/platform/cron-guard";
import { isOfflineMode } from "@/lib/platform/context";
import { logEvent } from "@/lib/platform/observability";
import { runRetentionPurge } from "@/lib/account/retention";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

/**
 * Daily retention purge (Vercel Cron or any scheduler, CRON_SECRET bearer):
 * previews and request contacts past their documented retention, for every
 * workspace (including those with no worker activity), and expired rate-limit
 * windows. Counts only in the response.
 */
async function handle(request: Request) {
  const denied = await guardCron(request);
  if (denied) return denied;
  if (isOfflineMode()) return Response.json({ skipped: "offline" }, { headers });
  try {
    const result = await runRetentionPurge();
    logEvent("info", "retention_purge", result);
    return Response.json(result, { headers });
  } catch {
    logEvent("error", "retention_purge_failed");
    return Response.json({ error: "Retention purge failed." }, { status: 500, headers });
  }
}
export const GET = handle;
export const POST = handle;
