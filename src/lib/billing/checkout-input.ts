export type CheckoutInput = { plan: "Solo" | "Business"; seats: number; requestId: string };
/** No coercion, clamping, client price IDs or client tenant identifiers. */
export function checkoutInput(value: unknown): CheckoutInput {
  if (!value || typeof value !== "object") throw new Error("INVALID_CHECKOUT");
  const body = value as Record<string, unknown>;
  if (body.plan !== "Solo" && body.plan !== "Business") throw new Error("INVALID_PLAN");
  const seats = body.seats ?? (body.plan === "Solo" ? 1 : 5);
  if (typeof seats !== "number" || !Number.isSafeInteger(seats) || seats < 1 || seats > 50 || (body.plan === "Solo" && seats !== 1)) throw new Error("INVALID_SEATS");
  if (typeof body.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)) throw new Error("INVALID_REQUEST_ID");
  return { plan: body.plan, seats, requestId: body.requestId };
}
