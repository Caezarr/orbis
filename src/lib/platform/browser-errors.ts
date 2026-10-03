/*
 * Browser error capture, loaded by src/instrumentation-client.ts before the app
 * becomes interactive. Browser-safe: no Node.js or "@/" server imports.
 *
 * It listens to uncaught errors (`error`, which also receives what React and
 * Next.js report through window.reportError) and unhandled promise rejections,
 * and posts a small report to the same-origin relay /api/client-errors. The
 * relay scrubs it and forwards it to Sentry only when SENTRY_DSN is set on the
 * server; the DSN, Sentry hosts and any SDK never reach the browser.
 *
 * What is sent: error type, message and stack (truncated here, scrubbed again
 * on the server) and the page path without query string or fragment. Never
 * page content, form values, cookies, storage or user identity.
 */

export const CLIENT_ERRORS_ENDPOINT = "/api/client-errors";
export const MAX_REPORTS_PER_PAGE = 5;

export type BrowserErrorReport = {
  source: "error" | "unhandledrejection";
  type: string;
  message: string;
  stack?: string;
  path: string;
};

// Errors that say nothing actionable about Orbis: opaque cross-origin scripts,
// browser extensions, ResizeObserver loop notices and aborted navigations.
const IGNORED_MESSAGES = [/^Script error\.?$/i, /ResizeObserver loop/i, /^AbortError\b/];
const EXTENSION = /(?:chrome|moz|safari(?:-web)?|ms-browser)-extension:\/\//i;

function asError(value: unknown) {
  if (value instanceof Error) return { type: value.name || "Error", message: value.message, stack: value.stack };
  if (typeof value === "string") return { type: "Error", message: value, stack: undefined };
  return { type: "NonError", message: "Non-error value thrown", stack: undefined };
}

/** Builds the report for one browser event, or null when it should be ignored. */
export function toReport(
  source: BrowserErrorReport["source"],
  value: unknown,
  fallback: { message?: string; filename?: string },
  pathname: string,
): BrowserErrorReport | null {
  const error = value === undefined || value === null ? asError(fallback.message ?? "") : asError(value);
  if (!error.message && !error.stack) return null;
  if (IGNORED_MESSAGES.some((pattern) => pattern.test(error.message) || pattern.test(error.type))) return null;
  if (EXTENSION.test(fallback.filename ?? "") || EXTENSION.test(error.stack ?? "")) return null;
  return {
    source,
    type: error.type.slice(0, 80),
    message: error.message.slice(0, 500),
    ...(error.stack ? { stack: error.stack.slice(0, 4000) } : {}),
    path: pathname.split(/[?#]/)[0].slice(0, 200) || "/",
  };
}

type Target = Pick<Window, "addEventListener"> & { location: { pathname: string } };
type Send = (body: string) => void;

const defaultSend: Send = (body) => {
  // keepalive lets the report leave even if the page is unloading; same-origin
  // fetch always carries the Origin header the relay checks.
  void fetch(CLIENT_ERRORS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
};

/** Installs the listeners. At most MAX_REPORTS_PER_PAGE reports, no duplicates. */
export function installBrowserErrorReporting(target: Target, send: Send = defaultSend) {
  const seen = new Set<string>();
  const report = (candidate: BrowserErrorReport | null) => {
    try {
      if (!candidate || seen.size >= MAX_REPORTS_PER_PAGE) return;
      const key = `${candidate.type}:${candidate.message}`;
      if (seen.has(key)) return;
      seen.add(key);
      send(JSON.stringify(candidate));
    } catch {
      // Reporting must never break the page.
    }
  };
  target.addEventListener("error", (event: Event) => {
    const e = event as ErrorEvent;
    // Resource load errors (img/script 404) have no `error` nor message.
    if (!(e.error ?? e.message)) return;
    report(toReport("error", e.error, { message: e.message, filename: e.filename }, target.location.pathname));
  });
  target.addEventListener("unhandledrejection", (event: Event) => {
    report(toReport("unhandledrejection", (event as PromiseRejectionEvent).reason, {}, target.location.pathname));
  });
}
