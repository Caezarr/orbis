import { clientKey } from "@/lib/start/public-site";
import { cronAuthorization } from "./cron";
import { createSharedLimiter, type SharedLimiter } from "./limits";

const denied = createSharedLimiter({ bucket: "cron_denied", limit: 20, windowMs: 10 * 60_000 });
const headers = { "Cache-Control": "no-store" };

/**
 * CRON_SECRET check for scheduler routes, with a shared per-IP limit on FAILED
 * attempts (an authorized scheduler is never limited). Returns a response to
 * send, or null when the caller is authorized.
 */
export async function guardCron(request: Request, limiter: SharedLimiter = denied): Promise<Response | null> {
  const auth = cronAuthorization(request);
  if (auth === "ok") return null;
  if (auth === "unconfigured") return Response.json({ error: "Scheduler is not configured." }, { status: 503, headers });
  const slot = await limiter.take(clientKey(request));
  if (!slot.allowed) return Response.json({ error: "Too many attempts" }, { status: 429, headers });
  return Response.json({ error: "Unauthorized" }, { status: 401, headers });
}
