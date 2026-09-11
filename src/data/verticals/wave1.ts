/**
 * Programmatic SEO vertical data (Wave 1) — Airbnb hosts
 * CRO goldens: /workspace/orbis/verticals/airbnb-hosts/ (v2-home-voice-2026-09-11)
 * NEVER MVP / Alpha in badges or UI strings.
 */

import { airbnbHubFaq, airbnbJobFaq, type FaqItem } from "./airbnb-faq";
export type { FaqItem };

export interface VerticalJob {
  hub: string;
  job: string;
  missions: string;
  tools: string;
  motionJobs: string;
  motionDetails?: string;
  h1: string;
  h2: string;
  micro: string;
  icp: string;
  badge: string;
  valueStack: string[];
  costLines: string[];
  finalTitle: string;
  maturity: "Ready" | "Composable" | "Planned";
  faq: FaqItem[];
  before?: string;
  after?: string;
  guardrail?: string;
}

export interface HubMeta {
  hub: string;
  label: string;
  who: string;
  tagline: string;
  pain: string;
  h2: string;
  micro: string;
  icp: string;
  badge: string;
  valueStack: string[];
  costLines: string[];
  finalTitle: string;
  faq: FaqItem[];
  motionJobs: string;
  tools: string;
}

const BADGE = "Your listings. Your tools. Agents you supervise.";
const MICRO =
  "Start with your site or four questions. First result to review. You stay in control of every send.";

