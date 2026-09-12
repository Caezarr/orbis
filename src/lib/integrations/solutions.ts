import { integrations, type IntegrationSlug } from "./catalog";

export type ConnectionState =
  | "connected"
  | "needs_auth"
  | "not_connected"
  | "not_configured"
  | "unverified"
  | "error";
export type ToolRequirement = {
  label: string;
  description: string;
  alternatives: IntegrationSlug[];
  optional?: boolean;
};
export const solutions: {
  id: string;
  name: string;
  outcome: string;
  href: string;
  requirements: ToolRequirement[];
  specialist?: string;
}[] = [
  {
    id: "rental-operations",
    name: "Run my rental operations",
    outcome:
      "Guest requests, arrivals and turnovers. One operating brief for every property.",
    href: "/workflows/rental-operations",
    specialist:
      "Hostaway is the reservation source of truth. Connect and test a permitted property in your rental setup; Airbnb and Booking.com stay behind your property manager.",
    requirements: [
      {
        label: "Property knowledge",
        description: "House rules, check-in instructions and approved answers.",
        alternatives: ["googledrive", "notion"],
      },
      {
        label: "Team alerts",
        description: "Send exceptions to the people who can resolve them.",
        alternatives: ["slack", "gmail", "outlook"],
      },
      {
        label: "Team calendar",
        description: "Coordinate the team around arrivals and departures.",
        alternatives: ["googlecalendar"],
        optional: true,
      },
    ],
  },
  {
    id: "creator-studio",
    name: "Build my content studio",
    outcome:
      "Your voice, your source material, a clear review process. From an idea to a production brief.",
    href: "/workflows/creator-studio",
    specialist:
      "Higgsfield production is scoped in your studio setup: approved scripts, asset rights and a spending limit before any generation. Connecting documents alone does not activate media production.",
    requirements: [
      {
        label: "Voice & source material",
        description:
          "Your best work, audience insights and approved references.",
        alternatives: ["googledrive", "notion"],
      },
      {
        label: "Review channel",
        description: "Know which scripts and assets need your decision.",
        alternatives: ["slack", "gmail", "outlook"],
      },
      {
        label: "Editorial calendar",
        description: "Keep the publishing plan visible to your team.",
        alternatives: ["googlecalendar"],
        optional: true,
      },
    ],
  },
  {
    id: "customers",
    name: "Take care of my customers",
    outcome:
      "Bring conversations and company knowledge together. Prepare answers your team can trust.",
    href: "/chat",
    requirements: [
      {
        label: "Customer inbox",
        description: "Choose the inbox where requests actually arrive.",
        alternatives: ["gmail", "outlook", "zendesk", "intercom", "freshdesk"],
      },
      {
        label: "Approved knowledge",
        description:
          "Policies, product details and answers grounded in your business.",
        alternatives: ["googledrive", "notion"],
      },
      {
        label: "Team escalation",
        description: "Give sensitive requests a human owner.",
        alternatives: ["slack"],
        optional: true,
      },
    ],
  },
  ...([
    ["ecommerce-operations", "Run my store operations", "Review orders, fulfillment and customer exceptions.", "Store orders", ["shopify", "woocommerce"]],
    ["sales-operations", "Keep my sales pipeline moving", "Prepare account context and the next follow-up.", "Sales pipeline", ["hubspot", "salesforce", "pipedrive", "close"]],
    ["recruiting-operations", "Coordinate my hiring", "Review candidates and prepare interview handoffs.", "Candidate pipeline", ["greenhouse", "lever", "ashby", "workable"]],
    ["agency-operations", "Coordinate my client delivery", "Track project commitments and prepare client updates.", "Client projects", ["asana", "clickup", "monday", "trello"]],
    ["finance-operations", "Prepare my finance operations", "Review invoices and flag reconciliation exceptions.", "Accounting records", ["quickbooks", "xero", "pennylane", "sage"]],
    ["professional-services", "Prepare my client engagements", "Bring proposals, agreements and delivery context together.", "Client agreements", ["docusign", "pandadoc"]],
    ["field-services", "Coordinate my field team", "Prepare visit context and identify dispatch exceptions.", "Service jobs", ["jobber", "servicetitan"]],
  ] satisfies [string, string, string, string, IntegrationSlug[]][]).map(([id, name, outcome, label, alternatives]) => ({
    id, name, outcome, href: `/chat?vertical=${id}`,
    requirements: [
      { label, description: "Connect the system that holds your operational records.", alternatives },
      { label: "Approved knowledge", description: "Policies and instructions for this mission.", alternatives: ["googledrive", "notion"] as IntegrationSlug[] },
      { label: "Team handoffs", description: "A channel for review and exceptions.", alternatives: ["slack", "gmail", "outlook"] as IntegrationSlug[], optional: true },
    ],
  })),
];

