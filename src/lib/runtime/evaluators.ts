import type { CheckResult } from "@/lib/domain/types";
import type { Artifact, CapabilityPackage, CompanyProfile, MemoryItem, Source } from "@/lib/domain/types";

export function evaluateRun(input: {
  pkg: CapabilityPackage;
  artifact: Pick<Artifact, "body" | "citations" | "unknowns">;
  sources: Source[];
}): { checks: CheckResult[]; score: number; gatePassed: boolean } {
  const { pkg, artifact } = input;
  const checks: CheckResult[] = [];

  const hasCitations = artifact.citations.length > 0;
  checks.push({
    id: "citation_coverage",
    label: "Citation coverage",
    status: hasCitations ? "pass" : "fail",
    detail: hasCitations
      ? `${artifact.citations.length} source${artifact.citations.length > 1 ? "s" : ""} used.`
      : "No sources attached.",
  });

  const inventedPrice = /€\s?\d|EUR\s?\d|\$\d/.test(artifact.body) && !/catalog|offer notes/i.test(artifact.citations.map((c) => c.sourceName).join(" "));
  const priceCheckNeeded = pkg.slug === "request-analysis" || pkg.slug === "quote-prep";
  if (priceCheckNeeded) {
    checks.push({
      id: "no_price_invented",
      label: "No price invented",
      status: inventedPrice ? "fail" : "pass",
      detail: inventedPrice
        ? "A monetary amount appears without an approved catalog citation."
        : "No unsourced price in the result.",
    });
  }

  const hasUnknowns = artifact.unknowns.length > 0;
  checks.push({
    id: "unknowns_named",
    label: "Unknowns named",
    status: hasUnknowns ? "pass" : "warn",
    detail: hasUnknowns ? artifact.unknowns.join(" · ") : "Nothing marked unknown — verify completeness.",
  });

  if (pkg.slug === "request-analysis") {
    checks.push({
      id: "request_covered",
      label: "Request covered",
      status: /licence|license|onboarding|week-end|weekend|délai|delay/i.test(artifact.body) ? "pass" : "warn",
      detail: "Requirements extracted from the incoming request.",
    });
  }

  if (pkg.evaluations.includes("duplicate_rate")) {
    checks.push({
      id: "duplicates",
      label: "Duplicate rate",
      status: "pass",
      detail: "No repeated findings after filtering.",
    });
  }

  const criticalFail = checks.some((check) => check.status === "fail");
  const score =
    checks.reduce((acc, check) => acc + (check.status === "pass" ? 1 : check.status === "warn" ? 0.6 : 0), 0) /
    Math.max(1, checks.length);

  return { checks, score: Number(score.toFixed(2)), gatePassed: !criticalFail && score >= 0.7 };
}

export function pickUnknowns(profile: CompanyProfile | null, extra: string[]) {
  const fromProfile = (profile?.claims ?? [])
    .filter((claim) => claim.kind === "missing")
    .map((claim) => claim.value);
  return Array.from(new Set([...extra, ...fromProfile])).slice(0, 4);
}

export function memoryHints(memory: MemoryItem[]) {
  return memory
    .filter((item) => item.status === "approved")
    .map((item) => item.body);
}
