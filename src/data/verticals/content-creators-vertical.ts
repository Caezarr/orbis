/**
 * Content-creators vertical data (Wave 1). MotionJobs for TaskWorkshop (CTO).
 */
import { contentCreatorsHubFaq, contentCreatorsJobFaq, type FaqItem } from "./content-creators-faq";

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

export const contentCreatorsJobs: VerticalJob[] = [
  {
    hub: "content-creators",
    job: "content-drafts",
    missions: "sourced-content,research",
    tools: "Notion,Google Docs,Instagram,TikTok",
    motionJobs:
      "Topic + angle|Draft ready|Voice notes from your past posts;Hook list brief|Hooks written|Unknowns flagged if niche examples missing;Caption pack request|Captions drafted|CTA lines from your usual pattern",
    motionDetails:
      "Voice + niche notes from your sources;Unknowns flagged when voice notes are thin",
    h1: "Install content drafts into your company.",
    h2: "You already paste topics and half-hooks into ChatGPT. Orbis turns that into a bounded mission on *your* niche and voice: a draft with sources and unknowns, then you publish.",
    micro: MICRO,
    icp: "For creators stuck rewriting the same carousel and Reel openers. Not an agency content factory.",
    badge: BADGE,
    valueStack: [
      "Script / caption / carousel draft on *your* voice",
      "Hooks grounded in niche notes — or unknowns called out",
      "Same mission tomorrow — not a new empty chat",
      "You still publish",
    ],
    costLines: [
      "Creator VA slice on drafts: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative, confirmed before subscription.",
      "Scope: named content-draft missions — not editing or brand strategy.",
    ],
    finalTitle: "Run the audit on your content creation company.",
    faq: contentCreatorsJobFaq["content-drafts"],
    maturity: "Ready",
    before: "blank Docs + three ChatGPT threads",
    after: "draft + hooks from your niche notes",
    guardrail: "you publish",
  },
  {
    hub: "content-creators",
    job: "research-briefs",
    missions: "research,sourced-content",
    tools: "Notion,Chrome,YouTube",
    motionJobs:
      "Topic to research|Research brief|Citations listed from sources you selected;Competitor video / post|Notes ready|Angle gaps flagged as unknowns;Source pack|Citations listed|Thin sources called out before you film",
    h1: "Install research briefs into your company.",
    h2: "You already paste competitor links and half-watched videos into ChatGPT. Orbis turns that into a bounded mission on *your* niche: a research brief with citations and gaps, then you decide what ships on camera.",
    micro: MICRO,
    icp: "For creators who research before they film. Not a newsroom OS.",
    badge: BADGE,
    valueStack: [
      "Research brief with citations listed",
      "Gaps flagged when a source is thin",
      "You decide what ships on camera",
    ],
    costLines: [
      "Research VA slice: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
      "Scope: named research-brief missions — not a full editorial desk.",
    ],
    finalTitle: "Run the audit on your content creation company.",
    faq: contentCreatorsJobFaq["research-briefs"],
    maturity: "Ready",
    before: "12 tabs and a half-remembered competitor video",
    after: "brief with citations and gaps",
    guardrail: "you decide what ships on camera",
  },
  {
    hub: "content-creators",
    job: "sponsorship-replies",
    missions: "customer-request,sourced-content",
    tools: "Gmail,Notion,Instagram",
    motionJobs:
      "Brand inbound email|Reply prepared|Tone + rate card lines from your sources;Rate card ask|Quote drafted|Unknowns flagged if package prices missing;Collab brief|Scope reply ready|Deliverables list you still approve",
    h1: "Install sponsorship replies into your company.",
    h2: "You already paste brand emails into ChatGPT. Orbis turns that into a bounded mission on *your* rate card and deliverables: a reply draft with sources, then you send and negotiate.",
    micro: MICRO,
    icp: "For creators drowning in \"we'd love to collab\" inboxes. Not a full media sales CRM.",
    badge: BADGE,
    valueStack: [
      "Sponsor reply that cites your rate card and deliverable scope",
      "Unknowns flagged when rates are missing",
      "You still send and negotiate",
    ],
    costLines: [
      "Inbox VA on brand replies: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
      "Scope: named sponsorship-reply missions — not deal closing.",
    ],
    finalTitle: "Run the audit on your content creation company.",
    faq: contentCreatorsJobFaq["sponsorship-replies"],
    maturity: "Ready",
    before: "brand email sitting while you hunt the rate card",
    after: "reply draft tied to rates + deliverables",
    guardrail: "you send and negotiate",
  },
  {
    hub: "content-creators",
    job: "calendar-prep",
    missions: "sourced-content,research",
    tools: "Notion,Google Calendar,Later",
    motionJobs:
      "Week themes|Calendar draft|Slots from your usual cadence;Batch day brief|Shot list ready|Unknowns if props / locations missing;Sponsor + organic deadlines|Reminder brief prepared|You lock dates before scheduling tools",
    h1: "Install calendar prep into your company.",
    h2: "You already paste week plans and batch lists into ChatGPT. Orbis turns that into a bounded mission on *your* content calendar: a week draft with sources, then you lock the schedule.",
    micro: MICRO,
    icp: "For creators who batch and still scramble on Thursday. Not a social-media scheduling product replacement.",
    badge: BADGE,
    valueStack: [
      "Week calendar + shot list that stops the Thursday scramble",
      "Deadline brief grounded in your batch notes",
      "You lock the calendar",
    ],
    costLines: [
      "Ops VA on calendar prep: part of €2,000–4,000 / mo loaded — direction, not a quote.",
      "Orbis Solo (proposed): ~€149 / mo — indicative.",
      "Scope: named calendar-prep missions — not auto-scheduling posts.",
    ],
    finalTitle: "Run the audit on your content creation company.",
    faq: contentCreatorsJobFaq["calendar-prep"],
    maturity: "Ready",
    before: "sticky notes and a half-filled Later queue",
    after: "week plan + shot list + deadline brief",
    guardrail: "you lock the calendar",
  },
];

