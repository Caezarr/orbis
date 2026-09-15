import { id } from "@/lib/ids";
import { looksLikeUrl, normalizeWebsite } from "@/lib/ssrf";
import type { CompanyProfile } from "@/lib/domain/types";

/** User-supplied intake only: never substitute a canned company for a keyword. */
export function buildProfile(input: string, tenantId: string): CompanyProfile {
  const text = input.trim();
  if (!text || text.length > 8000 || !tenantId) throw new Error("Invalid company intake");
  const website = looksLikeUrl(text) ? normalizeWebsite(text) : undefined;
  const name = website ? new URL(website).hostname : text.split(/\s+/).slice(0, 5).join(" ").slice(0, 120);
  return {
    id: id("profile"), tenantId, name, website,
    summary: website ? "Company website supplied. Business context needs confirmation." : text,
    tags: ["Needs confirmation"],
    claims: [
      { id: id("claim"), kind: "fact", label: "Provided by you", value: text, confidence: 1 },
      { id: id("claim"), kind: "missing", label: "Business context", value: "Confirm your customers, offer and the work you want to delegate.", confidence: 0 },
    ],
    input: text, completedAt: new Date().toISOString(),
  };
}
