import { describe, expect, it } from "vitest";
import type { StartProfile } from "./flow";
import { topUp } from "./preview";
import { toCompanyProfile } from "./workspace";

const profile: StartProfile = {
  name: "MDK Peinture",
  summary: "Peintre en bâtiment à Allennes-les-Marais.",
  website: "https://www.mdkpeinture.com/",
  origin: "site",
  unknowns: ["Vos délais et disponibilités"],
  facts: [
    { label: "Réseau", quote: "https://www.facebook.com/x", category: "social", value: "Facebook", via: "link", sourceUrl: "https://www.mdkpeinture.com/" },
    {
      label: "Zone d’intervention",
      quote: "Peintre en bâtiment de Lille à Tournai.",
      category: "zone",
      value: "de Lille à Tournai",
      via: "meta",
      confidence: "high",
      sourceUrl: "https://www.mdkpeinture.com/",
    },
    { label: "Prix et devis", quote: "Le devis est gratuit.", category: "prices", value: "Devis gratuit", corrected: "Devis gratuit sous 48 h", sourceUrl: "https://www.mdkpeinture.com/" },
    { label: "Horaires", quote: "Du lundi au vendredi, 8h-18h", category: "hours", value: "Du lundi au vendredi, 8h-18h", via: "owner", sourceUrl: "https://evil.example/" },
  ],
};

describe("toCompanyProfile (step 1 → workspace profile)", () => {
  const company = toCompanyProfile(profile, "t1");
  it("orders claims by usefulness and keeps quotes, corrections and owner answers distinct", () => {
    const facts = company.claims.filter((c) => c.kind === "fact");
    expect(facts.map((c) => c.label)).toEqual(["Zone d’intervention", "Prix et devis", "Horaires", "Réseau"]);
    expect(facts[0]).toMatchObject({ value: "Peintre en bâtiment de Lille à Tournai.", sourceUrl: "https://www.mdkpeinture.com/", confidence: 1 });
    expect(facts[1].value).toBe("Devis gratuit sous 48 h (corrigé par vous)");
    // Owner words never carry a (possibly forged) source URL.
    expect(facts[2]).toMatchObject({ value: "Du lundi au vendredi, 8h-18h (indiqué par vous)", sourceUrl: undefined });
    expect(company.claims.find((c) => c.kind === "missing")?.value).toBe("Vos délais et disponibilités");
  });
});

describe("topUp (AI preview)", () => {
  it("adds only sourced deterministic questions after the model ones, up to 10", () => {
    const out = topUp([{ question: "Intervenez-vous dans mon secteur ?", answer: null }], profile);
    expect(out[0]).toEqual({ question: "Intervenez-vous dans mon secteur ?", answer: null });
    expect(out.every((q, i) => i === 0 || q.answer)).toBe(true);
    expect(out.filter((q) => q.question === "Intervenez-vous dans mon secteur ?")).toHaveLength(1);
    expect(out.length).toBeLessThanOrEqual(10);
  });
});