export const contentCreatorsHubMeta: HubMeta = {
    hub: "content-creators",
    label: "Content creators",
    who: "content creators and solopreneurs",
    tagline: "Install the busywork of content creation into Orbis.",
    pain: "You already paste drafts, research tabs, and brand emails into ChatGPT. Orbis turns content drafts, research briefs, sponsorship replies, and calendar prep into bounded missions on *your* niche and voice: test the result, check sources and unknowns, activate under supervision.",
    h2: "You already paste drafts, research tabs, and brand emails into ChatGPT. Orbis turns content drafts, research briefs, sponsorship replies, and calendar prep into bounded missions on *your* niche and voice: test the result, check sources and unknowns, activate under supervision.",
    micro: MICRO,
    icp: "For creators shipping weekly. Not an agency media OS. Not an agent lab.",
    badge: BADGE,
    valueStack: [
      "Script / caption / carousel draft on *your* voice — not a blank ChatGPT thread that forgets last week's hooks",
      "Research brief with citations listed — or unknowns flagged when a source is thin",
      "Sponsor reply that cites your rate card and deliverable scope",
      "Week calendar + shot list that stops the \"what do I film Thursday\" scramble",
      "Same supervision rule: nothing posts, emails, or schedules outside without you",
    ],
    costLines: [
      "Creator VA / content assistant handling drafts + research + brand inbox: often €2,000–4,000 / mo loaded — direction, not a quote for your city.",
      "Orbis Solo (proposed): ~€149 / mo, usage separate — indicative, confirmed before subscription.",
      "Scope: this pack covers the named draft, research, sponsorship, and calendar missions — not your full media company, not brand strategy, not editing.",
      "Example math (label as example): 50 min/day on drafts + sponsor replies + research × 22 days × €60 founder hour ≈ €1,100 / mo of attention — not a promise Orbis returns that cash.",
    ],
    finalTitle: "Run the audit on your content creation company.",
    faq: contentCreatorsHubFaq,
    motionJobs:
      "Topic + angle|Draft ready|Voice + niche notes from your sources;Brand inbound email|Sponsor reply prepared|Rate card + deliverables you approve;Batch week|Shot list + calendar draft|You lock the schedule before it ships",
    tools: "Notion,Google Docs,Instagram,TikTok,Gmail,YouTube,Google Calendar,Later",
  };

export const contentCreatorsJobLabels: Record<string, string> = {
  "content-drafts": "content drafts",
  "research-briefs": "research briefs",
  "sponsorship-replies": "sponsorship replies",
  "calendar-prep": "calendar prep",
};
