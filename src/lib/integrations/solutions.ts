import type { IntegrationSlug } from "./catalog";

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
    id: "rental",
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
    id: "creator",
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
        alternatives: ["gmail", "outlook"],
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

export const toolDetails: Record<
  IntegrationSlug,
  { category: string; unlocks: string[]; boundary: string }
> = {
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
