import { describe, expect, it } from "vitest";
import { scrubVital } from "./speed-insights";

describe("scrubVital", () => {
  it("drops the query string and fragment", () => {
    expect(scrubVital({ type: "vital", url: "https://app.orbis.fr/plans?id=batch_123&flow=tasks#pay" })).toEqual({
      type: "vital",
      url: "https://app.orbis.fr/plans",
    });
    expect(scrubVital({ type: "vital", url: "https://app.orbis.fr/login?returnTo=%2Frelances%3Fcontact%3DDupont" })?.url).toBe(
      "https://app.orbis.fr/login",
    );
  });

  it("replaces id-like path segments in the url and the route", () => {
    const out = scrubVital({
      type: "vital",
      url: "https://app.orbis.fr/missions/42/claire.martin%40client.fr",
      route: "/missions/[id]/claire.martin@client.fr",
    });
    expect(out?.url).toBe("https://app.orbis.fr/missions/[id]/[id]");
    expect(out?.route).toBe("/missions/[id]/[id]");
    expect(JSON.stringify(out)).not.toMatch(/claire|martin|client\.fr/);
  });

  it("keeps the home page and plain routes", () => {
    expect(scrubVital({ type: "vital", url: "https://app.orbis.fr/" })?.url).toBe("https://app.orbis.fr/");
    expect(scrubVital({ type: "vital", url: "https://app.orbis.fr/start", route: "/start" })).toEqual({
      type: "vital",
      url: "https://app.orbis.fr/start",
      route: "/start",
    });
  });

  it("drops unparsable or non-http urls", () => {
    expect(scrubVital({ type: "vital", url: "not a url" })).toBeNull();
    expect(scrubVital({ type: "vital", url: "javascript:alert(1)" })).toBeNull();
  });
});
