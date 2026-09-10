/**
 * Programmatic SEO vertical data (Wave 1)
 * 
 * Each hub represents a business vertical with associated job pages.
 * Motion jobs format: "Action|Result;Action|Result;..."
 * Tools format: comma-separated list
 * Missions format: comma-separated capability tags
 */

export interface VerticalJob {
  hub: string;
  job: string;
  missions: string;
  tools: string;
  motionJobs: string;
}

// Hub metadata for landing pages
export interface HubMeta {
  hub: string;
  label: string;
  tagline: string;
  pain: string;
}

// Airbnb hosts vertical
const airbnbHostsJobs: VerticalJob[] = [
  {
    hub: "airbnb-hosts",
    job: "guest-messaging",
    missions: "customer-request,sourced-content",
    tools: "Airbnb,Gmail,WhatsApp,Google Calendar",
    motionJobs: "Reply to a guest|Guest reply prepared;Answer a review|Review reply drafted;Update listing copy|Listing blurb ready",
  },
  {
    hub: "airbnb-hosts",
    job: "review-replies",
    missions: "customer-request,sourced-content",
    tools: "Airbnb,Gmail,Notion",
    motionJobs: "Review inbox item|Reply drafted;Tone check|Reply approved-ready;FAQ from house rules|Answer prepared",
  },
  {
    hub: "airbnb-hosts",
    job: "listing-copy",
    missions: "sourced-content,research",
    tools: "Airbnb,Google Docs,Notion",
    motionJobs: "Listing brief|Blurb drafted;Amenity list|Highlights written;Photo captions|Captions ready",
  },
  {
    hub: "airbnb-hosts",
    job: "cleaning-handoff",
    missions: "customer-request,sourced-content",
    tools: "Airbnb,WhatsApp,Google Calendar",
    motionJobs: "Checkout note|Cleaner brief ready;Issue report|Handoff ticket drafted;Restock list|Checklist prepared",
  },
  {
    hub: "airbnb-hosts",
    job: "pricing-notes",
    missions: "research,sourced-content",
    tools: "Airbnb,Sheets,Google Calendar",
    motionJobs: "Comp scan|Pricing note drafted;Weekend surge|Price suggestion ready;Gap night|Promo blurb prepared",
  },
];

// Content creators vertical
const contentCreatorsJobs: VerticalJob[] = [
  {
    hub: "content-creators",
    job: "content-drafts",
    missions: "sourced-content,research",
    tools: "Notion,Google Docs,Instagram,TikTok",
    motionJobs: "Topic|Draft ready;Hook list|Hooks written;Caption pack|Captions drafted",
  },
  {
    hub: "content-creators",
    job: "research-briefs",
    missions: "research,sourced-content",
    tools: "Notion,Chrome,YouTube",
    motionJobs: "Topic|Research brief;Competitor scan|Notes ready;Source pack|Citations listed",
  },
  {
    hub: "content-creators",
    job: "sponsorship-replies",
    missions: "customer-request,sourced-content",
    tools: "Gmail,Notion,Instagram",
    motionJobs: "Brand email|Reply prepared;Rate card ask|Quote drafted;Collab brief|Scope reply ready",
  },
  {
    hub: "content-creators",
    job: "calendar-prep",
    missions: "sourced-content,meeting-prep",
    tools: "Notion,Google Calendar,Later",
    motionJobs: "Week plan|Calendar draft;Batch day|Shot list ready;Deadlines|Reminder brief prepared",
  },
];

// Coaches and consultants vertical
const coachesConsultantsJobs: VerticalJob[] = [
  {
    hub: "coaches-consultants",
    job: "discovery-prep",
    missions: "meeting-prep,research",
    tools: "Calendly,Notion,Gmail,LinkedIn",
    motionJobs: "Discovery call|Prep brief;Lead form|Context pack;ICP check|Fit notes ready",
  },
  {
    hub: "coaches-consultants",
    job: "follow-up-emails",
    missions: "customer-request,sourced-content",
    tools: "Gmail,Notion,HubSpot",
    motionJobs: "Post-call|Follow-up drafted;No-show|Reschedule note;Proposal send|Cover email ready",
  },
  {
    hub: "coaches-consultants",
    job: "lead-research",
    missions: "research,meeting-prep",
    tools: "LinkedIn,Chrome,Notion",
    motionJobs: "Lead|Research brief;Company|Context card;Pain hypotheses|Notes ready",
  },
  {
    hub: "coaches-consultants",
    job: "session-notes",
    missions: "meeting-prep,sourced-content",
    tools: "Notion,Zoom,Gmail",
    motionJobs: "Session|Notes drafted;Action items|Checklist ready;Client update|Summary email",
  },
];

const hubMetadata: Record<string, HubMeta> = {
  "airbnb-hosts": {
    hub: "airbnb-hosts",
    label: "Airbnb hosts",
    tagline: "Install the busywork of hosting into Orbis.",
    pain: "Guest messages at midnight. Review replies that need just the right tone. Cleaning handoffs that somehow take an hour. You're running a hospitality business, not managing an inbox.",
  },
  "content-creators": {
    hub: "content-creators",
    label: "Content creators",
    tagline: "Install the busywork of content creation into Orbis.",
    pain: "Research that takes longer than filming. Captions that need eight drafts. Sponsorship emails at 11 PM. You started creating to make things, not to manage an assembly line.",
  },
  "coaches-consultants": {
    hub: "coaches-consultants",
    label: "Coaches & consultants",
    tagline: "Install the busywork of client operations into Orbis.",
    pain: "Discovery prep that takes an hour. Follow-ups you write at 10 PM. Lead research before every call. You're selling expertise, not managing admin.",
  },
};

// Job labels (human-readable)
const jobLabels: Record<string, string> = {
  "guest-messaging": "guest messaging",
  "review-replies": "review replies",
  "listing-copy": "listing copy",
  "cleaning-handoff": "cleaning handoff",
  "pricing-notes": "pricing notes",
  "content-drafts": "content drafts",
  "research-briefs": "research briefs",
  "sponsorship-replies": "sponsorship replies",
  "calendar-prep": "calendar prep",
  "discovery-prep": "discovery prep",
  "follow-up-emails": "follow-up emails",
  "lead-research": "lead research",
  "session-notes": "session notes",
};

// All verticals data (currently airbnb-hosts, content-creators, coaches-consultants)
export const verticals: VerticalJob[] = [
  ...airbnbHostsJobs,
  ...contentCreatorsJobs,
  ...coachesConsultantsJobs,
];

// Helper functions
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

// Parse motion jobs into structured format
export function parseMotionJobs(motionJobs: string): Array<{ action: string; result: string }> {
  return motionJobs.split(";").map((pair) => {
    const [action, result] = pair.split("|");
    return { action: action.trim(), result: result.trim() };
  });
}

// Parse tools into array
export function parseTools(tools: string): string[] {
  return tools.split(",").map((t) => t.trim());
}

// Parse missions into array
export function parseMissions(missions: string): string[] {
  return missions.split(",").map((m) => m.trim());
}