const airbnbHostsJobs: VerticalJob[] = [
  {
    hub: "airbnb-hosts",
    job: "guest-messaging",
    missions: "customer-request,sourced-content",
    tools: "Airbnb,Gmail,WhatsApp,Google Calendar",
    motionJobs:
      "Late check-in question|Reply prepared|House manual cited;Noise complaint|Reply prepared|Unknowns if stay notes missing;Extra guest ask|Reply prepared|Policy line from your listing",
    h1: "Guest replies prepared. You hit send.",
    h2: "Late check-ins, Wi-Fi asks, noise threads — busywork in, useful draft out. On *this* listing's rules. You stay in control of every message.",
    micro: "Start with your site or four questions. First reply to review. Nothing sends without you.",
    icp: "Hosts drowning in repeat threads. Not a hotel contact-center.",
    badge: BADGE,
    valueStack: [
      "One draft per thread, on *this* listing",
      "Sources attached — or an unknown called out",
      "Same mission tomorrow (approved memory), not a new empty chat",
      "Tone when you are tired still goes through you",
      "You hit send",
    ],
    costLines: [
      "Solo ~€149/mo proposed vs VA slice on guest chat inside a €2–4k/mo loaded assistant — direction, not a quote.",
      "Free audit first. Indicative · confirmed before any subscription.",
      "Scope: named guest-messaging missions — not your full P&L.",
    ],
    finalTitle: "Your ambition. A little more inbox capacity.",
    faq: airbnbJobFaq["guest-messaging"],
    maturity: "Ready",
    before: "inbox + ChatGPT paste",
    after: "reply draft + sources",
    guardrail: "you send",
  },
  {
    hub: "airbnb-hosts",
    job: "review-replies",
    missions: "customer-request,sourced-content",
    tools: "Airbnb,Gmail,Notion",
    motionJobs:
      "Review inbox item|Reply drafted;Tone check|Reply approved-ready;FAQ from house rules|Answer prepared",
    h1: "Reviews answered. Reputation still yours.",
    h2: "Stale stars sitting unanswered — busywork in, useful reply out. Tied to what happened on the stay. You publish.",
    micro: "First draft to review. Nothing posts without you.",
    icp: "For hosts sitting on unanswered reviews. Not a hotel reputation suite.",
    badge: BADGE,
    valueStack: [
      "Reply that cites the stay, not a generic apology",
      "Sources / unknowns visible before you publish",
      "Same mission next week — not reinventing tone every time",
      "You publish",
    ],
    costLines: [
      "Solo ~€149/mo vs VA capacity often €2–4k/mo loaded — indicative.",
      "Free audit first. Confirmed before any subscription.",
      "Scope: named review-reply missions — not your full P&L.",
    ],
    finalTitle: "Run the audit on your Airbnb hosting company.",
    faq: airbnbJobFaq["review-replies"],
    maturity: "Ready",
    before: "stale 3-star sitting unanswered",
    after: "draft tied to stay notes",
    guardrail: "you publish",
  },
  {
    hub: "airbnb-hosts",
    job: "listing-copy",
    missions: "sourced-content,research",
    tools: "Airbnb,Notion,Google Docs",
    motionJobs:
      "Seasonal refresh brief|Listing blurb ready;House rules pack|Amenities section drafted;Tone pass|Copy approved-ready",
    h1: "Listing copy ready. You paste live.",
    h2: "Seasonal rewrites without starting from a blank ChatGPT tab. Blurbs from *your* listing and house rules. You approve before it goes live.",
    micro: MICRO,
    icp: "For hosts refreshing seasonal listing copy. Not a marketplace SEO agency.",
    badge: BADGE,
    valueStack: [
      "Copy grounded in *your* listing, not generic cozy-loft filler",
      "Reuse across calendars when the voice matches",
      "Unknowns when details are missing — you fill, then paste",
      "You paste live",
    ],
    costLines: [
      "Solo ~€149/mo vs VA / copy help inside €2–4k/mo loaded capacity — indicative.",
      "Free audit first.",
      "Scope: named listing-copy missions — not dynamic pricing strategy.",
    ],
    finalTitle: "Run the audit on your Airbnb hosting company.",
    faq: airbnbJobFaq["listing-copy"],
    maturity: "Ready",
    before: "rewrite from scratch each season",
    after: "blurb from your listing + house rules",
    guardrail: "you paste live",
  },
  {
    hub: "airbnb-hosts",
    job: "cleaning-handoff",
    missions: "customer-request,sourced-content",
    tools: "WhatsApp,Google Calendar,Notion,Gmail",
    motionJobs:
      "Turnover notes|Checklist brief ready;Issue from last stay|Handoff note drafted;Next guest ETA|Timing brief prepared",
    h1: "Handoffs clear. Ops still on site.",
    h2: "Voice notes in three apps → one checklist brief. Busywork out of WhatsApp archaeology. Cleaners and turnovers still confirm in the real world.",
    micro: MICRO,
    icp: "For hosts coordinating cleaners across listings. Not a property-management OS.",
    badge: BADGE,
    valueStack: [
      "One brief instead of three apps",
      "Issues from last stay carried forward when you select sources",
      "Unknowns if keys / codes missing",
      "Ops still confirm on site — Orbis does not message cleaners alone by default",
    ],
    costLines: [
      "Solo ~€149/mo vs ops VA slice inside €2–4k/mo — indicative.",
      "Free audit first.",
      "Scope: named cleaning-handoff missions — not on-site staffing.",
    ],
    finalTitle: "Run the audit on your Airbnb hosting company.",
    faq: airbnbJobFaq["cleaning-handoff"],
    maturity: "Ready",
    before: "voice notes in three apps",
    after: "one checklist brief",
    guardrail: "ops still confirm on site",
  },
  {
    hub: "airbnb-hosts",
    job: "pricing-notes",
    missions: "research,sourced-content",
    tools: "Airbnb,Notion,Google Sheets,Chrome",
    motionJobs:
      "Weekend comps brief|Note drafted;Seasonal event|Context card ready;Sources pack|Citations listed|Thin sources flagged",
    h1: "Pricing notes ready. You set the rate.",
    h2: "Scattered comps in tabs → a short research-flavored note with sources. Not autopilot dynamic pricing. Your judgment stays on the number.",
    micro: MICRO,
    icp: "For hosts who want a priced note, not autopilot dynamic pricing.",
    badge: BADGE,
    valueStack: [
      "A note you can argue with — sources listed",
      "Unknowns when comps are thin",
      "You set the price. Orbis does not change rates.",
    ],
    costLines: [
      "Solo ~€149/mo vs analyst/VA help inside €2–4k/mo — indicative. This mission is not a pricing product promise.",
      "Free audit first.",
      "Scope: research-flavored pricing notes — not your full P&L or dynamic pricing.",
    ],
    finalTitle: "Run the audit on your Airbnb hosting company.",
    faq: airbnbJobFaq["pricing-notes"],
    maturity: "Composable",
    before: "scattered comps in tabs",
    after: "short note with sources",
    guardrail: "you set the price",
  },
];

