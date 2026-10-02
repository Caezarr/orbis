import { createHash, createHmac } from "node:crypto";
import { createDailyBudget, type DailyBudget } from "@/lib/start/budget";
import { createRateLimiter } from "@/lib/start/public-site";
import { isOfflineMode } from "./context";
import { pool } from "./db";

/*
 * Shared rate limits and daily budgets for public endpoints (migration 012).
 *
 * Two layers:
 *  1. an in-memory limiter per instance: a fast pre-check that never hits the
 *     database when this instance alone already exceeded the limit;
 *  2. a PostgreSQL fixed-window counter shared by every serverless instance,
 *     reached only through SECURITY DEFINER functions (`orbis_rate_limit_take`,
 *     `orbis_budget_reserve`). The runtime role has no privilege on the table.
 *
 * Keys are hashed here (HMAC-SHA-256 with ORBIS_RATE_LIMIT_SECRET when set,
 * else SHA-256), so no raw IP address or email ever reaches the database; the
 * table CHECK refuses anything that is not a hex digest.
 *
 * Failure policy when the shared store is unreachable:
 *  - limits: "open" (the memory layer still applies) or "closed";
 *  - budgets (money): always closed.
 */

export type SharedLimitStore = {
  take(input: {
    bucket: string;
    keyHash: string;
    windowSeconds: number;
    limit: number;
    cost: number;
  }): Promise<{ allowed: boolean; used: number; retryAfterMs: number }>;
  reserve(input: {
    bucket: string;
    keyHash: string;
    cost: number;
    keyCap: number;
    globalCap: number;
  }): Promise<"ok" | "global" | "key">;
};

export const pgLimitStore: SharedLimitStore = {
  async take({ bucket, keyHash, windowSeconds, limit, cost }) {
    const { rows } = await pool().query<{ allowed: boolean; used: number; retry_after_ms: string }>(
      "SELECT allowed, used, retry_after_ms FROM orbis_rate_limit_take($1,$2,$3,$4,$5)",
      [bucket, keyHash, windowSeconds, limit, cost],
    );
    const row = rows[0];
    if (!row) throw new Error("limiter returned no row");
    return { allowed: row.allowed, used: Number(row.used), retryAfterMs: Number(row.retry_after_ms) };
  },
  async reserve({ bucket, keyHash, cost, keyCap, globalCap }) {
    const { rows } = await pool().query<{ result: "ok" | "global" | "key" }>(
      "SELECT orbis_budget_reserve($1,$2,$3,$4,$5) AS result",
      [bucket, keyHash, cost, keyCap, globalCap],
    );
    const result = rows[0]?.result;
    if (result !== "ok" && result !== "global" && result !== "key") throw new Error("budget returned no result");
    return result;
  },
};

/** Shared store in use: a database is configured and not explicitly disabled. */
export function sharedLimitsEnabled() {
  return !!process.env.DATABASE_URL && !isOfflineMode() && process.env.ORBIS_SHARED_LIMITS !== "false";
}

/** Hex digest of a client key (IP, email…); never store the raw value. */
export function hashLimitKey(bucket: string, raw: string) {
  const secret = process.env.ORBIS_RATE_LIMIT_SECRET;
  const input = `${bucket}\u0000${raw.trim().toLowerCase()}`;
  return secret
    ? createHmac("sha256", secret).update(input).digest("hex")
    : createHash("sha256").update(input).digest("hex");
}

export type LimitResult = {
  allowed: boolean;
  retryAfterMs: number;
  /** Which layer decided. `degraded` = shared store unreachable. */
  layer: "memory" | "shared" | "degraded";
};
export type SharedLimiter = { take(rawKey: string, cost?: number): Promise<LimitResult> };

const BUCKET = /^[a-z0-9_.:-]{1,64}$/;

export function createSharedLimiter(
  options: { bucket: string; limit: number; windowMs: number; failMode?: "open" | "closed"; maxKeys?: number },
  deps: { store?: SharedLimitStore; enabled?: () => boolean } = {},
): SharedLimiter {
  if (!BUCKET.test(options.bucket)) throw new Error("invalid limiter bucket");
  const memory = createRateLimiter({ limit: options.limit, windowMs: options.windowMs, maxKeys: options.maxKeys });
  const windowSeconds = Math.max(1, Math.round(options.windowMs / 1000));
  return {
    async take(rawKey, cost = 1) {
      const local = memory.take(rawKey);
      if (!local.allowed) return { allowed: false, retryAfterMs: local.retryAfterMs, layer: "memory" };
      if (!(deps.enabled ?? sharedLimitsEnabled)()) return { allowed: true, retryAfterMs: 0, layer: "memory" };
      try {
        const shared = await (deps.store ?? pgLimitStore).take({
          bucket: options.bucket,
          keyHash: hashLimitKey(options.bucket, rawKey),
          windowSeconds,
          limit: options.limit,
          cost,
        });
        return { allowed: shared.allowed, retryAfterMs: shared.retryAfterMs, layer: "shared" };
      } catch {
        const open = (options.failMode ?? "open") === "open";
        return { allowed: open, retryAfterMs: open ? 0 : 60_000, layer: "degraded" };
      }
    },
  };
}

export type BudgetResult = { allowed: true } | { allowed: false; scope: "global" | "key" | "unavailable" };
export type SharedBudget = { reserve(rawKey: string, cents: number): Promise<BudgetResult> };

/**
 * Daily (UTC) budget, global + per key, shared across instances. The memory
 * budget is a pre-check; the shared reservation is authoritative and fails
 * closed. Reservations are never refunded.
 */
export function createSharedDailyBudget(
  options: { bucket: string; capCents: number; perKeyCapCents: number },
  deps: { store?: SharedLimitStore; enabled?: () => boolean; memory?: DailyBudget } = {},
): SharedBudget {
  if (!BUCKET.test(options.bucket)) throw new Error("invalid budget bucket");
  const memory = deps.memory ?? createDailyBudget({ capCents: options.capCents, perKeyCapCents: options.perKeyCapCents });
  return {
    async reserve(rawKey, cents) {
      const local = memory.reserve(rawKey, cents);
      if (!local.allowed) return local;
      if (!(deps.enabled ?? sharedLimitsEnabled)()) return { allowed: true };
      try {
        const result = await (deps.store ?? pgLimitStore).reserve({
          bucket: options.bucket,
          keyHash: hashLimitKey(options.bucket, rawKey),
          cost: cents,
          keyCap: options.perKeyCapCents,
          globalCap: options.capCents,
        });
        return result === "ok" ? { allowed: true } : { allowed: false, scope: result };
      } catch {
        return { allowed: false, scope: "unavailable" };
      }
    },
  };
}
