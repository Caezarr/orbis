export function integer(value: number, name: string, min = 0): number {
  if (!Number.isSafeInteger(value) || value < min)
    throw new Error(`INVALID_${name}`);
  return value;
}

export type TaskRate = Readonly<{
  id: string;
  label: string;
  taskCents: number;
}>;
export type MediaRate = Readonly<{
  id: string;
  label: string;
  unitCents: number;
}>;
export type RateCard = Readonly<{
  version: string;
  currency: "EUR";
  tasks: readonly TaskRate[];
  media: readonly MediaRate[];
}>;

/** Product proposal, not measured costs or a published commercial commitment. */
export const proposedRateCard: RateCard = Object.freeze({
  version: "proposal-2026-09-v1",
  currency: "EUR",
  tasks: Object.freeze(
    [
      { id: "rental-operations", label: "Locations", taskCents: 150 },
      { id: "creator-studio", label: "Créateurs", taskCents: 250 },
      { id: "ecommerce-operations", label: "Commerce", taskCents: 150 },
      { id: "sales-operations", label: "Vente B2B", taskCents: 200 },
      { id: "customer-support", label: "Service client", taskCents: 100 },
      { id: "recruiting-operations", label: "Recrutement", taskCents: 250 },
      { id: "agency-operations", label: "Agences", taskCents: 300 },
      {
        id: "finance-operations",
        label: "Opérations financières",
        taskCents: 300,
      },
      {
        id: "professional-services",
        label: "Services professionnels",
        taskCents: 350,
      },
      { id: "field-services", label: "Services terrain", taskCents: 200 },
    ].map((r) => Object.freeze(r)),
  ),
  media: Object.freeze(
    [
      { id: "image", label: "Image livrée", unitCents: 100 },
      {
        id: "video-5s",
        label: "Séquence vidéo de 5 secondes livrée",
        unitCents: 500,
      },
      { id: "audio-minute", label: "Minute audio livrée", unitCents: 150 },
    ].map((r) => Object.freeze(r)),
  ),
});

export type PlanConfig = Readonly<{
  soloMonthlyCents: number;
  soloIncludedTasks: number;
  soloBudgetCents: number;
  businessMonthlyCents: number;
  businessBaseSeats: number;
  extraSeatCents: number;
  businessIncludedTasks: number;
  businessBudgetCents: number;
  maxSeats: number;
}>;
export const proposedPlans: PlanConfig = Object.freeze({
  soloMonthlyCents: 14900,
  soloIncludedTasks: 50,
  soloBudgetCents: 5000,
  businessMonthlyCents: 39900,
  businessBaseSeats: 5,
  extraSeatCents: 3900,
  businessIncludedTasks: 200,
  businessBudgetCents: 20000,
  maxSeats: 50,
});
export function planQuote(
  plan: "Solo" | "Business",
  seats = 1,
  config = proposedPlans,
) {
  for (const [key, value] of Object.entries(config)) integer(value, key);
  integer(config.businessBaseSeats, "BASE_SEATS", 1);
  integer(seats, "SEATS", 1);
  if (seats > config.maxSeats || (plan === "Solo" && seats !== 1))
    throw new Error("INVALID_SEATS");
  if (plan !== "Solo" && plan !== "Business") throw new Error("INVALID_PLAN");
  return {
    plan,
    seats,
    monthlyCents: integer(
      plan === "Solo"
        ? config.soloMonthlyCents
        : config.businessMonthlyCents +
            Math.max(0, seats - config.businessBaseSeats) *
              config.extraSeatCents,
      "TOTAL",
    ),
    includedTasks:
      plan === "Solo" ? config.soloIncludedTasks : config.businessIncludedTasks,
    suggestedBudgetCents:
      plan === "Solo" ? config.soloBudgetCents : config.businessBudgetCents,
  };
}
