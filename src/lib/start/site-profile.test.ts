import { describe, expect, it } from "vitest";

describe("collapseEchoes", () => {
  it("drops a zone fact repeated inside a longer one, keeps distinct and structured facts", async () => {
    const { collapseEchoes } = await import("./site-profile");
    const f = (value: string, via: "text" | "structured" = "text") => ({
      label: "Zone d’intervention",
      quote: value,
      category: "zone" as const,
      value,
      via,
    });
    const out = collapseEchoes([
      f("métropole lilloise, jusqu’à Tournai"),
      f("métropole lilloise, côté belge, jusqu’à Tournai"),
      f("de Lille à Tournai"),
      f("Lille, Tournai", "structured"),
      f("de Lille à Tournai"),
    ]);
    expect(out.map((x) => x.value)).toEqual([
      "métropole lilloise, côté belge, jusqu’à Tournai",
      "de Lille à Tournai",
      "Lille, Tournai",
    ]);
  });
});
