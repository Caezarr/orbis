import Stripe from "stripe";
import { displayPriceFrom, PAID_PLANS, stripePriceId, type DisplayPrice, type PaidPlanKey } from "./plans";

let client: Stripe | undefined;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  client ??= new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 2, timeout: 15_000 });
  return client;
}

export function requiredPrice(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`);
  return value;
}

export function appUrl() {
  const value = process.env.ORBIS_APP_URL;
  if (!value) throw new Error("ORBIS_APP_URL_NOT_CONFIGURED");
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("INVALID_APP_URL");
  return url.origin;
}

/** Stripe Price id of a paid plan (see plans.ts for env names and legacy fallback). */
export function planPrice(plan: PaidPlanKey) {
  return requiredPrice(stripePriceId(plan), plan === "solo" ? "STRIPE_PRICE_SOLO_MONTHLY" : "STRIPE_PRICE_EQUIPE_MONTHLY");
}

/** Subscription checkout needs the key, webhook secret and a public app URL. */
export function subscriptionBillingConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.ORBIS_APP_URL);
}

const PRICE_TTL_MS = 10 * 60_000;
const priceCache = new Map<string, { at: number; value: DisplayPrice | null }>();
export function clearPriceCache() {
  priceCache.clear();
}
/**
 * Display prices come from Stripe Price objects, never from code. Missing key,
 * missing price id, unusable price or a Stripe error → null ("Tarif bientôt
 * disponible", checkout disabled). Cached for 10 minutes per price id.
 */
export async function displayPrices(now = Date.now()): Promise<Record<PaidPlanKey, DisplayPrice | null>> {
  const result = { solo: null, equipe: null } as Record<PaidPlanKey, DisplayPrice | null>;
  if (!process.env.STRIPE_SECRET_KEY) return result;
  await Promise.all(
    PAID_PLANS.map(async (plan) => {
      const id = stripePriceId(plan);
      if (!id) return;
      const cached = priceCache.get(id);
      if (cached && now - cached.at < PRICE_TTL_MS) {
        result[plan] = cached.value;
        return;
      }
      try {
        const value = displayPriceFrom(await stripe().prices.retrieve(id));
        priceCache.set(id, { at: now, value });
        result[plan] = value;
      } catch {
        result[plan] = null; // Not cached: retried on the next request.
      }
    }),
  );
  return result;
}
