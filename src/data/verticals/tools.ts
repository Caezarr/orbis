import type { ToolKey } from "./types";

/**
 * Integrations that exist in code today:
 * - OAuth through Composio: Gmail, Outlook, Google Calendar, Google Drive,
 *   Notion, Slack (src/lib/integrations/composio.ts) and SharePoint
 *   (COMPOSIO_TOOLKIT_SHAREPOINT in .env.example).
 * - Selectable knowledge sources: SharePoint, Google Drive, Notion
 *   (src/lib/knowledge/remote.ts).
 * `logo` must exist in public/brand/tools (checked in verticals.test.ts).
 */
export const TOOLS: Record<
  ToolKey,
  { name: string; logo?: string; kind: "source" | "account" }
> = {
  gmail: { name: "Gmail", logo: "gmail", kind: "account" },
  outlook: { name: "Outlook", logo: "microsoftoutlook", kind: "account" },
  googlecalendar: { name: "Google Calendar", logo: "googlecalendar", kind: "account" },
  googledrive: { name: "Google Drive", logo: "googledrive", kind: "source" },
  sharepoint: { name: "SharePoint", kind: "source" },
  notion: { name: "Notion", logo: "notion", kind: "source" },
  slack: { name: "Slack", logo: "slack", kind: "account" },
};

/** Generic, factual description of what a connection does today. */
export function toolRole(key: ToolKey): string {
  return TOOLS[key].kind === "source"
    ? "Select documents or pages as mission sources"
    : "Can be connected to your workspace; drafts are not sent from Orbis";
}

export function toolLogoPath(key: ToolKey): string | null {
  const logo = TOOLS[key].logo;
  return logo ? `/brand/tools/${logo}.svg` : null;
}
