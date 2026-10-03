import { guardCron } from "@/lib/platform/cron-guard";
import { isOfflineMode } from "@/lib/platform/context";
import { logEvent } from "@/lib/platform/observability";
import { digestEnabled, runDigestPass } from "@/lib/digest/service";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };

/**
 * Daily digest pass (Vercel Cron or any scheduler, CRON_SECRET bearer). Each
 * opted-in user gets at most one digest per Europe/Paris day, from 07:00.
 * No session, no tenant input; counts only in the response.
 */
async function handle(request: Request) {
  const denied = await guardCron(request);
  if (denied) return denied;
  if (!digestEnabled()) return Response.json({ skipped: "disabled" }, { headers });
  if (isOfflineMode()) return Response.json({ skipped: "offline" }, { headers });
  try {
    const result = await runDigestPass();
    logEvent("info", "digest_pass", result);
    return Response.json(result, { headers });
  } catch {
    logEvent("error", "digest_pass_failed");
    return Response.json({ error: "Digest pass failed." }, { status: 500, headers });
  }
}
export const GET = handle;
export const POST = handle;