export function requirementStatus(
  requirement: ToolRequirement,
  states: Partial<Record<IntegrationSlug, ConnectionState>>,
) {
  const connected = requirement.alternatives.find(
    (slug) => states[slug] === "connected",
  );
  return { satisfied: !!connected, connected };
}

export function solutionReadiness(
  requirements: ToolRequirement[],
  states: Partial<Record<IntegrationSlug, ConnectionState>>,
) {
  const required = requirements.filter((r) => !r.optional);
  const connected = required.filter(
    (r) => requirementStatus(r, states).satisfied,
  ).length;
  return {
    connected,
    total: required.length,
    connectionsReady: required.length > 0 && connected === required.length,
  };
}

const specificDetails: Partial<Record<
  IntegrationSlug,
  { category: string; unlocks: string[]; boundary: string }
>> = {
  gmail: {
    category: "Communication",
    unlocks: [
      "Customer reply preparation",
      "Follow-up drafts",
      "Daily recap delivery",
    ],
    boundary:
      "Approve the requested Google permissions during sign-in. An inbox connection is not permission to send an email.",
  },
  outlook: {
    category: "Communication",
    unlocks: ["Customer request triage", "Reply preparation", "Team handoffs"],
    boundary:
      "Use the Microsoft account intended for this workspace. Sending still requires a mission policy and approval.",
  },
  slack: {
    category: "Communication",
    unlocks: [
      "Exception alerts",
      "Review notifications",
      "Operational handoffs",
    ],
    boundary:
      "Keep access to the channels relevant to the mission. Connecting Slack does not automatically post messages.",
  },
  googlecalendar: {
    category: "Planning",
    unlocks: [
      "Availability context",
      "Editorial scheduling",
      "Team coordination",
    ],
    boundary:
      "Calendar access and permission to create or move an event are separate decisions.",
  },
  googledrive: {
    category: "Knowledge",
    unlocks: [
      "Approved source documents",
      "Brand references",
      "Property guides",
    ],
    boundary:
      "Select the knowledge scope separately. Connecting an account does not mean every file should become agent knowledge.",
  },
  notion: {
    category: "Knowledge",
    unlocks: ["Company playbooks", "Editorial briefs", "Reusable instructions"],
    boundary:
      "Share only the relevant pages with the integration, then define the mission’s knowledge scope.",
  },
};

export const toolDetails = Object.fromEntries(integrations.map((tool) => [tool.slug, {
  category: tool.category,
  unlocks: [tool.purpose],
  boundary: "These are potential uses, not verified OAuth scopes. Review provider consent and define mission access separately. Account access does not authorize sending, publishing or spending.",
  ...specificDetails[tool.slug],
}])) as Record<IntegrationSlug, { category: string; unlocks: string[]; boundary: string }>;

// Render only after the host supplies a server-authorized administrator role.
export function administratorSetup(slug: IntegrationSlug) {
  return `Verify that the provider offers this toolkit in your Composio project. Set COMPOSIO_TOOLKIT_${slug.toUpperCase()} to its exact toolkit slug and COMPOSIO_AUTH_CONFIG_${slug.toUpperCase()} to an enabled auth configuration for that toolkit. Set COMPOSIO_API_KEY on the server, review least-privilege permissions and allow the /connections callback. Then sign in and refresh to verify the account. If the toolkit is unavailable, leave this entry discoverable only; use the specialist setup where available. Never paste provider secrets into chat.`;
}
