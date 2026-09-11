export const integrations = [
  {
    slug: "gmail",
    name: "Gmail",
    purpose: "Customer conversations and daily recaps",
  },
  { slug: "outlook", name: "Outlook", purpose: "Email and team communication" },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    purpose: "Schedules and availability",
  },
  {
    slug: "googledrive",
    name: "Google Drive",
    purpose: "Approved documents and media",
  },
  {
    slug: "notion",
    name: "Notion",
    purpose: "Knowledge and editorial planning",
  },
  {
    slug: "slack",
    name: "Slack",
    purpose: "Operational alerts and team decisions",
  },
] as const;
export type IntegrationSlug = (typeof integrations)[number]["slug"];
export function isIntegrationSlug(value: string): value is IntegrationSlug {
  return integrations.some((i) => i.slug === value);
}
