/**
 * V1 focus (docs/strategy/17-v1-self-serve.md, « Ce qu'on gèle »): the
 * horizontal product (catalogue, missions, workflows, knowledge, analytics,
 * integrations catalogue, old audit/onboarding, Ask Orbi chat) is frozen.
 * The code stays; the workspace hides it from navigation and its routes
 * redirect to the wedge page that replaces them.
 *
 * Set ORBIS_FROZEN_SURFACES_ENABLED=true to expose the frozen surfaces again
 * (internal demos, development of the long-term product). Default: hidden.
 */
export function frozenSurfacesEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ORBIS_FROZEN_SURFACES_ENABLED === "true";
}

/** Frozen route prefix → where the focused workspace sends the visitor. */
export const FROZEN_ROUTES: readonly (readonly [prefix: string, target: string])[] = [
  // Public entry points of the old horizontal journey: send to the golden path.
  ["/catalog", "/start"],
  ["/discover", "/start"],
  ["/audit", "/start"],
  ["/onboarding", "/start"],
  // Workspace surfaces of the horizontal product.
  ["/chat", "/today"],
  ["/missions", "/today"],
  ["/workflows", "/today"],
  ["/plans", "/today"],
  ["/runs", "/today"],
  ["/tasks", "/today"],
  ["/company", "/fiche"],
  ["/knowledge", "/fiche"],
  ["/analytics", "/rapport"],
  ["/connections", "/settings"],
];

/** Redirect target for a frozen pathname, or null when the page stays reachable. */
export function frozenRedirect(pathname: string, enabled = frozenSurfacesEnabled()): string | null {
  if (enabled) return null;
  for (const [prefix, target] of FROZEN_ROUTES)
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return target;
  return null;
}

export type NavKey =
  | "today"
  | "demandes"
  | "relances"
  | "fiche"
  | "rapport"
  | "settings"
  | "chat"
  | "catalog"
  | "connections"
  | "knowledge"
  | "analytics";
export type NavItem = { key: NavKey; href: string; label: string; also?: readonly string[] };

/** Wedge order: decisions first, then the pipeline, then what Orbi knows and measures. */
export const FOCUSED_NAV: readonly NavItem[] = [
  { key: "today", href: "/today", label: "Aujourd’hui" },
  { key: "demandes", href: "/demandes", label: "Demandes" },
  { key: "relances", href: "/relances", label: "Relances" },
  { key: "fiche", href: "/fiche", label: "Fiche entreprise" },
  { key: "rapport", href: "/rapport", label: "Rapport" },
  { key: "settings", href: "/settings", label: "Réglages", also: ["/billing"] },
];

/** Shown after the wedge only when frozen surfaces are enabled. */
export const FROZEN_NAV: readonly NavItem[] = [
  { key: "chat", href: "/chat", label: "Demander à Orbi" },
  { key: "catalog", href: "/catalog", label: "Catalogue", also: ["/workflows", "/discover"] },
  { key: "connections", href: "/connections", label: "Intégrations" },
  { key: "knowledge", href: "/knowledge", label: "Connaissances" },
  { key: "analytics", href: "/analytics", label: "Analyses" },
];

export function navItems(full: boolean): NavItem[] {
  return full ? [...FOCUSED_NAV, ...FROZEN_NAV] : [...FOCUSED_NAV];
}

export function isActive(item: NavItem, pathname: string) {
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
