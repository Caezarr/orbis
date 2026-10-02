import type { PaidPlanKey } from "./plans";

export type CheckoutInput = { plan: PaidPlanKey; requestId: string };
/** No coercion, client price IDs, amounts or client tenant identifiers. */
export function checkoutInput(value: unknown): CheckoutInput {
  if (!value || typeof value !== "object") throw new Error("INVALID_CHECKOUT");
  const body = value as Record<string, unknown>;
  if (body.plan !== "solo" && body.plan !== "equipe") throw new Error("INVALID_PLAN");
  if (typeof body.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)) throw new Error("INVALID_REQUEST_ID");
  return { plan: body.plan, requestId: body.requestId };
}
