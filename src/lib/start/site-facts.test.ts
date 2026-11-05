import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { likelyQuestions, unknownsFor } from "./flow";
import { belgianNumberValid, extractFacts, frenchVatValid, luhn, phoneValid, quoteAround, type ExtractedFact } from "./site-facts";
import { pageCorpus, parseSitePage, type SitePage } from "./site-page";

const fixture = (name: string, url: string) =>
  parseSitePage(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"), url);

const plombier = [
  fixture("plombier-home.html", "https://www.martin-plomberie.fr/"),
  fixture("plombier-tarifs.html", "https://www.martin-plomberie.fr/tarifs"),
  fixture("plombier-mentions.html", "https://www.martin-plomberie.fr/mentions-legales"),
];
const comptable = [fixture("comptable-home.html", "https://www.cabinet-leroy.fr/")];
const belge = [fixture("belge-home.html", "https://www.menuiserie-dubois.be/")];

const of = (facts: ExtractedFact[], category: string) => facts.filter((f) => f.category === category);
const values = (facts: ExtractedFact[], category: string) => of(facts, category).map((f) => f.value);

/** Invariant: every text/meta quote is a verbatim span of the page it cites. */
function expectVerbatim(facts: ExtractedFact[], pages: SitePage[]) {
  const ws = (s: string) => s.replace(/\s+/g, " ");
  for (const f of facts) {
    const page = pages.find((p) => p.url === f.sourceUrl);
    expect(page, f.label).toBeDefined();
    if (f.via === "text" || f.via === "meta") expect(ws(pageCorpus(page as SitePage)), `${f.label}: ${f.quote}`).toContain(ws(f.quote));
  }
}

describe("French artisan (plumber, 3 pages)", () => {
  const { facts } = extractFacts(plombier);
  it("keeps every quote verbatim with its page", () => expectVerbatim(facts, plombier));
  it("finds the intervention zone: radius and « de X à Y »", () => {
    const zone = of(facts, "zone")[0];
    expect(zone.value).toContain("de Béthune à Douai");
    expect(zone.value).toContain("rayon de 30 km");
    expect(zone.quote).toContain("Nous intervenons dans un rayon de 30 km autour de Lens");
    expect(zone.confidence).toBe("high");
  });
  it("lists services from the services section with their description", () => {
    expect(values(facts, "services")).toEqual(["Dépannage plomberie", "Rénovation de salle de bains", "Entretien de chaudière"]);
    expect(of(facts, "services")[1].quote).toMatch(/^Douche à l’italienne/);
  });
  it("reads prices, free quote and delays", () => {
    expect(values(facts, "prices")).toEqual(
      expect.arrayContaining(["Devis gratuit et sans engagement", "à partir de 89 € TTC", "55 € HT / heure"]),
    );
    expect(values(facts, "delays")).toContain("intervention sous 48h");
  });
  it("reads contact, address split over two lines, opening hours", () => {
    expect(values(facts, "contact")).toEqual(expect.arrayContaining(["03 21 45 67 89", "contact@martin-plomberie.fr"]));
    // tel: link and visible number are the same phone: one fact.
    expect(of(facts, "contact").filter((f) => f.label === "Téléphone")).toHaveLength(1);
    expect(of(facts, "address")[0]).toMatchObject({ value: "12 rue de la Gare, 62300 Lens", quote: "12 rue de la Gare 62300 Lens" });
    expect(of(facts, "hours")[0].value).toContain("Du lundi au vendredi de 8h à 18h");
  });
  it("reads certifications, legal identifiers (checksums) and history", () => {
    expect(values(facts, "certifications")).toEqual(expect.arrayContaining(["RGE", "Assurance décennale"]));
    const legal = Object.fromEntries(of(facts, "legal").map((f) => [f.label, f.value]));
    expect(legal).toMatchObject({
      SIRET: "732 829 320 00017",
      SIREN: "732 829 320",
      "N° de TVA": "FR44732829320",
      "Forme juridique": "SARL",
      Immatriculation: "RCS Arras",
    });
    expect(values(facts, "history")).toContain("depuis 2009");
  });
  it("ignores the web host's identifiers and template placeholders in the legal notice", () => {
    expect(facts.some((f) => /OVH|424 761 419|09 72 10 10 07|Kellermann/.test(`${f.value} ${f.quote}`))).toBe(false);
    expect(facts.some((f) => /à compléter/.test(f.quote))).toBe(false);
  });
  it("reads the site FAQ and social links, not share buttons", () => {
    expect(values(facts, "faq")).toEqual(["Le devis est-il payant ?", "Intervenez-vous le dimanche ?"]);
    expect(of(facts, "social").map((f) => f.quote)).toEqual(["https://www.facebook.com/martinplomberie"]);
    expect(of(facts, "social").map((f) => f.value)).toEqual(["facebook.com/martinplomberie"]);
    expect(values(facts, "audience")[0]).toBe("particuliers, professionnels");
  });
  it("lists as unknown only what was not found", () => {
    expect(unknownsFor(facts)).toEqual([]);
  });
});

describe("French services firm (schema.org JSON-LD)", () => {
  const ex = extractFacts(comptable);
  const { facts } = ex;
  it("reads LocalBusiness, opening hours specification and FAQPage", () => {
    expect(ex.name).toBe("Cabinet Leroy");
    expect(values(facts, "activity")).toContain("Expertise comptable");
    expect(values(facts, "contact")).toEqual(expect.arrayContaining(["+33 3 20 12 34 56", "bonjour@cabinet-leroy.fr"]));
    expect(values(facts, "address")).toEqual(["8 place du Théâtre, 59000 Lille, FR"]);
    expect(of(facts, "hours")[0]).toMatchObject({
      value: "lundi, mardi, mercredi, jeudi, vendredi 09:00-18:00",
      via: "structured",
    });
    expect(values(facts, "faq")).toEqual(["Combien coûte la tenue de comptabilité ?"]);
    expect(values(facts, "history")).toEqual(expect.arrayContaining(["Créée en 1998", "depuis plus de 25 ans"]));
    expect(values(facts, "zone")).toEqual(["métropole lilloise"]);
    expect(values(facts, "delays")).toEqual(["sous 24 heures"]);
  });
  it("drops hidden text and instruction-like text (page and JSON-LD) before any extraction", () => {
    const all = JSON.stringify(facts);
    expect(all).not.toMatch(/ignore|developer mode|banque|bank|evil@|remise|désormais/i);
    expect(comptable[0].instructionsRemoved).toBeGreaterThanOrEqual(1);
    expect(pageCorpus(comptable[0])).not.toMatch(/Ignore previous|Texte caché|désormais/);
  });
  it("leaves services and prices unknown when the page does not state them", () => {
    expect(unknownsFor(facts)).toEqual(expect.arrayContaining(["Vos tarifs ou fourchettes de prix", "Le détail de vos prestations"]));
    expect(unknownsFor(facts)).not.toContain("Votre zone d’intervention");
  });
});

describe("Belgian SMB", () => {
  const { facts } = extractFacts(belge);
  it("keeps every quote verbatim", () => expectVerbatim(facts, belge));
  it("reads Belgian zone, phone, address, VAT and legal form", () => {
    expect(of(facts, "zone")[0].value).toBe("de Mouscron à Mons, province de Hainaut");
    expect(values(facts, "contact")).toEqual(expect.arrayContaining(["+32 475 12 34 56", "info@menuiserie-dubois.be"]));
    expect(values(facts, "address")).toEqual(["Rue de la Station 12, 7500 Tournai"]);
    const legal = Object.fromEntries(of(facts, "legal").map((f) => [f.label, f.value]));
    expect(legal).toMatchObject({ "N° de TVA": "BE 0476.123.411", "Forme juridique": "SRL" });
    expect(values(facts, "history")).toEqual(["fondé en 1987"]);
    expect(values(facts, "delays")).toEqual(["délai de fabrication de 6 semaines"]);
    expect(values(facts, "certifications")).toEqual(["Accès à la profession"]);
  });
  it("does not mistake « sur rendez-vous » for opening hours", () => {
    expect(of(facts, "hours")).toHaveLength(1);
  });
});

describe("validators and quoting", () => {
  it("checks SIREN/SIRET (Luhn), French VAT key, Belgian mod 97 and phone formats", () => {
    expect(luhn("732829320")).toBe(true);
    expect(luhn("732829321")).toBe(false);
    expect(frenchVatValid("FR44732829320")).toBe(true);
    expect(frenchVatValid("FR45732829320")).toBe(false);
    expect(belgianNumberValid("0476.123.411")).toBe(true);
    expect(belgianNumberValid("0476.123.412")).toBe(false);
    expect(phoneValid("07 87 30 74 73")).toBe(true);
    expect(phoneValid("+33 7 87 30 74 73")).toBe(true);
    expect(phoneValid("+32 475 12 34 56")).toBe(true);
    expect(phoneValid("979 546 850")).toBe(false);
  });
  it("drops a list ordinal glued to the quoted item, keeps real figures", () => {
    const t = "3 Vous recevez le devis Gratuit, détaillé et sans engagement.";
    const at = t.indexOf("Gratuit");
    expect(quoteAround(t, at, at + 7)).toBe("Vous recevez le devis Gratuit, détaillé et sans engagement.");
    const real = "15 ans d’expérience en peinture.";
    expect(quoteAround(real, real.indexOf("peinture"), real.indexOf("peinture") + 8)).toBe(real);
    const year = "2020 Création de l’entreprise.";
    expect(quoteAround(year, 5, 13)).toBe(year);
  });
  it("quotes the sentence around a match, verbatim, bounded", () => {
    const t = "Tél. : 03 21. Nous intervenons de Lille à Tournai. Devis gratuit.";
    const at = t.indexOf("de Lille");
    expect(quoteAround(t, at, at + 18)).toBe("Nous intervenons de Lille à Tournai.");
    const long = `${"mot ".repeat(200)}cible ${"mot ".repeat(200)}`;
    const q = quoteAround(long, long.indexOf("cible"), long.indexOf("cible") + 5, 80);
    expect(q.length).toBeLessThanOrEqual(80);
    expect(long).toContain(q);
    expect(q).toContain("cible");
  });
  it("does not read days or months as places", () => {
    const page = parseSitePage("<p>Ouvert de Lundi à Vendredi, de janvier à Mars.</p>", "https://x.fr/");
    expect(of(extractFacts([page]).facts, "zone")).toHaveLength(0);
  });
});

describe("likely questions (level-1 preview without a model)", () => {
  it("answers only from sourced facts, site FAQ first, and marks the rest « à confirmer »", () => {
    const { facts } = extractFacts(belge);
    const qs = likelyQuestions({ facts });
    expect(qs).toHaveLength(10);
    const zone = qs.find((q) => q.category === "zone");
    expect(zone?.answer?.quote).toContain("de Mouscron à Mons");
    expect(zone?.answer?.sourceUrl).toBe("https://www.menuiserie-dubois.be/");
    expect(qs.find((q) => q.question === "Quels sont vos tarifs ?")?.answer).toBeNull();
    for (const q of qs) if (q.answer) expect(facts.some((f) => f.quote === q.answer?.quote)).toBe(true);
    const faq = likelyQuestions(extractFacts(plombier));
    expect(faq[0]).toMatchObject({ question: "Le devis est-il payant ?", category: "faq" });
    expect(faq.find((q) => q.category === "services")?.answer?.quote).toBe(
      "Dépannage plomberie · Rénovation de salle de bains · Entretien de chaudière",
    );
  });
  it("uses the owner's correction instead of the site quote", () => {
    const qs = likelyQuestions({
      facts: [{ label: "Zone", quote: "Lille", category: "zone", value: "Lille", sourceUrl: "https://x.fr/", corrected: "Lille et Roubaix" }],
    });
    expect(qs.find((q) => q.category === "zone")?.answer).toEqual({ quote: "Lille et Roubaix", sourceName: "Corrigé par vous" });
  });
});