const hubMetadata: Record<string, HubMeta> = {
  "airbnb-hosts": {
    hub: "airbnb-hosts",
    label: "Airbnb hosts",
    who: "Airbnb hosts and small short-term rental managers",
    tagline: "A bigger hosting business. Not a bigger inbox.",
    pain: "You run the listings. Give the guest busywork a team. Orbis turns guest threads, reviews, listing copy, and handoffs into missions on *your* houses — work you can actually review.",
    h2: "You run the listings. Give the guest busywork a team. Orbis turns guest threads, reviews, listing copy, and handoffs into missions on *your* houses — work you can actually review.",
    micro: MICRO,
    icp: "For hosts and small managers who already paste into ChatGPT. Not a hotel OS. Not an agent lab.",
    badge: BADGE,
    valueStack: [
      "Guest reply ready after your OK — on *this* listing's rules, not a blank thread",
      "Review reply that cites what happened on the stay",
      "Listing blurbs you reuse across calendars",
      "Cleaning / handoff notes that kill WhatsApp archaeology",
      "Same mission tomorrow — memory you approve, not a new empty chat",
      "You still hit send. Nothing posts outside without you.",
    ],
    costLines: [
      "Solo ~€149/mo proposed vs a VA / assistant on guest chat + reviews often €2–4k/mo loaded.",
      "Indicative · confirmed before any subscription. Usage separate. This pack = named missions, not your full P&L.",
      "Example math (not a promise): ~45 min/day on guest+review copy × 25 days × €60 host hour ≈ €1,125/mo of attention.",
    ],
    finalTitle: "Your ambition. A little more hosting capacity.",
    faq: airbnbHubFaq,
    motionJobs:
      "Reply to a guest|Guest reply prepared|Tone + house rules from your listing;Answer a review|Review reply drafted|Stay notes + listing cited;Update listing copy|Listing blurb ready|You approve before it goes live",
    tools: "Airbnb,Gmail,WhatsApp,Google Calendar,Notion,Google Docs",
  },
};

const jobLabels: Record<string, string> = {
  "guest-messaging": "guest messaging",
  "review-replies": "review replies",
  "listing-copy": "listing copy",
  "cleaning-handoff": "cleaning handoff",
  "pricing-notes": "pricing notes",
};

export const verticals: VerticalJob[] = [...airbnbHostsJobs];

export function getHubs(): string[] {
  return Array.from(new Set(verticals.map((v) => v.hub)));
}

export function getHubMeta(hub: string): HubMeta | undefined {
  return hubMetadata[hub];
}

export function getJobsByHub(hub: string): VerticalJob[] {
  return verticals.filter((v) => v.hub === hub);
}

export function getJob(hub: string, job: string): VerticalJob | undefined {
  return verticals.find((v) => v.hub === hub && v.job === job);
}

export function getJobLabel(job: string): string {
  return jobLabels[job] || job.replace(/-/g, " ");
}

export function getAllJobs(): Array<{ hub: string; job: string }> {
  return verticals.map((v) => ({ hub: v.hub, job: v.job }));
}

export function parseMotionJobs(
  motionJobs: string
): Array<{ action: string; result: string; detail?: string }> {
  return motionJobs.split(";").filter(Boolean).map((pair) => {
    const parts = pair.split("|").map((p) => p.trim());
    return {
      action: parts[0] || "",
      result: parts[1] || "",
      detail: parts[2],
    };
  });
}

export function parseTools(tools: string): string[] {
  return tools.split(",").map((t) => t.trim()).filter(Boolean);
}

export function parseMissions(missions: string): string[] {
  return missions.split(",").map((m) => m.trim()).filter(Boolean);
}
