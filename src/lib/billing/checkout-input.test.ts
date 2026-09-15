import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutInput } from "./checkout-input";
import { appUrl } from "./stripe";
const requestId = "1fad9064-69ce-4ab4-8959-9baed7294454";
afterEach(() => vi.unstubAllEnvs());
describe("checkout input", () => {
  it("allows only server-known plans and valid seats", () => {
    expect(checkoutInput({ plan: "Business", seats: 7, requestId })).toEqual({ plan: "Business", seats: 7, requestId });
    expect(checkoutInput({ plan: "Solo", requestId }).seats).toBe(1);
  });
  it.each([null, {}, {plan: "Partner", requestId}, {plan: "Solo", seats: 2, requestId}, {plan: "Business", seats: 0, requestId}, {plan: "Business", seats: 51, requestId}, {plan: "Business", seats: 2.5, requestId}, {plan: "Business", seats: "5", requestId}, {plan: "Solo", requestId: "reuse"}])("rejects malformed purchase %j", value => expect(() => checkoutInput(value)).toThrow());
  it("discards tenant and price injection", () => {
    expect(checkoutInput({plan: "Solo", requestId, tenantId: "other", price: "free"})).toEqual({plan: "Solo", seats: 1, requestId});
  });
});
describe("checkout return origin", () => {
  it("requires explicit origin instead of returning a localhost link", () => {
    vi.stubEnv("ORBIS_APP_URL", "");
    expect(() => appUrl()).toThrow();
  });
  it("normalizes HTTPS and excludes path", () => {
    vi.stubEnv("ORBIS_APP_URL", "https://orbis.example/settings");
    expect(appUrl()).toBe("https://orbis.example");
  });
  it.each(["http://orbis.example", "https://user:password@orbis.example", "javascript:alert(1)"])("rejects unsafe origin %s", origin => {
    vi.stubEnv("ORBIS_APP_URL", origin);
    expect(() => appUrl()).toThrow();
  });
});
