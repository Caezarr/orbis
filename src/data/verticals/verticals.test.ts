import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findFlow } from "@/lib/product/catalog";
import { plans } from "@/lib/product/pricing";
import { contracts } from "@/lib/runtime/contracts";
import { auditHref, getAllJobParams, hubs, pricingFaq } from ".";
import { TOOLS } from "./tools";

const allText = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(allText)
      : value && typeof value === "object"
        ? Object.values(value).flatMap(allText)
        : [];

describe("vertical SEO data", () => {
  it("maps every job to an existing catalog flow running on a supported contract", () => {
    for (const hub of hubs)
      for (const job of hub.jobs) {
        const flow = findFlow(job.catalogFlowId);
        expect(flow, `${hub.slug}/${job.slug}`).toBeDefined();
        expect(flow?.engine).toBe(job.contract);
        expect(contracts[job.contract]).toBeDefined();
      }
  });

  it("only references logos that exist in public/brand/tools", () => {
    for (const tool of Object.values(TOOLS))
      if (tool.logo)
        expect(
          existsSync(join(process.cwd(), "public/brand/tools", `${tool.logo}.svg`)),
          tool.logo,
        ).toBe(true);
  });

  it("contains no invented figures, markdown or stale maturity copy", () => {
    const text = allText(hubs).join("\n").replace(/flow-\d{3}/g, "");
    expect(text).not.toMatch(/[€$£≈%]/);
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/\*/);
    expect(text).not.toMatch(/\b(MVP|soon|Ready|minutes?|guarantee)\b/i);
  });

  it("never implies a direct connection to tools Orbis cannot connect", () => {
    for (const hub of hubs) {
      const keys = [...hub.tools, ...hub.jobs.flatMap((j) => j.connections.map((c) => c.tool))];
      for (const key of keys) expect(TOOLS[key], key).toBeDefined();
    }
  });

  it("keeps hub and job copy distinct", () => {
    const summaries = new Set<string>();
    for (const hub of hubs) {
      expect(hub.lead).not.toBe(hub.intro);
      for (const job of hub.jobs) {
        expect(summaries.has(job.summary)).toBe(false);
        summaries.add(job.summary);
        expect(job.inputs.length).toBeGreaterThan(0);
        expect(job.draft.length).toBeGreaterThan(0);
        expect(job.boundaries.length).toBeGreaterThan(0);
      }
    }
    const faqQuestions = hubs.flatMap((h) => h.jobs.flatMap((j) => j.faq.map((f) => f.a)));
    expect(new Set(faqQuestions).size).toBe(faqQuestions.length);
  });

  it("uses the real Solo price and routes the audit through login", () => {
    const solo = plans.find((p) => p.name === "Solo");
    expect(pricingFaq().a).toContain(`€${solo?.monthly} per month`);
    expect(auditHref(hubs[0].jobs[0])).toBe(
      `/login?returnTo=${encodeURIComponent(`/audit?flow=${hubs[0].jobs[0].catalogFlowId}`)}`,
    );
    expect(getAllJobParams()).toHaveLength(hubs.reduce((n, h) => n + h.jobs.length, 0));
  });
});
