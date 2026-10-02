/**
 * Programmatic SEO verticals (/for, /for/[hub], /for/[hub]/[job]).
 *
 * Copy rules (enforced in verticals.test.ts):
 * - No invented figures, statistics, ROI or time-saved claims. The only number
 *   allowed is the Solo plan price read from src/lib/product/pricing.ts.
 * - Tools: only integrations that exist in src/lib/integrations (Composio
 *   OAuth set, document sources) may appear as a logo. Everything else is
 *   "paste or export the content".
 * - Orbis prepares drafts for human review. Nothing is sent, published,
 *   scheduled or booked by these missions.
 */

export type FaqItem = { q: string; a: string };

/** Connectable integrations (Composio legacy toolkits + knowledge sources). */
export type ToolKey =
  | "gmail"
  | "outlook"
  | "googlecalendar"
  | "googledrive"
  | "sharepoint"
  | "notion"
  | "slack";

/** Runtime contracts supported by the live engine (src/lib/runtime/contracts.ts). */
export type RuntimeContract =
  | "request-analysis"
  | "meeting-prep"
  | "research-brief"
  | "content-draft";

export type WorkshopStep = { input: string; output: string; detail: string };

export type ToolUse = { tool: ToolKey; use: string };

export interface VerticalJob {
  slug: string;
  /** Title Case label, e.g. "Guest Messaging". */
  label: string;
  /** Page H1. */
  title: string;
  /** Lead paragraph, also used as meta description. Plain text, no markdown. */
  summary: string;
  /** Who this is for, and what it is not. */
  fit: string;
  /** Existing catalog flow used to preselect the audit (`/audit?flow=`). */
  catalogFlowId: string;
  /** Must equal the catalog flow's engine. */
  contract: RuntimeContract;
  /** What you give the mission. */
  inputs: string[];
  /** What the draft contains. */
  draft: string[];
  /** What it will not do. */
  boundaries: string[];
  /** Connections that are relevant for this job, and how. */
  connections: ToolUse[];
  /** Tools without a connection: content is pasted or exported. */
  pasteOnly?: string[];
  /** TaskWorkshop illustration steps. */
  steps: WorkshopStep[];
  faq: FaqItem[];
}

export interface VerticalHub {
  slug: string;
  /** Title Case label, e.g. "Airbnb Hosts". */
  label: string;
  /** Title Case SEO title (without the brand suffix). */
  seoTitle: string;
  /** Page H1. */
  title: string;
  /** Hero paragraph (the problem). Also the meta description. */
  lead: string;
  /** Second paragraph introducing the missions (must differ from lead). */
  intro: string;
  /** Who it is for / not for. */
  fit: string;
  /** One-line teaser on the /for index card. */
  teaser: string;
  /** Connectable tools shown in the tool graph. */
  tools: ToolKey[];
  /** Hub-specific honest note on what connects and what is pasted. */
  toolsNote: string;
  principles: string[];
  workshop: WorkshopStep[];
  faq: FaqItem[];
  finalTitle: string;
  jobs: VerticalJob[];
}
