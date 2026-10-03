import { describe, expect, it } from "vitest";
import { FOCUSED_NAV, FROZEN_ROUTES, frozenRedirect, frozenSurfacesEnabled, isActive, navItems } from "./surfaces";

describe("frozen surfaces flag", () => {
  it("is off unless explicitly enabled", () => {
    expect(frozenSurfacesEnabled({})).toBe(false);
    expect(frozenSurfacesEnabled({ ORBIS_FROZEN_SURFACES_ENABLED: "1" })).toBe(false);
    expect(frozenSurfacesEnabled({ ORBIS_FROZEN_SURFACES_ENABLED: "true" })).toBe(true);
  });
});

describe("frozenRedirect", () => {
  it("redirects frozen routes and their sub-routes", () => {
    expect(frozenRedirect("/catalog", false)).toBe("/start");
    expect(frozenRedirect("/catalog/lead-qualification", false)).toBe("/start");
    expect(frozenRedirect("/missions/m1/lab", false)).toBe("/today");
    expect(frozenRedirect("/knowledge/scopes", false)).toBe("/fiche");
    expect(frozenRedirect("/analytics", false)).toBe("/rapport");
    expect(frozenRedirect("/connections", false)).toBe("/settings");
    expect(frozenRedirect("/chat", false)).toBe("/today");
  });
  it("keeps the wedge, account and public pages reachable", () => {
    for (const path of [
      "/today",
      "/demandes",
      "/relances",
      "/fiche",
      "/rapport",
      "/settings",
      "/billing",
      "/start",
      "/login",
      "/legal/cgu",
      "/",
      "/api/v1/inbox/today",
      "/catalogue-x",
      "/chatter",
    ])
      expect(frozenRedirect(path, false)).toBeNull();
  });
  it("never redirects when frozen surfaces are enabled", () => {
    for (const [prefix] of FROZEN_ROUTES) expect(frozenRedirect(prefix, true)).toBeNull();
  });
  it("never redirects to another frozen route (no loop)", () => {
    for (const [, target] of FROZEN_ROUTES) expect(frozenRedirect(target, false)).toBeNull();
  });
});

describe("navigation", () => {
  it("follows the wedge order in French", () => {
    expect(navItems(false).map((i) => i.label)).toEqual([
      "Aujourd’hui",
      "Demandes",
      "Relances",
      "Fiche entreprise",
      "Rapport",
      "Réglages",
    ]);
  });
  it("only links to reachable pages in focused mode", () => {
    for (const item of navItems(false)) expect(frozenRedirect(item.href, false)).toBeNull();
    expect(navItems(true).length).toBeGreaterThan(FOCUSED_NAV.length);
  });
  it("marks Réglages active on the billing page", () => {
    const settings = FOCUSED_NAV.find((i) => i.key === "settings")!;
    expect(isActive(settings, "/billing")).toBe(true);
    expect(isActive(settings, "/settings")).toBe(true);
    expect(isActive(FOCUSED_NAV[1], "/relances")).toBe(false);
  });
});
