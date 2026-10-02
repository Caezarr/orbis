import { plans } from "@/lib/product/pricing";
import { airbnbHosts } from "./airbnb-hosts";
import { contentCreators } from "./content-creators";
import { coachesConsultants } from "./coaches-consultants";
import type { FaqItem, VerticalHub, VerticalJob } from "./types";

export type { FaqItem, VerticalHub, VerticalJob } from "./types";

export const hubs: VerticalHub[] = [airbnbHosts, contentCreators, coachesConsultants];

export function getHub(slug: string): VerticalHub | undefined {
  return hubs.find((h) => h.slug === slug);
}

export function getJob(hub: string, job: string): VerticalJob | undefined {
  return getHub(hub)?.jobs.find((j) => j.slug === job);
}

export function getAllJobParams(): Array<{ hub: string; job: string }> {
  return hubs.flatMap((h) => h.jobs.map((j) => ({ hub: h.slug, job: j.slug })));
}

/** Audit entry: sign in, then open the audit with the matching catalog flow preselected. */
export function auditHref(job?: VerticalJob): string {
  const target = job ? `/audit?flow=${job.catalogFlowId}` : "/audit";
  return `/login?returnTo=${encodeURIComponent(target)}`;
}

/** The only figure used on these pages: the Solo plan price from src/lib/product/pricing.ts. */
export function pricingFaq(): FaqItem {
  const solo = plans.find((p) => p.name === "Solo");
  return {
    q: "What does it cost?",
    a: `The Solo plan is listed at €${solo?.monthly} per month. Pricing is indicative and the final scope is confirmed before any subscription. You start with a guided company audit after signing in.`,
  };
}
