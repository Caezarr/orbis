import { describe, it, expect } from "vitest";
import { suggestMissions } from "./conversation";
describe("conversation suggestions", () => {
  it("matches quotes in English and French", () => {
    for (const text of [
      "Help me prepare a quote",
      "Préparer des devis à partir des demandes clients et de notre catalogue de prix.",
    ])
      expect(
        suggestMissions(text).some((r) => r.flow.title.includes("devis")),
      ).toBe(true);
  });
  it("does not invent a match for unknown or empty requests", () => {
    expect(suggestMissions("")).toEqual([]);
    expect(suggestMissions("xyzxyzxyz")).toEqual([]);
  });
});
