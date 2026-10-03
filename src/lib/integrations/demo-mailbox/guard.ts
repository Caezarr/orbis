/*
 * Demo mailbox switch. Local development and tests only.
 *
 * `ORBIS_DEMO_MAILBOX=true` replaces the Composio SDK client with an in-process
 * fake (see ./fake-sdk.ts). It is refused, loudly, on any production runtime:
 * NODE_ENV=production (what `next build` / `next start` set) or
 * VERCEL_ENV=production. Refusal throws instead of silently falling back so a
 * misconfigured production deployment cannot serve a fake mailbox and cannot
 * look "connected" either. Every caller of the Composio client goes through
 * this check, so the throw surfaces on the first integration call.
 */
type Env = Record<string, string | undefined>;

export class DemoMailboxForbiddenError extends Error {
  constructor() {
    super(
      "ORBIS_DEMO_MAILBOX is a local development switch and is refused in production. Remove it from this environment.",
    );
  }
}

/** True on any runtime that must never use the demo mailbox. */
export function isProductionRuntime(env: Env = process.env) {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/** Whether the demo flag is set at all (no production check). */
export function demoMailboxRequested(env: Env = process.env) {
  return env.ORBIS_DEMO_MAILBOX?.trim().toLowerCase() === "true";
}

/**
 * True when the demo mailbox replaces Composio. Throws when the flag is set on
 * a production runtime (fail closed).
 */
export function demoMailboxEnabled(env: Env = process.env) {
  if (!demoMailboxRequested(env)) return false;
  if (isProductionRuntime(env)) throw new DemoMailboxForbiddenError();
  return true;
}

/** Non-throwing variant for UI and readiness: false on production, whatever the flag. */
export function demoMailboxActive(env: Env = process.env) {
  try {
    return demoMailboxEnabled(env);
  } catch {
    return false;
  }
}

/** Fixed demo configuration (the fake knows only these ids). */
export const DEMO_AUTH_CONFIGS = Object.freeze({
  gmail: "ac_demo_gmail",
  outlook: "ac_demo_outlook",
} as const);
export const DEMO_TOOL_VERSIONS = Object.freeze({
  gmail: "20260915_00",
  outlook: "20260929_00",
} as const);
/** Consent page the fake `connectedAccounts.link` redirects to. */
export const DEMO_CONSENT_PATH = "/dev/demo-mailbox/connect";
/** Dev page showing the demo inbox and the drafts Orbis created in it. */
export const DEMO_MAILBOX_PAGE = "/dev/demo-mailbox";
