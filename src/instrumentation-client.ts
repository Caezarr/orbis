import { installBrowserErrorReporting } from "@/lib/platform/browser-errors";

// Browser error capture: uncaught errors and unhandled rejections go to the
// same-origin relay /api/client-errors, which scrubs them and forwards them to
// Sentry only when SENTRY_DSN is set on the server.
try {
  installBrowserErrorReporting(window);
} catch {
  // Monitoring must never break the page.
}
