/**
 * V1 self-serve plans: single source of truth (see docs/product/billing-v1.md).
 *
 * Limits (trial length, included drafts, mailboxes, monthly model-cost caps)
 * are configuration with conservative defaults, overridable per deployment via
 * env. Prices are NOT here: the displayed amount is read from the Stripe Price
 * object configured for each paid plan. No price configured = "Tarif bientôt
 * disponible" and checkout disabled.
 *
 * Bump PLAN_CONFIG_VERSION whenever the meaning of a limit changes; trials
 * record the version and the limits they started with.
 */
export const PLAN_CONFIG_VERSION = "v1-2026-10";

export type PaidPlanKey = "solo" | "equipe";
export type PlanKey = "trial" | PaidPlanKey;
export const PAID_PLANS: readonly PaidPlanKey[] = ["solo", "equipe"];

export type PlanDefinition = Readonly<{
  key: PlanKey;
  label: string;
  description: string;
  /** Connected mailboxes the plan covers. */
  mailboxes: number;
  /** Reply drafts included per period (trial: for the whole trial). */
  includedDrafts: number;
  /** Hard monthly model-cost cap (estimated cents) synced to inbox_settings. */
  monthlyCapCents: number;
  /** Trial only. */
  trialDays?: number;
  features: readonly string[];
}>;

type Env = Record<string, string | undefined>;
function envInt(env: Env, name: string, fallback: number, min: number, max: number) {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}

export const PLAN_DEFAULTS = Object.freeze({
  trialDays: 14,
  trialDrafts: 50,
  trialCapCents: 800,
  soloDrafts: 300,
  soloMailboxes: 1,
  soloCapCents: 3_000,
  equipeDrafts: 1_500,
  equipeMailboxes: 5,
  equipeCapCents: 15_000,
});

export function planCatalog(env: Env = process.env): Readonly<Record<PlanKey, PlanDefinition>> {
  const trialDays = envInt(env, "ORBIS_TRIAL_DAYS", PLAN_DEFAULTS.trialDays, 1, 90);
  const trialDrafts = envInt(env, "ORBIS_TRIAL_DRAFTS", PLAN_DEFAULTS.trialDrafts, 1, 10_000);
  const solo = envInt(env, "ORBIS_PLAN_SOLO_DRAFTS", PLAN_DEFAULTS.soloDrafts, 1, 100_000);
  const soloBoxes = envInt(env, "ORBIS_PLAN_SOLO_MAILBOXES", PLAN_DEFAULTS.soloMailboxes, 1, 50);
  const equipe = envInt(env, "ORBIS_PLAN_EQUIPE_DRAFTS", PLAN_DEFAULTS.equipeDrafts, 1, 100_000);
  const equipeBoxes = envInt(env, "ORBIS_PLAN_EQUIPE_MAILBOXES", PLAN_DEFAULTS.equipeMailboxes, 1, 50);
  const boxes = (n: number) => `${n} boîte${n > 1 ? "s" : ""} mail connectée${n > 1 ? "s" : ""}`;
  return Object.freeze({
    trial: Object.freeze({
      key: "trial",
      label: "Essai gratuit",
      description: `${trialDays} jours ou ${trialDrafts} brouillons, au premier atteint. Sans carte bancaire.`,
      mailboxes: 1,
      includedDrafts: trialDrafts,
      monthlyCapCents: envInt(env, "ORBIS_TRIAL_CAP_CENTS", PLAN_DEFAULTS.trialCapCents, 0, 1_000_000),
      trialDays,
      features: Object.freeze([boxes(1), `${trialDrafts} brouillons de réponse`, "Modèle d’IA fourni par Orbis", "Rien n’est jamais envoyé sans vous"]),
    }),
    solo: Object.freeze({
      key: "solo",
      label: "Essentiel",
      description: "Pour une personne qui répond aux clients.",
      mailboxes: soloBoxes,
      includedDrafts: solo,
      monthlyCapCents: envInt(env, "ORBIS_PLAN_SOLO_CAP_CENTS", PLAN_DEFAULTS.soloCapCents, 0, 1_000_000),
      features: Object.freeze([boxes(soloBoxes), `${solo} brouillons inclus par mois`, "Brouillons en continu et récapitulatif du jour", "Modèle d’IA fourni par Orbis", "Résiliable à tout moment"]),
    }),
    equipe: Object.freeze({
      key: "equipe",
      label: "Équipe",
      description: "Pour une petite équipe qui partage les demandes clients.",
      mailboxes: equipeBoxes,
      includedDrafts: equipe,
      monthlyCapCents: envInt(env, "ORBIS_PLAN_EQUIPE_CAP_CENTS", PLAN_DEFAULTS.equipeCapCents, 0, 1_000_000),
      features: Object.freeze([boxes(equipeBoxes), `${equipe} brouillons inclus par mois`, "Brouillons en continu et récapitulatif du jour", "Modèle d’IA fourni par Orbis", "Résiliable à tout moment"]),
    }),
  });
}

