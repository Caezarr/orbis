import type { CrewSpec } from "@/lib/domain/types";

export const CREWS: Record<string, CrewSpec> = {
  "research-brief": {
    process: "sequential",
    department: "Growth",
    whyNow: "Public buyers in your category ask for eligibility before price. A sourced brief is the cheapest first result.",
    roles: [
      { id: "researcher", role: "Researcher", goal: "Find dated, relevant sources", cannot: ["invent_facts"] },
      { id: "filter", role: "Editor", goal: "Drop duplicates and stale pages", cannot: ["add_unsourced_claims"] },
      { id: "reviewer", role: "Reviewer", goal: "Name unknowns instead of filling gaps", cannot: ["send_email"] },
    ],
  },
  "meeting-prep": {
    process: "sequential",
    department: "Operations",
    whyNow: "A named meeting is already on the calendar. Prep now costs less than discovering the gap in the room.",
    roles: [
      { id: "identity", role: "Briefing lead", goal: "Identify who walks in and why", cannot: ["invent_titles"] },
      { id: "writer", role: "Writer", goal: "Produce questions and a one-page brief", cannot: ["promise_terms"] },
      { id: "verifier", role: "Verifier", goal: "Strip unsupported facts", cannot: ["send_email"] },
    ],
  },
  "content-draft": {
    process: "sequential",
    department: "Growth",
    whyNow: "You already have tone and company facts. A draft is ready to test; publishing stays blocked.",
    roles: [
      { id: "gather", role: "Source gatherer", goal: "Collect approved claims only", cannot: ["scrape_unapproved"] },
      { id: "writer", role: "Writer", goal: "Draft in brand voice", cannot: ["publish"] },
      { id: "citer", role: "Citer", goal: "Bind every claim to a source", cannot: ["hide_unknowns"] },
    ],
  },
  "request-analysis": {
    process: "sequential",
    department: "Customer Care",
    whyNow: "Inbound requests already arrive. The missing delivery constraint is visible. A reply can be prepared without inventing a price.",
    roles: [
      { id: "reader", role: "Request reader", goal: "Extract requirements without adding any", cannot: ["invent_prices"] },
      { id: "matcher", role: "Catalog matcher", goal: "Map to approved facts only", cannot: ["change_catalog"] },
      { id: "drafter", role: "Reply drafter", goal: "Write a sendable draft in the customer language", cannot: ["send_email"] },
      { id: "verifier", role: "Policy verifier", goal: "Block writes and flag unknowns", cannot: ["override_broker"] },
    ],
  },
  "quote-prep": {
    process: "hierarchical",
    department: "Sales",
    whyNow: "Quotes need integer money math and a human signature. Composable until the catalog is complete.",
    roles: [
      { id: "manager", role: "Quote manager", goal: "Keep calculation deterministic", cannot: ["send_quote"] },
      { id: "pricer", role: "Pricer", goal: "Use catalog version only", cannot: ["invent_line_items"] },
    ],
  },
  "tender-analysis": {
    process: "sequential",
    department: "Sales",
    whyNow: "Tenders punish missed deadlines. Planned until document ingestion is proven.",
    roles: [
      { id: "parser", role: "Tender parser", goal: "List eligibility and dates", cannot: ["submit_tender"] },
    ],
  },
  "lead-ops": {
    process: "sequential",
    department: "Growth",
    whyNow: "Lead writes need CRM as source of truth and a consent policy. Planned until HubSpot is connected.",
    roles: [
      { id: "enricher", role: "Enricher", goal: "Dedupe then score against ICP", cannot: ["crm_write"] },
    ],
  },
};

export function getCrew(slug: string): CrewSpec {
  return (
    CREWS[slug] ?? {
      process: "sequential",
      department: "Operations",
      whyNow: "A bounded first result exists for this request.",
      roles: [{ id: "operator", role: "Operator", goal: "Produce a reviewable artifact", cannot: ["send_email"] }],
    }
  );
}
