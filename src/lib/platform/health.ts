import { authConfig } from "./auth";
import { isOfflineMode } from "./context";
import { pool } from "./db";
import { monitoringConfigured } from "./observability";
import { sharedLimitsEnabled } from "./limits";
import { providerStatus } from "@/lib/runtime/provider";

/*
 * Health report. Public answer: status only. Detailed answer (configuration
 * presence as booleans, database reachability) only with the CRON_SECRET
 * bearer. Never returns a secret, a URL, an id or a version of a dependency.
 */
export type HealthChecks = {
  database: "ok" | "unavailable" | "not_configured";
  auth: boolean;
  ai: boolean;
  stripe: boolean;
  composio: boolean;
  cronSecret: boolean;
  monitoring: boolean;
  sharedLimits: boolean;
  offline: boolean;
};

let last: { at: number; value: HealthChecks["database"] } | null = null;
export async function databaseHealth(now = Date.now(), ping: () => Promise<unknown> = () => pool().query("SELECT 1")) {
  if (!process.env.DATABASE_URL) return "not_configured" as const;
  // At most one ping per 10 s per instance, whatever the request rate.
  if (last && now - last.at < 10_000) return last.value;
  let value: HealthChecks["database"] = "ok";
  try {
    await Promise.race([ping(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000))]);
  } catch {
    value = "unavailable";
  }
  last = { at: now, value };
  return value;
}
export function resetHealthCache() {
  last = null;
}

export async function healthChecks(deps: { database?: () => Promise<HealthChecks["database"]> } = {}): Promise<HealthChecks> {
  let auth = false;
  try {
    authConfig();
    auth = true;
  } catch {}
  return {
    database: await (deps.database ?? (() => databaseHealth()))(),
    auth,
    ai: providerStatus().configured,
    stripe: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    composio: !!process.env.COMPOSIO_API_KEY?.trim(),
    cronSecret: (process.env.CRON_SECRET ?? "").length >= 32,
    monitoring: monitoringConfigured(),
    sharedLimits: sharedLimitsEnabled(),
    offline: isOfflineMode(),
  };
}
/** 503 only when a configured database is unreachable. */
export function healthStatus(checks: HealthChecks) {
  return checks.database === "unavailable" ? "degraded" : "ok";
}
