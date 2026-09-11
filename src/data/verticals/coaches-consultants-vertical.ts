/**
 * Coaches-consultants vertical data (Wave 1). MotionJobs for TaskWorkshop (CTO).
 */
import { coachesConsultantsHubFaq, coachesConsultantsJobFaq, type FaqItem } from "./coaches-consultants-faq";

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

export const coachesConsultantsJobs: VerticalJob[] = [
  {
    hub: "coaches-consultants",
    job: "discovery-prep",
    missions: "research,sourced-content",
    tools: "Calendly,Notion,Gmail,LinkedIn",
    motionJobs:
      "Discovery call booked|Prep brief ready|Lead form + public profile notes;Intake form answers|Context pack|Unknowns if goals / budget fields empty;ICP checklist|Fit notes ready|Offer match lines from your sources",
    h1: "Install discovery prep into your company.",
    h2: "You already skim LinkedIn five minutes before the call. Orbis turns intake and ICP notes into a bounded prep brief on *your* practice: sources and unknowns, then you run the call.",
    micro: MICRO,
    icp: "For coaches and consultants who want prep without a full CRM ritual. Not therapy software.",
    badge: BADGE,
    valueStack: [
      "Discovery prep brief before the call — not a LinkedIn skim five minutes late",
      "Fit notes grounded in form + ICP sources",
      "You still run the call",
    ],
    costLines: [
      "Assistant slice on discovery prep: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative, confirmed before subscription.",
      "Scope: named discovery-prep missions — not coaching delivery.",
    ],
    finalTitle: "Run the audit on your coaching and consulting company.",
    faq: coachesConsultantsJobFaq["discovery-prep"],
    maturity: "Ready",
    before: "Calendly ping + frantic LinkedIn skim",
    after: "prep brief + fit notes from form and ICP",
    guardrail: "you run the call",
  },
  {
    hub: "coaches-consultants",
    job: "follow-up-emails",
    missions: "customer-request,sourced-content",
    tools: "Gmail,Notion,HubSpot",
    motionJobs:
      "Post-call notes|Follow-up drafted|Points from *this* conversation;No-show|Reschedule note ready|Tone from your usual templates;Proposal send|Cover email ready|Unknowns if pricing package missing",
    h1: "Install follow-up emails into your company.",
    h2: "You already paste call notes into ChatGPT at 10 PM. Orbis turns that into a bounded follow-up on *your* offer notes: a draft with sources, then you send.",
    micro: MICRO,
    icp: "For coaches who close more when follow-ups ship same day. Not a full sales engagement suite.",
    badge: BADGE,
    valueStack: [
      "Follow-up email that cites what you actually discussed",
      "Unknowns flagged when offer/pricing lines are missing",
      "You still send",
    ],
    costLines: [
      "Inbox VA on follow-ups: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
      "Scope: named follow-up missions — not deal closing.",
    ],
    finalTitle: "Run the audit on your coaching and consulting company.",
    faq: coachesConsultantsJobFaq["follow-up-emails"],
    maturity: "Ready",
    before: "good call, weak email three days later",
    after: "draft tied to call notes and offer",
    guardrail: "you send",
  },
  {
    hub: "coaches-consultants",
    job: "lead-research",
    missions: "research,sourced-content",
    tools: "LinkedIn,Chrome,Notion",
    motionJobs:
      "Lead name / URL|Research brief|Public sources listed;Company site|Context card|Unknowns if role / size unclear;Pain hypotheses|Notes ready|Tied to your ICP — you still validate on the call",
    h1: "Install lead research into your company.",
    h2: "You already open ten tabs before every discovery. Orbis turns public sources into a bounded research brief on *your* ICP: citations and unknowns, then you decide fit.",
    micro: MICRO,
    icp: "For consultants who research before they pitch. Not a data vendor.",
    badge: BADGE,
    valueStack: [
      "Lead research card with company context and fit hypotheses",
      "Gaps flagged when role/size is unclear",
      "You decide fit on the call",
    ],
    costLines: [
      "Research VA slice: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
      "Scope: named lead-research missions — not enrichment APIs.",
    ],
    finalTitle: "Run the audit on your coaching and consulting company.",
    faq: coachesConsultantsJobFaq["lead-research"],
    maturity: "Ready",
    before: "tabs on company + vague gut feel",
    after: "research brief with sources and unknowns",
    guardrail: "you decide fit",
  },
  {
    hub: "coaches-consultants",
    job: "session-notes",
    missions: "sourced-content,customer-request",
    tools: "Notion,Zoom,Gmail",
    motionJobs:
      "Session notes / transcript excerpt|Notes drafted|Structure from your template;Commitments heard|Action checklist ready|Unknowns if owners / dates missing;Client update request|Summary email drafted|You review before anything sends",
    h1: "Install session notes into your company.",
    h2: "You already leave scribbles that never become a client update. Orbis turns session notes into a bounded summary on *your* template: notes + actions, then you review before anything leaves the practice.",
    micro: MICRO,
    icp: "For coaches who want clean notes without a full EHR. Not medical or therapy software.",
    badge: BADGE,
    valueStack: [
      "Session notes + action checklist that stop the notepad archaeology",
      "Client-safe summary draft you still approve",
      "Nothing leaves the practice without you",
    ],
    costLines: [
      "Ops VA on notes: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
      "Scope: named session-notes missions — not clinical documentation.",
    ],
    finalTitle: "Run the audit on your coaching and consulting company.",
    faq: coachesConsultantsJobFaq["session-notes"],
    maturity: "Ready",
    before: "scribbles that never become a client update",
    after: "notes + action list + summary draft",
    guardrail: "you review before anything leaves the practice",
  },
];

