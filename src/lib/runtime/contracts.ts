import { z } from "zod";
import type { MemoryItem, Source, CheckResult } from "@/lib/domain/types";

export const contracts: Record<
  string,
  { label: string; brief: string; kind: "brief" | "analysis" | "draft" }
> = {
  "request-analysis": {
    label: "Request analysis",
    kind: "analysis",
    brief:
      "Extract needs, constraints, deadlines and stakeholders. Draft a usable customer reply. Distinguish customer statements from verified company commitments. Never invent a price, availability or SLA.",
  },
  "meeting-prep": {
    label: "Meeting preparation",
    kind: "brief",
    brief:
      "Produce a decision-oriented meeting brief: verified context, agenda, questions, objections, decisions to seek and next steps. Never invent participant biographies or past conversations.",
  },
  "research-brief": {
    label: "Research brief",
    kind: "brief",
    brief:
      "Compare the supplied evidence, distinguish facts from hypotheses, state uncertainty and freshness limits, then recommend a next step. You have no live browsing tool: never claim to have researched the web.",
  },
  "content-draft": {
    label: "Content studio",
    kind: "draft",
    brief:
      "Produce publication-ready copy with a clear audience, angle, main draft and two variants. Respect company voice. Cite factual claims separately. Never invent metrics, testimonials or product capabilities.",
  },
};

export const planSchema = z.object({
  objective: z.string(),
  requirements: z.array(z.string()).max(12),
  missing: z.array(z.string()).max(10),
  blocked: z.boolean(),
});
export const draftSchema = z.object({
  title: z.string(),
  body: z.string(),
  unknowns: z.array(z.string()).max(15),
  citations: z
    .array(
      z.object({
        sourceId: z.string(),
        excerpt: z.string().min(8),
        claim: z.string(),
      }),
    )
    .max(20),
});
export const reviewSchema = z.object({
  coverage: z.boolean(),
  grounded: z.boolean(),
  safe: z.boolean(),
  issues: z.array(z.string()).max(12),
  summary: z.string(),
});
export type Draft = z.infer<typeof draftSchema>;
export type Review = z.infer<typeof reviewSchema>;

export function scopedMemory(
  items: MemoryItem[],
  tenantId: string,
  missionId: string,
) {
  // Result-only corrections never silently leak into subsequent jobs.
  return items.filter(
    (m) =>
      m.tenantId === tenantId &&
      m.status === "approved" &&
      (m.scope === "workspace" ||
        (m.scope === "general_rule" && m.missionId === missionId)),
  );
}

export function evidenceChecks(
  draft: Draft,
  sources: Source[],
  review: Review,
): CheckResult[] {
  const quotesValid = draft.citations.every((c) => {
    const source = sources.find((s) => s.id === c.sourceId);
    return (
      !!source &&
      c.excerpt.trim().length >= 8 &&
      source.excerpt.includes(c.excerpt)
    );
  });
  return [
    {
      id: "quotes",
      label: "Source integrity",
      status: quotesValid && draft.citations.length > 0 ? "pass" : "fail",
      detail:
        quotesValid && draft.citations.length > 0
          ? "Every quote is present verbatim in a selected source. This does not prove that it supports every claim."
          : "A quote is absent, unknown or missing. Add evidence before approval.",
    },
    {
      id: "coverage",
      label: "Request coverage · AI review",
      status: review.coverage ? "pass" : "fail",
      detail: review.summary,
    },
    {
      id: "grounding",
      label: "Claim support · AI review",
      status: review.grounded ? "pass" : "fail",
      detail:
        review.issues.join(" · ") ||
        "No unsupported claim detected by the reviewer; human review remains required.",
    },
    {
      id: "safety",
      label: "Commitments · AI review",
      status: review.safe ? "pass" : "fail",
      detail: review.safe
        ? "No unsafe commitment detected."
        : "A commitment or instruction needs human review.",
    },
  ];
}
