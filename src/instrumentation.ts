import type { Instrumentation } from "next";

/**
 * Server error capture (Next.js instrumentation). Logs one structured line
 * (route template, method, router context; never the path with ids/query,
 * headers or body) and reports to Sentry only when SENTRY_DSN is set, through
 * the scrubbing transport in src/lib/platform/observability.ts.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // Node.js only: the NEXT_RUNTIME check is inlined at build time, so the edge
  // bundle never includes the transport (it uses node:crypto).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logEvent, reportError } = await import("@/lib/platform/observability");
    const tags = { route: context.routePath, method: request.method, routeType: context.routeType, runtime: "nodejs" };
    logEvent("error", "request_error", tags);
    if (process.env.SENTRY_DSN) await reportError(error, tags);
  }
};
