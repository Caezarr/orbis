/**
 * Programmatic SEO vertical data (Wave 1)
 * Golden copy from docs/verticals (CRO). MotionJobs for TaskWorkshop (CTO).
 */

import { airbnbHubFaq, airbnbJobFaq, type FaqItem } from "./airbnb-faq";
import {
  contentCreatorsJobs,
  contentCreatorsHubMeta,
  contentCreatorsJobLabels,
} from "./content-creators-vertical";
import {
  coachesConsultantsJobs,
  coachesConsultantsHubMeta,
  coachesConsultantsJobLabels,
} from "./coaches-consultants-vertical";
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

const BADGE =
  "MVP: website intake, missions, evaluated runs. OAuth and outside execution: soon.";
const MICRO =
  "Website or 4 questions. First deliverable to review. Nothing acts outside without you.";

const airbnbHostsJobs: VerticalJob[] = [
  {
    hub: "airbnb-hosts",
    job: "guest-messaging",
    missions: "customer-request,sourced-content",
    tools: "Airbnb,Gmail,WhatsApp,Google Calendar",
    motionJobs:
      "Late check-in question|Reply prepared;Noise complaint|Reply prepared;Extra guest ask|Reply prepared",
    motionDetails:
      "Sources: house manual;Unknowns flagged if stay notes missing;Policy line from your listing",
    h1: "Install guest messaging into your company.",
    h2: "You already paste guest threads into ChatGPT. Orbis turns that into a bounded mission on *your* listings: a reply draft with sources and unknowns, then you decide.",
    micro: MICRO,
    icp: "For Airbnb hosts drowning in Wi-Fi and check-in threads. Not hotel contact-center software.",
    badge: BADGE,
    valueStack: [
      "One reply draft per thread, on *this* listing's rules",
      "Sources attached (manual, listing, stay note) — or an unknown called out",
      "Same mission tomorrow — not a new empty chat",
      "You still hit send",
    ],
    costLines: [
      "Assistant / VA slice on guest chat: part of the €2,000–4,000 / mo loaded capacity — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative, confirmed before subscription.",
      "Scope: named guest-messaging missions — not your full P&L.",
    ],
    finalTitle: "Run the audit on your Airbnb hosting company.",
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
    h1: "Install review replies into your company.",
    h2: "You already paste stay notes into ChatGPT. Orbis turns that into a bounded review reply on *your* listing: draft with sources, then you publish.",
    micro: MICRO,
    icp: "For Airbnb hosts sitting on unanswered reviews. Not a hotel reputation suite.",
    badge: BADGE,
    valueStack: [
      "Review reply that cites what actually happened on the stay",
      "Tone checked against your house voice",
      "You still publish",
    ],
    costLines: [
      "VA / assistant handling reviews: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
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
    tools: "Airbnb,Google Docs,Notion",
    motionJobs:
      "Listing brief|Blurb drafted;Amenity list|Highlights written;Photo captions|Captions ready",
    h1: "Install listing copy into your company.",
    h2: "You already rewrite listing blurbs from scratch. Orbis turns house rules and amenities into a bounded copy mission on *your* listing: draft to review, then you paste live.",
    micro: MICRO,
    icp: "For hosts refreshing seasonal listing copy. Not a marketplace SEO agency.",
    badge: BADGE,
    valueStack: [
      "Listing blurbs you can reuse across calendars",
      "Captions grounded in your amenities",
      "You still paste live",
    ],
    costLines: [
      "Freelance copy on listings: part of €2,000–4,000 / mo capacity — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
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
    tools: "Airbnb,WhatsApp,Google Calendar",
    motionJobs:
      "Checkout note|Cleaner brief ready;Issue report|Handoff ticket drafted;Restock list|Checklist prepared",
    h1: "Install cleaning handoff into your company.",
    h2: "You already chase voice notes across apps. Orbis turns checkout notes into a bounded handoff brief on *your* listing: checklist to review, ops still confirm on site.",
    micro: MICRO,
    icp: "For hosts coordinating cleaners across listings. Not a property-management OS.",
    badge: BADGE,
    valueStack: [
      "Cleaning / handoff notes that stop the WhatsApp archaeology",
      "One checklist brief per turnover",
      "Ops still confirm on site",
    ],
    costLines: [
      "Ops assistant on handoffs: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
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
    tools: "Airbnb,Sheets,Google Calendar",
    motionJobs:
      "Comp scan|Pricing note drafted;Weekend surge|Price suggestion ready;Gap night|Promo blurb prepared",
    h1: "Install pricing notes into your company.",
    h2: "You already scatter comps across tabs. Orbis turns that into a bounded research note on *your* portfolio: short note with sources, then you set the price.",
    micro: MICRO,
    icp: "For hosts who want a priced note, not autopilot dynamic pricing.",
    badge: BADGE,
    valueStack: [
      "Short pricing note with sources attached",
      "Weekend / gap suggestions labeled as examples",
      "You set the price",
    ],
    costLines: [
      "Analyst / VA on comps: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
      "Scope: research-flavored pricing notes — not your full P&L or dynamic pricing strategy.",
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
    tagline: "Install the busywork of Airbnb hosting into Orbis.",
    pain: "You already paste guest threads into ChatGPT. Orbis turns guest messaging, reviews, and listing copy into bounded missions on *your* listings: test the result, check sources and unknowns, activate under supervision.",
    h2: "You already paste guest threads into ChatGPT. Orbis turns guest messaging, reviews, and listing copy into bounded missions on *your* listings: test the result, check sources and unknowns, activate under supervision.",
    micro: MICRO,
    icp: "For Airbnb hosts and small managers. Not a hotel chain OS. Not an agent lab.",
    badge: BADGE,
    valueStack: [
      "Guest reply ready to send after your OK — not a blank ChatGPT thread",
      "Review reply that cites what actually happened on the stay",
      "Listing blurbs you can reuse across calendars",
      "Cleaning / handoff notes that stop the WhatsApp archaeology",
      "Same supervision rule: nothing posts to the channel without you",
    ],
    costLines: [
      "VA / assistant handling guest chat + reviews for a small portfolio: often €2,000–4,000 / mo loaded — direction, not a quote for your city.",
      "Orbis Solo (proposed): ~€149 / mo, usage separate — indicative, confirmed before subscription.",
      "Scope: this pack covers the named messaging and copy missions — not your full P&L, not dynamic pricing strategy.",
      "Example math (label as example): 45 min/day on guest+review copy × 25 days × €60 founder hour ≈ €1,125 / mo of attention — not a promise Orbis returns that cash.",
    ],
    finalTitle: "Run the audit on your Airbnb hosting company.",
    faq: airbnbHubFaq,
    motionJobs:
      "Reply to a guest|Guest reply prepared|Tone + house rules from your listing;Answer a review|Review reply drafted|Sources: stay notes + listing;Update listing copy|Listing blurb ready|You approve before it goes live",
    tools: "Airbnb,Gmail,WhatsApp,Google Calendar,Notion,Google Docs",
  },
  "content-creators": contentCreatorsHubMeta,
  "coaches-consultants": coachesConsultantsHubMeta,
};

const jobLabels: Record<string, string> = {
  ...contentCreatorsJobLabels,
  ...coachesConsultantsJobLabels,
  "guest-messaging": "guest messaging",
  "review-replies": "review replies",
  "listing-copy": "listing copy",
  "cleaning-handoff": "cleaning handoff",
  "pricing-notes": "pricing notes",
};

export const verticals: VerticalJob[] = [
  ...airbnbHostsJobs,
  ...contentCreatorsJobs,
  ...coachesConsultantsJobs,
];

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
