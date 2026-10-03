import { describe, expect, it, vi } from "vitest";
import { clientKey, createRateLimiter, prepareStartProfile, siteInputSchema } from "./public-site";

const site = {
  website: "https://example.fr/",
  title: "Example SARL — Paysagiste",
  description: "Création et entretien de jardins pour particuliers et copropriétés.",
  excerpt: "Nous intervenons dans toute la métropole lilloise depuis 2009 avec une équipe de six jardiniers.",
  fetchedAt: "2026-10-02T00:00:00.000Z",
};

describe("prepareStartProfile", () => {
  it("reads the site without any model call when AI is disabled", async () => {
    const analyze = vi.fn();
    const p = await prepareStartProfile(
      { website: "example.fr" },
      { readSite: async () => site, analyze, aiEnabled: () => false },
    );
    expect(analyze).not.toHaveBeenCalled();
    expect(p.origin).toBe("site");
    expect(p.name).toBe("Example SARL");
  });
  it("reuses the page already read when AI is enabled (no second fetch)", async () => {
    const readSite = vi.fn(async () => site);
    const analyze = vi.fn(async (_input: unknown, preread?: unknown) => {
      expect(preread).toBe(site);
      return {
        name: "Example",
        summary: "Paysagiste pour particuliers et copropriétés.",
        facts: [{ quote: "Création et entretien de jardins" }],
        questions: ["Quels sont vos tarifs d’entretien ?"],
        workflows: [],
        needsConfirmation: true as const,
      };
    });
    const p = await prepareStartProfile({ website: "example.fr" }, { readSite, analyze, aiEnabled: () => true });
    expect(readSite).toHaveBeenCalledTimes(1);
    expect(p.origin).toBe("ai");
    expect(p.facts[0]).toMatchObject({ quote: "Création et entretien de jardins", sourceUrl: site.website });
    expect(p.unknowns[0]).toBe("Quels sont vos tarifs d’entretien ?");
  });
  it("falls back to the deterministic reading when the model fails", async () => {
    const p = await prepareStartProfile(
      { website: "example.fr" },
      { readSite: async () => site, analyze: async () => Promise.reject(new Error("x")), aiEnabled: () => true },
    );
    expect(p.origin).toBe("site");
  });
  it("propagates unreadable sites to the route", async () => {
    await expect(
      prepareStartProfile({ website: "example.fr" }, { readSite: async () => Promise.reject(new Error("no")), aiEnabled: () => false }),
    ).rejects.toThrow();
  });
  it("accepts a two-sentence description without network", async () => {
    const readSite = vi.fn();
    const p = await prepareStartProfile(
      { description: "Cabinet d’expertise comptable à Lens. Nous accompagnons artisans et commerçants.", name: "Cabinet Martin" },
      { readSite, aiEnabled: () => false },
    );
    expect(readSite).not.toHaveBeenCalled();
    expect(p.name).toBe("Cabinet Martin");
    expect(p.origin).toBe("description");
  });
  it("rejects inputs mixing fields or carrying extra keys", () => {
    expect(siteInputSchema.safeParse({ website: "a.fr", tenantId: "t" }).success).toBe(false);
    expect(siteInputSchema.safeParse({ description: "short" }).success).toBe(false);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then refuses with a retry delay", () => {
    const l = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(l.take("a", 0).allowed).toBe(true);
    expect(l.take("a", 10).allowed).toBe(true);
    const third = l.take("a", 20);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBe(980);
    expect(l.take("b", 20).allowed).toBe(true);
    expect(l.take("a", 1001).allowed).toBe(true);
  });
  it("bounds memory by evicting old keys", () => {
    const l = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    l.take("a", 0);
    l.take("b", 0);
    l.take("c", 0);
    expect(l.take("a", 1).allowed).toBe(true);
  });
  it("derives a bounded client key from forwarding headers", () => {
    const r = new Request("https://x.test/", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } });
    expect(clientKey(r)).toBe("203.0.113.9");
    expect(clientKey(new Request("https://x.test/"))).toBe("unknown");
  });
});
