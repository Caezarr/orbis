import { describe, expect, it } from "vitest";
import { checkoutInput } from "./checkout-input";

const requestId = "123e4567-e89b-42d3-a456-426614174000";
describe("subscription checkout input", () => {
  it("accepts the V1 plan keys only", () => {
    expect(checkoutInput({ plan: "solo", requestId })).toEqual({ plan: "solo", requestId });
    expect(checkoutInput({ plan: "equipe", requestId })).toEqual({ plan: "equipe", requestId });
  });
  it.each([null, {}, { plan: "Partner", requestId }, { plan: "Solo", requestId }, { plan: "Business", requestId }, { plan: "trial", requestId }, { plan: "solo", requestId: "reuse" }])(
    "rejects malformed purchase %j",
    (value) => expect(() => checkoutInput(value)).toThrow(),
  );
  it("ignores client tenant, price and amount fields", () => {
    expect(checkoutInput({ plan: "solo", requestId, tenantId: "other", price: "free", amount: 0 })).toEqual({ plan: "solo", requestId });
  });
});
