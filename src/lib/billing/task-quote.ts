import { integer, proposedRateCard, type RateCard } from "./rates";

export type TaskPriceSnapshot = Readonly<{
  workflowId: string;
  taskId: string;
  quantity: number;
  currency: "EUR";
  unitPriceCents: number;
  totalCents: number;
  rateVersion: string;
  billableOutcome: "completed_task";
}>;
export type TaskQuoteConfig = {
  rateCard?: RateCard;
  /** Explicit runtime workflow -> rate ID mapping; unknown workflows never get a fallback price. */
  workflowRates?: Readonly<Record<string, string>>;
};
export const workflowRateAliases: Readonly<Record<string, string>> =
  Object.freeze({
    commerce: "ecommerce-operations",
    "b2b-sales": "sales-operations",
    recruiting: "recruiting-operations",
    agencies: "agency-operations",
  });
/** Fixed price for each completed task, independent of attempts. Media is excluded.
 * taskId is a generic task type; persistence must also key the business outcome instance.
 */
export function getTaskQuote(
  {
    workflowId,
    taskId,
    quantity = 1,
  }: { workflowId: string; taskId: string; quantity?: number },
  { rateCard = proposedRateCard, workflowRates }: TaskQuoteConfig = {},
): TaskPriceSnapshot {
  for (const id of [workflowId, taskId, rateCard.version]) {
    if (typeof id !== "string" || !id.trim() || id.length > 250)
      throw new Error("INVALID_ID");
  }
  integer(quantity, "QUANTITY", 1);
  if (rateCard.currency !== "EUR") throw new Error("INVALID_CURRENCY");
  const mapping = workflowRates ?? workflowRateAliases;
  const rateId = Object.hasOwn(mapping, workflowId)
    ? mapping[workflowId]
    : workflowId;
  const matches = rateCard.tasks.filter((r) => r.id === rateId);
  if (matches.length !== 1)
    throw new Error("UNKNOWN_OR_AMBIGUOUS_WORKFLOW_RATE");
  const unitPriceCents = integer(matches[0].taskCents, "CENTS");
  return Object.freeze({
    workflowId,
    taskId,
    quantity,
    currency: "EUR",
    unitPriceCents,
    totalCents: integer(unitPriceCents * quantity, "TOTAL"),
    rateVersion: rateCard.version,
    billableOutcome: "completed_task",
  });
}
