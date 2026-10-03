import { after } from "next/server";
import { isSameOriginMutation } from "@/lib/platform/auth";
import { browserReportSchema, buildBrowserEvent, MAX_CLIENT_ERROR_BYTES } from "@/lib/platform/client-errors";
import { createSharedLimiter } from "@/lib/platform/limits";
import { monitoringConfigured, sendEvent } from "@/lib/platform/observability";
import { clientKey } from "@/lib/start/public-site";

export const runtime = "nodejs";

// Public relay for browser errors (src/lib/platform/browser-errors.ts).
// Same-origin only, 8 KB max, rate limited per client. Without SENTRY_DSN it
// accepts and drops the report without touching the database. The response
// never says whether the report was forwarded.
const limiter = createSharedLimiter({ bucket: "client_errors", limit: 10, windowMs: 10 * 60_000 });
const accepted = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return new Response(null, { status: 403 });
  if (!monitoringConfigured()) return accepted();
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_CLIENT_ERROR_BYTES) return new Response(null, { status: 413 });
  const text = await request.text().catch(() => "");
  if (text.length > MAX_CLIENT_ERROR_BYTES) return new Response(null, { status: 413 });
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Falls through to the schema error.
  }
  const parsed = browserReportSchema.safeParse(json);
  if (!parsed.success) return new Response(null, { status: 400 });
  const slot = await limiter.take(clientKey(request));
  if (!slot.allowed) return new Response(null, { status: 429, headers: { "Retry-After": String(Math.ceil(slot.retryAfterMs / 1000)) } });
  const event = buildBrowserEvent(parsed.data);
  // Forward after the response so the browser never waits on Sentry.
  after(() => sendEvent(event));
  return accepted();
}
