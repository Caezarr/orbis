import { createHash, timingSafeEqual } from "node:crypto";

/** Minimum CRON_SECRET length; shorter secrets are treated as unconfigured. */
export const MIN_CRON_SECRET_LENGTH = 32;

/**
 * Bearer check for scheduler endpoints (Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`). Fails closed when the secret is unset
 * or too short. Both sides are hashed to equal length, then compared in
 * constant time, so neither length nor prefix leaks through timing.
 */
export function cronAuthorization(
  request: Request,
  secret = process.env.CRON_SECRET,
): "ok" | "unconfigured" | "unauthorized" {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) return "unconfigured";
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  const presented = match?.[1] ?? "";
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b) && match ? "ok" : "unauthorized";
}
