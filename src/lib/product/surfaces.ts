/**
 * V1 focus (private product notes, "what we freeze"): the
 * horizontal product (catalogue, missions, workflows, knowledge, analytics,
 * integrations catalogue, old audit/onboarding, industry pages, Ask Orbi
 * chat) is frozen.
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
  // Industry pages describe catalogue missions (source pickers, /audit, /catalog),
  // not the V1 inbox wedge — doc 17 freezes the verticals from the public UI.
  ["/for", "/start"],
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

/**
 * API namespaces (under /api/v1/) that only serve the frozen horizontal
 * product. Redirecting their pages is not enough: the routes stayed callable
 * by any signed-in account, including Ask Orbi and the company analysis,
 * which make paid model calls outside the inbox quota and budget. While frozen
 * they answer 404. Wedge namespaces (inbox, start, brain, requests, report,
 * digest, account, billing, team, workspace) are deliberately absent.
 */
export const FROZEN_API_NAMESPACES: readonly string[] = [
  "actions",
  "analytics",
  "business-audits",
  "capabilities",
  "company-analysis",
  "company-site",
  "connections",
  "evaluations",
  "export", // legacy JSON export; the V1 export is /api/v1/account/export
  "integrations",
  "intent-resolutions",
  "knowledge-browser",
  "knowledge-scopes",
  "knowledge-search",
  "memory",
  "missions",
  "operations",
  "orbi",
  "profile-jobs",
  "runtime",
  "sources",
  "tasks",
  "usage",
  "workflows",
];

/** True when `pathname` is a frozen API route that must not be served. */
export function frozenApi(pathname: string, enabled = frozenSurfacesEnabled()): boolean {
  if (enabled) return false;
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Malformed escapes: match on the raw path.
  }
  const match = /^\/+api\/+v1\/+([^/]+)(?:\/|$)/i.exec(path);
  return !!match && FROZEN_API_NAMESPACES.includes(match[1].toLowerCase());
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
type NavItem = { key: NavKey; href: string; label: string; also?: readonly string[] };

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