/**
 * Stripe Price id per paid plan. `STRIPE_PRICE_SOLO_MONTHLY` is unchanged;
 * `STRIPE_PRICE_EQUIPE_MONTHLY` falls back to the legacy
 * `STRIPE_PRICE_BUSINESS_BASE_MONTHLY` so existing test-mode setups keep working.
 */
export function stripePriceId(plan: PaidPlanKey, env: Env = process.env): string | undefined {
  const value =
    plan === "solo"
      ? env.STRIPE_PRICE_SOLO_MONTHLY
      : env.STRIPE_PRICE_EQUIPE_MONTHLY || env.STRIPE_PRICE_BUSINESS_BASE_MONTHLY;
  return value?.trim() || undefined;
}
export function planForPriceId(priceId: string, env: Env = process.env): PaidPlanKey | null {
  for (const plan of PAID_PLANS) if (stripePriceId(plan, env) === priceId) return plan;
  return null;
}
/** Legacy stored values from migrations 002/003 ('Solo'/'Business'). */
export function normalizePlanKey(value: string | null | undefined): PaidPlanKey | null {
  if (value === "solo" || value === "Solo") return "solo";
  if (value === "equipe" || value === "Business") return "equipe";
  return null;
}

/** What the UI shows for a price. Built only from a Stripe Price object. */
export type DisplayPrice = Readonly<{
  amountCents: number;
  currency: string;
  interval: "month";
  /** "exclusive" = hors taxes, "inclusive" = TTC, otherwise unspecified. */
  taxBehavior: "exclusive" | "inclusive" | "unspecified";
}>;
type StripePriceLike = {
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
  tax_behavior?: string | null;
  recurring?: { interval?: string; interval_count?: number; usage_type?: string } | null;
};
/** Null = unusable for a simple monthly subscription (shown as "bientôt disponible"). */
export function displayPriceFrom(price: StripePriceLike | null | undefined): DisplayPrice | null {
  if (!price?.active || typeof price.unit_amount !== "number" || !Number.isSafeInteger(price.unit_amount) || price.unit_amount < 0) return null;
  if (!price.currency || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || (price.recurring.usage_type ?? "licensed") !== "licensed") return null;
  return Object.freeze({
    amountCents: price.unit_amount,
    currency: price.currency.toLowerCase(),
    interval: "month",
    taxBehavior: price.tax_behavior === "exclusive" || price.tax_behavior === "inclusive" ? price.tax_behavior : "unspecified",
  });
}
export const PRICE_UNAVAILABLE = "Tarif bientôt disponible";
export function formatDisplayPrice(price: DisplayPrice | null): string {
  if (!price) return PRICE_UNAVAILABLE;
  const amount = (price.amountCents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: price.amountCents % 100 ? 2 : 0,
  });
  const tax = price.taxBehavior === "exclusive" ? " HT" : price.taxBehavior === "inclusive" ? " TTC" : "";
  return `${amount}${tax} / mois`;
}

/** Plan comparison rows sent to the browser. Checkout only when a valid Stripe price exists. */
export type PlanOffer = {
  key: PaidPlanKey;
  label: string;
  description: string;
  mailboxes: number;
  includedDrafts: number;
  features: readonly string[];
  price: DisplayPrice | null;
  priceLabel: string;
  checkoutAvailable: boolean;
};
export function planOffers(prices: Partial<Record<PaidPlanKey, DisplayPrice | null>>, catalog = planCatalog()): PlanOffer[] {
  return PAID_PLANS.map((key) => {
    const plan = catalog[key];
    const price = prices[key] ?? null;
    return {
      key,
      label: plan.label,
      description: plan.description,
      mailboxes: plan.mailboxes,
      includedDrafts: plan.includedDrafts,
      features: plan.features,
      price,
      priceLabel: formatDisplayPrice(price),
      checkoutAvailable: price !== null,
    };
  });
}
