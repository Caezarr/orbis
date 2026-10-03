import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({ retrieve: vi.fn() }));
vi.mock("stripe", () => ({ default: class { prices = { retrieve: mock.retrieve }; } }));
import {
  displayPriceFrom,
  formatDisplayPrice,
  planCatalog,
  planForPriceId,
  planOffers,
  PRICE_UNAVAILABLE,
  stripePriceId,
} from "./plans";
import { clearPriceCache, displayPrices } from "./stripe";
import { bannerFor, type EntitlementView } from "./view";
import { PlansView, type BillingData } from "@/components/billing/SubscriptionPlans";
import { PlanBannerView } from "@/components/billing/PlanBanner";

const price = (over = {}) => ({ active: true, currency: "eur", unit_amount: 4900, tax_behavior: "exclusive", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, ...over });
beforeEach(() => {
  vi.resetAllMocks();
  clearPriceCache();
});
afterEach(() => vi.unstubAllEnvs());

describe("plan config", () => {
  it("has the documented defaults", () => {
    const c = planCatalog({});
    expect([c.trial.trialDays, c.trial.includedDrafts, c.solo.includedDrafts, c.solo.mailboxes, c.equipe.mailboxes]).toEqual([14, 50, 300, 1, 5]);
  });
  it("reads limits from env and ignores invalid values", () => {
    const c = planCatalog({ ORBIS_TRIAL_DAYS: "7", ORBIS_TRIAL_DRAFTS: "abc", ORBIS_PLAN_SOLO_DRAFTS: "-3", ORBIS_PLAN_EQUIPE_CAP_CENTS: "20000" });
    expect([c.trial.trialDays, c.trial.includedDrafts, c.solo.includedDrafts, c.equipe.monthlyCapCents]).toEqual([7, 50, 300, 20000]);
  });
  it("keeps the legacy Business env name compatible for the equipe price", () => {
    expect(stripePriceId("equipe", { STRIPE_PRICE_BUSINESS_BASE_MONTHLY: "price_b" })).toBe("price_b");
    expect(stripePriceId("equipe", { STRIPE_PRICE_EQUIPE_MONTHLY: "price_e", STRIPE_PRICE_BUSINESS_BASE_MONTHLY: "price_b" })).toBe("price_e");
    expect(planForPriceId("price_s", { STRIPE_PRICE_SOLO_MONTHLY: "price_s" })).toBe("solo");
    expect(planForPriceId("other", { STRIPE_PRICE_SOLO_MONTHLY: "price_s" })).toBeNull();
  });
  it("no € amount anywhere in the plan config", () => {
    expect(JSON.stringify(planCatalog({}))).not.toMatch(/€|EUR/);
  });
});

describe("prices from Stripe", () => {
  it("formats a valid monthly price", () => {
    expect(formatDisplayPrice(displayPriceFrom(price()))).toMatch(/^49\s€ HT \/ mois$/);
    expect(formatDisplayPrice(displayPriceFrom(price({ unit_amount: 7950, tax_behavior: "inclusive" })))).toMatch(/^79,50\s€ TTC \/ mois$/);
  });
  it.each([null, price({ active: false }), price({ unit_amount: null }), price({ recurring: { interval: "year", interval_count: 1 } }), price({ recurring: { interval: "month", interval_count: 1, usage_type: "metered" } })])(
    "unusable price → 'Tarif bientôt disponible' %#",
    (p) => expect(formatDisplayPrice(displayPriceFrom(p))).toBe(PRICE_UNAVAILABLE),
  );
  it("without a Stripe key or price ids: no network call, every price unavailable", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await displayPrices()).toEqual({ solo: null, equipe: null });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_PRICE_SOLO_MONTHLY", "");
    vi.stubEnv("STRIPE_PRICE_EQUIPE_MONTHLY", "");
    vi.stubEnv("STRIPE_PRICE_BUSINESS_BASE_MONTHLY", "");
    expect(await displayPrices()).toEqual({ solo: null, equipe: null });
    expect(mock.retrieve).not.toHaveBeenCalled();
  });
  it("reads configured prices (mocked Stripe), caches them, survives a Stripe error", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_PRICE_SOLO_MONTHLY", "price_s");
    vi.stubEnv("STRIPE_PRICE_EQUIPE_MONTHLY", "price_e");
    mock.retrieve.mockImplementation(async (id: string) => {
      if (id === "price_e") throw new Error("network");
      return price();
    });
    const first = await displayPrices(1000);
    expect(first.solo?.amountCents).toBe(4900);
    expect(first.equipe).toBeNull();
    await displayPrices(2000);
    expect(mock.retrieve.mock.calls.filter(([id]) => id === "price_s")).toHaveLength(1);
    expect(mock.retrieve.mock.calls.filter(([id]) => id === "price_e")).toHaveLength(2);
  });
  it("offers allow checkout only with a price", () => {
    const offers = planOffers({ solo: displayPriceFrom(price()), equipe: null }, planCatalog({}));
    expect(offers.map((o) => [o.key, o.checkoutAvailable, o.priceLabel.includes("€")])).toEqual([
      ["solo", true, true],
      ["equipe", false, false],
    ]);
    expect(offers[1].priceLabel).toBe(PRICE_UNAVAILABLE);
  });
});