export const coachesConsultantsHubMeta: HubMeta = {
  hub: "coaches-consultants",
  label: "Coaches & consultants",
  who: "coaches and consultants",
  tagline: "Install the busywork of coaching and consulting into Orbis.",
  pain: "You already paste discovery notes, follow-ups, and session scribbles into ChatGPT. Orbis turns discovery prep, follow-up emails, lead research, and session notes into bounded missions on *your* practice context: test the result, check sources and unknowns, activate under supervision.",
  h2: "You already paste discovery notes, follow-ups, and session scribbles into ChatGPT. Orbis turns discovery prep, follow-up emails, lead research, and session notes into bounded missions on *your* practice context: test the result, check sources and unknowns, activate under supervision.",
  micro: MICRO,
  icp: "For coaches and consultants running their own pipeline. Not LMS software. Not therapy or medical advice.",
  badge: BADGE,
  valueStack: [
    "Discovery prep brief before the call — not a LinkedIn skim five minutes late",
    "Follow-up email that cites what you actually discussed — not a generic \"great chatting\"",
    "Lead research card with company context and fit hypotheses",
    "Session notes + action checklist that stop the notepad archaeology",
    "Same supervision rule: nothing emails or writes outside without you",
    "Ops and prep only — not clinical, medical, or therapy advice",
  ],
  costLines: [
    "Coach / consultant assistant handling prep, follow-ups, and notes: often €2,000–4,000 / mo loaded — direction, not a quote for your city.",
    "Orbis Solo (proposed): ~€149 / mo, usage separate — indicative, confirmed before subscription.",
    "Scope: this pack covers the named prep, follow-up, research, and notes missions — not delivery of coaching itself, not your full P&L.",
    "Example math (label as example): 45 min/day on prep + follow-ups + notes × 22 days × €75 practitioner hour ≈ €1,237 / mo of attention — not a promise Orbis returns that cash.",
  ],
  finalTitle: "Run the audit on your coaching and consulting company.",
  faq: coachesConsultantsHubFaq,
  motionJobs:
    "Discovery call booked|Prep brief ready|Lead form + ICP notes from your sources;Post-call notes|Follow-up drafted|Offer lines you still approve before send;Session transcript / notes|Notes + action list|Client-safe summary — you review first",
  tools: "Calendly,Notion,Gmail,LinkedIn,HubSpot,Zoom",
};

export const coachesConsultantsJobLabels: Record<string, string> = {
  "discovery-prep": "discovery prep",
  "follow-up-emails": "follow-up emails",
  "lead-research": "lead research",
  "session-notes": "session notes",
};
