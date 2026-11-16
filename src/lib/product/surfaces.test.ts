import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FOCUSED_NAV,
  FROZEN_API_NAMESPACES,
  FROZEN_ROUTES,
  frozenApi,
  frozenRedirect,
  frozenSurfacesEnabled,
  isActive,
  navItems,
} from "./surfaces";

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
    expect(frozenRedirect("/for", false)).toBe("/start");
    expect(frozenRedirect("/for/airbnb-hosts/guest-messaging", false)).toBe("/start");
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
      "/format",
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

/** API namespaces the V1 wedge serves (pages, /start, Today, settings, billing). */
const WEDGE_API_NAMESPACES = [
  "account",
  "billing",
  "brain",
  "digest",
  "inbox",
  "report",
  "requests",
  "start",
  "team",
  "workspace",
];

describe("frozenApi", () => {
  it("blocks the frozen product's API routes, including paid model calls", () => {
    for (const path of [
      "/api/v1/orbi",
      "/api/v1/company-analysis",
      "/api/v1/missions",
      "/api/v1/missions/m1/test-runs",
      "/api/v1/actions/a1/decisions",
      "/api/v1/knowledge-search",
      "/api/v1/export",
    ])
      expect(frozenApi(path, false)).toBe(true);
  });
  it("is not fooled by encoding, case or extra slashes", () => {
    for (const path of ["/api/v1/%6Frbi", "/api/v1/ORBI", "//api/v1//orbi/", "/api//v1/missions/m1"])
      expect(frozenApi(path, false)).toBe(true);
  });
  it("keeps the wedge API and non-API paths reachable", () => {
    for (const ns of WEDGE_API_NAMESPACES) expect(frozenApi(`/api/v1/${ns}`, false)).toBe(false);
    for (const path of [
      "/api/v1/inbox/today",
      "/api/v1/account/export",
      "/api/v1/billing/tasks",
      "/api/v1/start/site",
      "/api/cron/inbox",
      "/api/health",
      "/api/client-errors",
      "/api/auth/callback",
      "/api/v1/orbital",
      "/orbi",
      "/missions",
    ])
      expect(frozenApi(path, false)).toBe(false);
  });
  it("serves everything when frozen surfaces are enabled", () => {
    for (const ns of FROZEN_API_NAMESPACES) expect(frozenApi(`/api/v1/${ns}`, true)).toBe(false);
  });
  it("classifies every /api/v1 namespace as wedge or frozen (new routes need a decision)", () => {
    const root = join(process.cwd(), "src/app/api/v1");
    const namespaces = readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory());
    for (const ns of namespaces)
      expect(WEDGE_API_NAMESPACES.includes(ns) !== FROZEN_API_NAMESPACES.includes(ns), ns).toBe(true);
    for (const ns of [...WEDGE_API_NAMESPACES, ...FROZEN_API_NAMESPACES]) expect(namespaces, ns).toContain(ns);
  });
  it("wedge screens never call a frozen API", () => {
    const dirs = [
      "src/app/start",
      "src/app/(workspace)/today",
      "src/app/(workspace)/demandes",
      "src/app/(workspace)/relances",
      "src/app/(workspace)/fiche",
      "src/app/(workspace)/rapport",
      "src/app/(workspace)/settings",
      "src/app/(workspace)/billing",
      "src/components/followups",
      "src/components/billing",
      "src/components/shell",
    ];
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const path = join(dir, n);
        if (statSync(path).isDirectory()) return files(path);
        return /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [path] : [];
      });
    for (const file of dirs.flatMap((d) => files(join(process.cwd(), d))))
      for (const [, ns] of readFileSync(file, "utf8").matchAll(/["'`]\/api\/v1\/([a-z0-9-]+)/g))
        expect(FROZEN_API_NAMESPACES, `${file} calls /api/v1/${ns}`).not.toContain(ns);
  });
});
