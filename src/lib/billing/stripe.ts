import Stripe from "stripe";

let client: Stripe | undefined;

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  client ??= new Stripe(key, { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 2, timeout: 15_000 });
  return client;
}

export const stripePrices = {
  Solo: () => process.env.STRIPE_PRICE_SOLO_MONTHLY,
  BusinessBase: () => process.env.STRIPE_PRICE_BUSINESS_BASE_MONTHLY,
  BusinessExtraSeat: () => process.env.STRIPE_PRICE_BUSINESS_EXTRA_SEAT_MONTHLY,
} as const;

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

export function planPrice(plan: "Solo" | "Business") {
  return requiredPrice(plan === "Solo" ? stripePrices.Solo() : stripePrices.BusinessBase(), `STRIPE_PRICE_${plan.toUpperCase()}`);
}

export function extraSeatPrice() {
  return requiredPrice(stripePrices.BusinessExtraSeat(), "STRIPE_PRICE_BUSINESS_EXTRA_SEAT_MONTHLY");
}
