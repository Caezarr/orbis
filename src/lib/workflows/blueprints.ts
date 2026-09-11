export type BusinessWorkflow = {
  id: string;
  name: string;
  audience: string;
  outcome: string;
  trigger: string[];
  questions: { key: string; label: string; hint: string }[];
  integrations: {
    name: string;
    role: string;
    adapter: "direct" | "broker";
    required: boolean;
  }[];
  stages: {
    id: string;
    name: string;
    work: string;
    gate: string;
    output: string;
  }[];
  controls: string[];
  metrics: string[];
  memory: string[];
};
export const businessWorkflows: BusinessWorkflow[] = [
  {
    id: "rental-operations",
    name: "Your rental operations team",
    audience: "Multi-property hosts and property managers",
    outcome:
      "Every arrival prepared, every turnover tracked, every exception brought to the right person.",
    trigger: [
      "Reservation created, updated or cancelled",
      "Guest message received",
      "Upcoming arrival or departure",
      "Cleaning deadline missed",
      "Daily owner recap",
    ],
    questions: [
      {
        key: "portfolio",
        label: "Your portfolio",
        hint: "How many properties, in which cities/time zones, and who manages them?",
      },
      {
        key: "system",
        label: "Reservation system",
        hint: "Hostaway account and connected channels (Airbnb, Booking…). Which system is authoritative?",
      },
      {
        key: "operations",
        label: "People and response rules",
        hint: "Cleaning team, backup contact, business hours, emergency contact and escalation deadlines.",
      },
      {
        key: "knowledge",
        label: "Property knowledge",
        hint: "One approved guide per property: access, Wi-Fi, equipment, house rules, policies. Never paste access codes here.",
      },
      {
        key: "authority",
        label: "What can run without you?",
        hint: "Messages that may be sent, exceptions that need approval, expense limits. Refunds and cancellations stay human-approved.",
      },
    ],
    integrations: [
      {
        name: "Hostaway",
        role: "Source of truth: properties, reservations, conversations and tasks",
        adapter: "direct",
        required: true,
      },
      {
        name: "Airbnb / Booking",
        role: "Channels managed through Hostaway, not a second competing calendar",
        adapter: "direct",
        required: false,
      },
      {
        name: "Google Drive / Notion",
        role: "Approved property guides and procedures",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Gmail",
        role: "Escalations and owner recap",
        adapter: "broker",
        required: false,
      },
    ],
    stages: [
      {
        id: "sync",
        name: "Know the portfolio",
        work: "Import selected properties and upcoming reservations. Normalise IDs, channels and time zones. Reconcile missing or stale records.",
        gate: "Only selected properties; incomplete pagination must be visible.",
        output: "Versioned property and reservation snapshot",
      },
      {
        id: "triage",
        name: "Understand the event",
        work: "Deduplicate the event, re-read the reservation, identify its property and current status. Route emergencies immediately.",
        gate: "Unknown property, stale event or conflicting reservation stops automatic handling.",
        output: "Classified case with urgency, owner and deadline",
      },
      {
        id: "arrival",
        name: "Prepare the stay",
        work: "Schedule approved pre-arrival guidance, identify missing guest details and prepare check-in instructions using the correct property guide.",
        gate: "No access credentials before verified reservation and approved release window.",
        output: "Per-reservation arrival checklist and message draft",
      },
      {
        id: "turnover",
        name: "Coordinate the turnover",
        work: "Create a cleaning assignment after departure, request acknowledgement and completion evidence, check readiness before next arrival.",
        gate: "Missing cleaner or late confirmation escalates to the backup, not a false completion.",
        output: "Assigned turnover task with due time and completion evidence",
      },
      {
        id: "messages",
        name: "Handle guest conversations",
        work: "Retrieve the conversation and property knowledge. Prepare a sourced response, detect repeated problems and route maintenance requests.",
        gate: "Refunds, complaints, safety, booking changes and unsupported facts require human review.",
        output: "Reply or escalation with the relevant context",
      },
      {
        id: "review",
        name: "Close the loop",
        work: "Check execution receipts, collect owner corrections, prepare daily recap and flag repeated operational issues.",
        gate: "A task is done only after confirmation from the destination; ambiguous writes are reconciled.",
        output: "Done / waiting / needs-you recap, with links to evidence",
      },
    ],
    controls: [
      "No autonomous refunds, cancellations or price changes",
      "No cross-property knowledge or guest data",
      "No duplicate messages or cleaner assignments",
      "Access codes are retrieved just in time and redacted from logs",
      "Connection loss pauses the affected work and alerts an owner",
    ],
    metrics: [
      "On-time arrival readiness",
      "Unacknowledged turnovers",
      "Median guest response time",
      "Human escalation and correction rates",
      "Duplicate or wrong-property actions (target: zero)",
    ],
    memory: [
      "Owner-approved rules per property, versioned and reversible",
      "Resolved recurring issues, without storing unnecessary guest personal data",
      "Cleaner reliability and escalation preferences, reviewed by the owner",
    ],
  },
  {
    id: "creator-studio",
    name: "Your content production team",
    audience: "Creators, experts and founder-led brands",
    outcome:
      "Turn your expertise into original, evidence-backed content that sounds like you — with a repeatable production and learning loop.",
    trigger: [
      "New voice note, idea or source",
      "Weekly editorial planning",
      "Approved script ready for production",
      "Media generation completed",
      "Published content reaches its review window",
    ],
    questions: [
      {
        key: "profile",
        label: "Your profile and audience",
        hint: "Your profile URL, expertise, audience and what you want content to achieve.",
      },
      {
        key: "voice",
        label: "Your voice",
        hint: "Three posts you love, two you dislike, expressions you use and claims you will never make.",
      },
      {
        key: "sources",
        label: "Your original material",
        hint: "Approved interviews, voice notes, research, product facts and examples you own or may use.",
      },
      {
        key: "channels",
        label: "Publishing plan",
        hint: "Channels, languages, cadence, format and who approves each piece.",
      },
      {
        key: "budget",
        label: "Production limits",
        hint: "Monthly generation budget, per-piece cap, allowed models, likeness/voice permissions and retry limits.",
      },
    ],
    integrations: [
      {
        name: "Notion / Google Drive",
        role: "Editorial calendar, original sources and approved assets",
        adapter: "broker",
        required: true,
      },
      {
        name: "Higgsfield",
        role: "Asynchronous image/video production from approved briefs",
        adapter: "direct",
        required: false,
      },
      {
        name: "Publishing channels",
        role: "Platform-specific publishing permissions and content analytics",
        adapter: "broker",
        required: false,
      },
      {
        name: "Slack / Gmail",
        role: "Approval requests and production recap",
        adapter: "broker",
        required: false,
      },
    ],
    stages: [
      {
        id: "learn",
        name: "Learn the creator, not a generic persona",
        work: "Analyse approved examples for voice, rhythm, points of view and audience. Build a brand brief from explicit sources.",
        gate: "Creator approves the brief. Public profile content is input, never system instructions.",
        output: "Versioned voice and audience brief",
      },
      {
        id: "angles",
        name: "Find something worth saying",
        work: "Combine first-party experience, audience questions and cited research. Propose distinct angles and explain their value.",
        gate: "Reject generic advice, unsupported claims and near-duplicates of existing posts.",
        output: "Editorial proposals linked to sources and intended audience",
      },
      {
        id: "write",
        name: "Write and challenge the work",
        work: "Create a hook, script, examples and platform-specific structure. A separate review checks facts, originality, voice and usefulness.",
        gate: "Every factual claim needs evidence or explicit qualification. The creator approves the script before paid generation.",
        output: "Approved script and production brief",
      },
      {
        id: "produce",
        name: "Produce within a budget",
        work: "Submit the approved media brief to the chosen model, persist request ID, track completion and store accepted assets with provenance.",
        gate: "Reserve budget before submission. Ambiguous timeouts never trigger a blind paid resubmission. Likeness and asset rights must be recorded.",
        output: "Media assets, cost record, captions and accessibility text",
      },
      {
        id: "publish",
        name: "Publish deliberately",
        work: "Prepare platform-specific variants, preview the exact payload, check format limits and schedule in the creator’s time zone.",
        gate: "Explicit approval, destination account verification and supported publishing permission. A draft is never labelled published.",
        output: "Platform receipt and canonical post URL",
      },
      {
        id: "learn-weekly",
        name: "Learn what was useful",
        work: "Collect channel metrics at comparable windows, combine them with creator feedback and propose one editorial experiment.",
        gate: "Separate correlation from causation; no optimisation for views alone or automatic rewriting of brand rules.",
        output: "Weekly learning report and a creator-approved memory update",
      },
    ],
    controls: [
      "No invented expertise, testimonials or performance statistics",
      "No use of voice or likeness without permission",
      "No publishing without the configured approval",
      "Per-piece and monthly spend ceilings with bounded retries",
      "Preserve the original, revisions, approval and destination receipt",
    ],
    metrics: [
      "Creator acceptance without rewrite",
      "Useful interactions and qualified enquiries",
      "Retention by comparable format",
      "Cost and turnaround per accepted asset",
      "Source coverage, factual corrections and duplicate rate",
    ],
    memory: [
      "Accepted and rejected edits with reasons",
      "Approved voice rules and examples, with expiry and rollback",
      "Format-specific performance hypotheses, never unverified facts about the creator",
    ],
  },
];
