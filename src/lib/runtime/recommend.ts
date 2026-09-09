import type { CompanyProfile } from "@/lib/domain/types";

export function recommendSlugs(profile: CompanyProfile | null) {
  if (!profile) return ["research-brief", "request-analysis", "meeting-prep"];
  const blob = `${profile.summary} ${profile.industry} ${profile.tags.join(" ")}`.toLowerCase();
  if (blob.includes("construction") || blob.includes("sales") || blob.includes("b2b")) {
    return ["request-analysis", "research-brief", "quote-prep", "meeting-prep"];
  }
  if (blob.includes("content") || blob.includes("growth") || blob.includes("marketing")) {
    return ["content-draft", "research-brief", "meeting-prep"];
  }
  return ["research-brief", "request-analysis", "content-draft", "meeting-prep"];
}
