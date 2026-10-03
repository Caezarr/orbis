import type { CompanyProfile, StoreState } from "@/lib/domain/types";
import { id } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import { FACT_CATEGORIES, type StartFact, type StartProfile } from "./flow";

const DEFAULT_WORKSPACE_NAME = "My workspace";

/**
 * Converts the owner-confirmed /start profile into the workspace profile used
 * by the inbox reply context. The profile is owner-confirmed data about their
 * own company: quotes are stored as facts with their source URL, unknowns as
 * "missing" claims (they become questions, never invented answers).
 */
export function toCompanyProfile(profile: StartProfile, tenantId: string): CompanyProfile {
  const website = profile.website;
  return {
    id: id("profile"),
    tenantId,
    name: profile.name,
    website,
    summary: profile.summary,
    tags: ["Confirmé par vous"],
    claims: [
      ...orderFacts(profile.facts).map((f) => ({
        id: id("claim"),
        kind: "fact" as const,
        label: f.label,
        value: claimValue(f),
        sourceUrl: f.via !== "owner" && f.sourceUrl && website && sameSite(f.sourceUrl, website) ? f.sourceUrl : undefined,
        confidence: f.corrected || f.via === "owner" || f.confidence !== "medium" ? 1 : 0.8,
      })),
      ...profile.unknowns.map((u) => ({
        id: id("claim"),
        kind: "missing" as const,
        label: "À confirmer",
        value: u,
        confidence: 0,
      })),
    ],
    input: (website ?? profile.summary).slice(0, 2000),
    completedAt: nowIso(),
  };
}
/** Most useful first (the reply context is length-bounded): activity, services, zone, prices… */
function orderFacts(facts: StartFact[]) {
  const rank = (f: StartFact) => (f.category ? FACT_CATEGORIES.indexOf(f.category) : FACT_CATEGORIES.length);
  return facts.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map(({ f }) => f);
}
/** The owner's correction wins; otherwise the exact quote, prefixed by its short value when it adds meaning. */
function claimValue(f: StartFact) {
  if (f.corrected) return `${f.corrected} (corrigé par vous)`;
  if (f.via === "owner") return `${f.quote} (indiqué par vous)`;
  if (f.value && !f.quote.includes(f.value)) return `${f.value} : « ${f.quote} »`;
  return f.quote;
}
function sameSite(a: string, b: string) {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
}

/** Applies the profile to a workspace snapshot (mutateStore callback). */
export function applyStartProfile(state: StoreState, profile: StartProfile) {
  const company = toCompanyProfile(profile, state.workspace.tenantId);
  state.profile = company;
  // Only name a workspace that still has the provisioning default.
  if (state.workspace.name === DEFAULT_WORKSPACE_NAME) state.workspace.name = company.name;
  const existing = state.sources.find((s) => s.kind === "profile");
  if (existing) {
    existing.excerpt = company.summary;
    existing.name = `${company.name} profile`;
    existing.origin = company.website ?? "workspace";
  } else
    state.sources.unshift({
      id: id("src"),
      tenantId: state.workspace.tenantId,
      name: `${company.name} profile`,
      kind: "profile",
      status: "ready",
      origin: company.website ?? "workspace",
      excerpt: company.summary,
      version: "sv_profile",
      required: true,
      createdAt: nowIso(),
    });
  return company;
}