const view = (over: Partial<EntitlementView> = {}): EntitlementView => ({
  enforced: true,
  state: "trialing",
  plan: "trial",
  planLabel: "Essai gratuit",
  canProcess: true,
  draftsUsed: 8,
  draftsIncluded: 50,
  draftsRemaining: 42,
  mailboxes: 1,
  trialStarted: true,
  trialDaysRemaining: 9,
  cancelAtPeriodEnd: false,
  continuousPaused: false,
  ...over,
});
const data = (over: Partial<BillingData> = {}): BillingData => ({
  configured: true,
  canManage: true,
  hasCustomer: false,
  subscription: null,
  entitlement: view(),
  offers: planOffers({ solo: null, equipe: null }, planCatalog({})),
  trial: { days: 14, drafts: 50, features: planCatalog({}).trial.features },
  taskBilling: false,
  ...over,
});

describe("billing UI", () => {
  it("trial banner shows days and drafts left", () => {
    expect(bannerFor(view())?.title).toBe("Essai : 9 jours / 42 brouillons restants");
    expect(renderToStaticMarkup(createElement(PlanBannerView, { view: view() }))).toContain("Essai : 9 jours / 42 brouillons restants");
  });
  it("blocked states are explicit and point to the plans page", () => {
    const quota = bannerFor(view({ plan: "solo", state: "active", canProcess: false, reason: "quota_reached", draftsUsed: 300, draftsIncluded: 300, draftsRemaining: 0, periodEnd: "2026-11-05T00:00:00.000Z", continuousPaused: true }));
    expect(quota).toMatchObject({ tone: "blocked", title: "Quota atteint : 300/300 brouillons ce mois-ci." });
    expect(quota?.body).toContain("pause");
    expect(bannerFor(view({ state: "past_due", plan: "solo", canProcess: false, reason: "past_due", message: "x" }))?.cta).toBe("Gérer mon abonnement");
    expect(bannerFor(view({ state: "expired", canProcess: false, reason: "trial_expired", message: "fin" }))?.title).toBe("Essai terminé.");
  });
  it("is silent for a comfortable paid plan or when enforcement is off", () => {
    expect(bannerFor(view({ plan: "solo", state: "active", draftsUsed: 10, draftsIncluded: 300, draftsRemaining: 290 }))).toBeNull();
    expect(bannerFor(view({ enforced: false }))).toBeNull();
  });
  it("without Stripe prices: 'Tarif bientôt disponible', no € amount and checkout disabled", () => {
    const html = renderToStaticMarkup(createElement(PlansView, { data: data(), onCheckout: () => undefined }));
    expect(html.match(/Tarif bientôt disponible/g)).toHaveLength(2);
    expect(html).not.toMatch(/\d\s?€/);
    expect(html.match(/<button[^>]*disabled=""[^>]*>Bientôt disponible<\/button>/g)).toHaveLength(2);
  });
  it("with a Stripe price: shows it and enables checkout for owners/admins only", () => {
    const offers = planOffers({ solo: displayPriceFrom(price()), equipe: null }, planCatalog({}));
    const html = renderToStaticMarkup(createElement(PlansView, { data: data({ offers }), onCheckout: () => undefined }));
    expect(html).toMatch(/49\s€ HT \/ mois/);
    expect(html).toMatch(/<button type="button" class="[^"]*">Choisir Essentiel<\/button>/);
    const member = renderToStaticMarkup(createElement(PlansView, { data: data({ offers, canManage: false }), onCheckout: () => undefined }));
    expect(member).toMatch(/disabled="">Choisir Essentiel/);
    expect(member).toContain("Seul un propriétaire");
  });
  it("live subscription: portal link to cancel, no second checkout", () => {
    const offers = planOffers({ solo: displayPriceFrom(price()), equipe: displayPriceFrom(price()) }, planCatalog({}));
    const html = renderToStaticMarkup(
      createElement(PlansView, { data: data({ offers, hasCustomer: true, subscription: { plan: "solo", status: "active" }, entitlement: view({ plan: "solo", state: "active", trialStarted: false }) }), onCheckout: () => undefined, onPortal: () => undefined }),
    );
    expect(html).toContain("Gérer l’abonnement, les factures ou résilier");
    expect(html).toContain("Votre formule actuelle");
    expect(html).toMatch(/disabled="">Choisir Équipe/);
  });
});
