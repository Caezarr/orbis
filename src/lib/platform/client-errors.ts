import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { SentryEvent, SentryFrame } from "./observability";

/*
 * Server side of browser error capture (see src/lib/platform/browser-errors.ts).
 *
 * The browser report is untrusted input: strict schema, size caps, and the
 * page path is reduced to a template (id-like segments become "[id]") before
 * it becomes a Sentry tag. scrubEvent in observability.ts then rebuilds the
 * event from its allowlist and scrubs emails, tokens, phones and URL queries
 * from the message and stack frames.
 */

export const MAX_CLIENT_ERROR_BYTES = 8 * 1024;

export const browserReportSchema = z
  .object({
    source: z.enum(["error", "unhandledrejection"]),
    type: z.string().min(1).max(80),
    message: z.string().max(500),
    stack: z.string().max(4000).optional(),
    path: z.string().min(1).max(200),
  })
  .strict();
export type BrowserReport = z.infer<typeof browserReportSchema>;

const SLUG = /^[a-z][a-z-]{0,39}$/;
const ROUTE_GROUP = /^\([a-z-]{1,40}\)$/;

/** "/workspace/7f3c…/inbox?x=1" → "/workspace/[id]/inbox". At most 5 segments. */
export function routeTemplate(path: string) {
  const clean = path.split(/[?#]/)[0];
  const segments = clean.split("/").filter(Boolean).slice(0, 5);
  return "/" + segments.map((segment) => (SLUG.test(segment) || ROUTE_GROUP.test(segment) ? segment : "[id]")).join("/");
}

// Chrome/Edge: "    at fn (https://host/_next/static/chunks/a.js:1:200)" or "at https://…:1:2".
const V8 = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/;
// Firefox/Safari: "fn@https://host/_next/static/chunks/a.js:1:200".
const GECKO = /^(.*?)@(.+?):(\d+):(\d+)$/;

/** Keeps the path of same-app script URLs; drops origin, query and fragment. */
function frameFile(raw: string) {
  try {
    const url = new URL(raw);
    return url.pathname;
  } catch {
    return raw.split(/[?#]/)[0];
  }
}

export function parseBrowserStack(stack: string | undefined): SentryFrame[] {
  if (!stack) return [];
  const frames: SentryFrame[] = [];
  for (const line of stack.split("\n").slice(0, 50)) {
    const match = V8.exec(line) ?? GECKO.exec(line.trim());
    if (!match) continue;
    frames.push({
      function: match[1] || "?",
      filename: frameFile(match[2]),
      lineno: Number(match[3]),
      colno: Number(match[4]),
    });
  }
  // Sentry expects the oldest frame first.
  return frames.reverse();
}

export function buildBrowserEvent(report: BrowserReport, env: Record<string, string | undefined> = process.env): SentryEvent {
  return {
    event_id: randomBytes(16).toString("hex"),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: env.VERCEL_ENV ?? env.NODE_ENV ?? "development",
    ...(env.VERCEL_GIT_COMMIT_SHA ? { release: env.VERCEL_GIT_COMMIT_SHA.slice(0, 12) } : {}),
    exception: {
      values: [
        {
          type: report.type,
          value: report.message,
          stacktrace: { frames: parseBrowserStack(report.stack) },
        },
      ],
    },
    tags: { route: routeTemplate(report.path), runtime: "browser", source: report.source },
  };
}
