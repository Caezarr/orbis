import { cronAuthorization } from "@/lib/platform/cron";
import { healthChecks, healthStatus } from "@/lib/platform/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

/**
 * Liveness/readiness. Public: `{status}` only. With `Authorization: Bearer
 * $CRON_SECRET`: configuration presence booleans too. No secrets, ids or URLs.
 */
export async function GET(request: Request) {
  const checks = await healthChecks();
  const status = healthStatus(checks);
  const detailed = cronAuthorization(request) === "ok";
  return Response.json(
    detailed ? { status, time: new Date().toISOString(), checks } : { status },
    { status: status === "ok" ? 200 : 503, headers },
  );
}
