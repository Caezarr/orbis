import { randomBytes } from "node:crypto";

/*
 * Error monitoring and structured logs without content.
 *
 * Sentry: optional, enabled only when SENTRY_DSN is set. Events are sent to
 * Sentry's documented envelope ingestion endpoint by this small server-side
 * transport (no @sentry/nextjs dependency, so the Vercel/webpack build is
 * unchanged). Browser errors reach the same transport through the same-origin
 * relay /api/client-errors (src/lib/platform/client-errors.ts), so the DSN
 * never ships to the browser. Every event goes through `beforeSend` = `scrubEvent`, which
 * keeps only the error type, a scrubbed message, stack frames (file/function/
 * line), the route template and the HTTP method. No request body, headers,
 * cookies, query strings, user, email, mail content or token is ever sent.
 *
 * Logs: `logEvent` writes one JSON line with an allowlisted set of fields
 * (numbers, booleans, short identifiers); free text is dropped.
 */

const EMAIL = /[\p{L}\p{N}._%+-]+(?:@|＠)[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const BEARER = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SECRET_KEYS = /\b(?:sk|rk|pk|whsec|sk_live|sk_test|rk_live|rk_test|ak|sbp|sb_secret|sb_publishable)_[A-Za-z0-9_]{8,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const URL_QUERY = /(https?:\/\/[^\s?#]+)[?#][^\s]*/g;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]){3,6}\d{2,4}/g;
const KEY_VALUE = /\b(password|passwd|secret|token|api[_-]?key|authorization|cookie|code)=([^\s&]+)/gi;

/** Removes emails, tokens, keys, JWTs, phone numbers and URL queries; truncates. */
export function scrubText(value: unknown, max = 500): string {
  const text = typeof value === "string" ? value : value instanceof Error ? value.message : String(value ?? "");
  return text
    .replace(URL_QUERY, "$1?[scrubbed]")
    .replace(JWT, "[jwt]")
    .replace(BEARER, "$1 [scrubbed]")
    .replace(SECRET_KEYS, "[key]")
    .replace(KEY_VALUE, "$1=[scrubbed]")
    .replace(EMAIL, "[email]")
    .replace(LONG_TOKEN, "[token]")
    .replace(PHONE, "[phone]")
    .slice(0, max);
}

export type SentryFrame = { filename?: string; function?: string; lineno?: number; colno?: number; in_app?: boolean };
export type SentryEvent = {
  event_id: string;
  timestamp: number;
  platform: "node" | "javascript";
  level: "error" | "warning";
  environment?: string;
  release?: string;
  server_name?: never;
  exception?: { values: { type: string; value: string; stacktrace?: { frames: SentryFrame[] } }[] };
  tags?: Record<string, string>;
  // Anything below is removed by scrubEvent.
  request?: unknown;
  user?: unknown;
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: unknown;
};

const TAG_KEYS = new Set(["route", "method", "routeType", "runtime", "digest", "source"]);
/** Sentry beforeSend: allowlist rebuild of the event. Never throws. */
export function scrubEvent(event: SentryEvent): SentryEvent {
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.tags ?? {}))
    if (TAG_KEYS.has(key) && typeof value === "string") tags[key] = scrubText(value, 120);
  return {
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform === "javascript" ? "javascript" : "node",
    level: event.level,
    ...(event.environment ? { environment: scrubText(event.environment, 40) } : {}),
    ...(event.release ? { release: scrubText(event.release, 64) } : {}),
    ...(event.exception
      ? {
          exception: {
            values: event.exception.values.slice(0, 3).map((v) => ({
              type: scrubText(v.type, 80),
              value: scrubText(v.value, 500),
              ...(v.stacktrace
                ? {
                    stacktrace: {
                      frames: v.stacktrace.frames.slice(-30).map((f) => ({
                        ...(f.filename ? { filename: scrubText(f.filename, 200) } : {}),
                        ...(f.function ? { function: scrubText(f.function, 120) } : {}),
                        ...(typeof f.lineno === "number" ? { lineno: f.lineno } : {}),
                        ...(typeof f.colno === "number" ? { colno: f.colno } : {}),
                        in_app: !f.filename?.includes("node_modules"),
                      })),
                    },
                  }
                : {}),
            })),
          },
        }
      : {}),
    tags,
  };
}

/** Parses "https://<publicKey>@<host>/<projectId>". */
export function parseDsn(dsn: string | undefined) {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
    if (url.protocol !== "https:" || !url.username || !/^\d+$/.test(projectId)) return null;
    return { publicKey: url.username, host: url.host, projectId, envelope: `https://${url.host}/api/${projectId}/envelope/` };
  } catch {
    return null;
  }
}
export function monitoringConfigured(env: Record<string, string | undefined> = process.env) {
  return !!parseDsn(env.SENTRY_DSN);
}

function frames(stack: string | undefined): SentryFrame[] {
  if (!stack) return [];
  return stack
    .split("\n")
    .slice(1)
    .map((line) => /at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ function: m[1] ?? "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) }))
    .reverse();
}

export function buildEvent(error: unknown, tags: Record<string, string> = {}, env: Record<string, string | undefined> = process.env): SentryEvent {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Non-error thrown");
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  return {
    event_id: randomBytes(16).toString("hex"),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    environment: env.VERCEL_ENV ?? env.NODE_ENV ?? "development",
    ...(env.VERCEL_GIT_COMMIT_SHA ? { release: env.VERCEL_GIT_COMMIT_SHA.slice(0, 12) } : {}),
    exception: { values: [{ type: err.name || "Error", value: err.message, stacktrace: { frames: frames(err.stack) } }] },
    tags: { ...tags, ...(digest ? { digest } : {}) },
  };
}

/**
 * Reports a server error to Sentry when SENTRY_DSN is set. Never throws, never
 * blocks more than 2 s. Returns whether an event was sent.
 */
export async function reportError(
  error: unknown,
  tags: Record<string, string> = {},
  deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {},
): Promise<boolean> {
  const env = deps.env ?? process.env;
  if (!parseDsn(env.SENTRY_DSN)) return false;
  try {
    return await sendEvent(buildEvent(error, tags, env), deps);
  } catch {
    return false;
  }
}

/**
 * Sends one already-built event through scrubEvent to the DSN's envelope
 * endpoint. Shared by server errors (reportError) and browser errors relayed by
 * /api/client-errors. Never throws, never blocks more than 2 s.
 */
export async function sendEvent(
  event: SentryEvent,
  deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {},
): Promise<boolean> {
  const dsn = parseDsn((deps.env ?? process.env).SENTRY_DSN);
  if (!dsn) return false;
  try {
    const clean = scrubEvent(event);
    const body = [
      JSON.stringify({ event_id: clean.event_id, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(clean),
    ].join("\n");
    const response = await (deps.fetch ?? fetch)(dsn.envelope, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=orbis-minimal/1.0, sentry_key=${dsn.publicKey}`,
      },
      body,
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const SAFE_STRING = /^[A-Za-z0-9_.:/-]{1,64}$/;
/**
 * One JSON log line. Only numbers, booleans and short identifier-like strings
 * are kept (ids, statuses, route templates); anything else is dropped, so mail
 * content, emails or tokens cannot end up in logs through this helper.
 */
export function logLine(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const kept: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) kept[key] = value;
    else if (typeof value === "boolean") kept[key] = value;
    else if (typeof value === "string" && SAFE_STRING.test(value) && !value.includes("@")) kept[key] = value;
  }
  return JSON.stringify({ level, event: SAFE_STRING.test(event) ? event : "event", time: new Date().toISOString(), ...kept });
}
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = logLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
