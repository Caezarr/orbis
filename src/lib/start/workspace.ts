import type { CompanyProfile, StoreState } from "@/lib/domain/types";
import { id } from "@/lib/ids";
import { nowIso } from "@/lib/time";
import type { StartProfile } from "./flow";

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
      ...profile.facts.map((f) => ({
        id: id("claim"),
        kind: "fact" as const,
        label: f.label,
        value: f.quote,
        sourceUrl: f.sourceUrl && website && sameSite(f.sourceUrl, website) ? f.sourceUrl : undefined,
        confidence: 1,
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
