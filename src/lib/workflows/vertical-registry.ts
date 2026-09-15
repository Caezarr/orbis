import type { BusinessWorkflow } from "./blueprints";

/** Design-time contracts, not a claim of connected tools or running automation. */
export const verticalRegistry: BusinessWorkflow[] = [
  {
    id: "rental-operations",
    vertical: "Rentals",
    name: "Every stay ready on time",
    audience: "Multi-property hosts and property managers",
    outcome: "Every stay ready on time",
    trigger: [
      "Reservation confirmed or changed",
      "Departure approaching",
      "Guest question received",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "Which properties, local time zones and cleaner backup contacts are in scope?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "Property guide and cleaner roster. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Who authorizes access release, guest replies and emergency dispatch?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "Hostaway / Guesty / Lodgify",
        role: "Reservation and property records",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "Property guide and cleaner roster",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "arrival",
        name: "Prepare an arrival",
        outcome: "Arrival checklist, timed message and missing guest details",
        acceptance:
          "Deliver arrival checklist, timed message and missing guest details within one reservation; one property; next 7 days; cite the supplied evidence and flag missing inputs. Verify guest identity and access release window; never expose codes in drafts.",
        unit: "reservation",
        input: "Confirmed booking and approved property guide",
        output: "Arrival checklist, timed message and missing guest details",
        limit: "One reservation; one property; next 7 days",
        policy:
          "Verify guest identity and access release window; never expose codes in drafts",
        tools: [
          "Hostaway / Guesty / Lodgify",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "turnover",
        name: "Coordinate a turnover",
        outcome:
          "Cleaning assignment proposal, readiness deadline and evidence checklist",
        acceptance:
          "Deliver cleaning assignment proposal, readiness deadline and evidence checklist within one turnover; one backup escalation; cite the supplied evidence and flag missing inputs. Completion requires cleaner evidence; missed deadlines escalate.",
        unit: "turnover",
        input: "Departure time, next arrival and cleaner availability",
        output:
          "Cleaning assignment proposal, readiness deadline and evidence checklist",
        limit: "One turnover; one backup escalation",
        policy:
          "Completion requires cleaner evidence; missed deadlines escalate",
        tools: [
          "Hostaway / Guesty / Lodgify",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "guest-reply",
        name: "Resolve a guest question",
        outcome:
          "Sourced response with unresolved questions and escalation owner",
        acceptance:
          "Deliver sourced response with unresolved questions and escalation owner within one conversation; up to 20 messages; cite the supplied evidence and flag missing inputs. Refunds, safety issues and booking changes require owner approval.",
        unit: "conversation",
        input: "Guest thread and current property guide",
        output:
          "Sourced response with unresolved questions and escalation owner",
        limit: "One conversation; up to 20 messages",
        policy:
          "Refunds, safety issues and booking changes require owner approval",
        tools: [
          "Hostaway / Guesty / Lodgify",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "arrival",
        name: "Prepare an arrival",
        work: "Use confirmed booking and approved property guide. Scope: one reservation; one property; next 7 days.",
        output: "Arrival checklist, timed message and missing guest details",
        gate: "Verify guest identity and access release window; never expose codes in drafts",
      },
      {
        id: "turnover",
        name: "Coordinate a turnover",
        work: "Use departure time, next arrival and cleaner availability. Scope: one turnover; one backup escalation.",
        output:
          "Cleaning assignment proposal, readiness deadline and evidence checklist",
        gate: "Completion requires cleaner evidence; missed deadlines escalate",
      },
      {
        id: "guest-reply",
        name: "Resolve a guest question",
        work: "Use guest thread and current property guide. Scope: one conversation; up to 20 messages.",
        output:
          "Sourced response with unresolved questions and escalation owner",
        gate: "Refunds, safety issues and booking changes require owner approval",
      },
    ],
    controls: [
      "Verify guest identity and access release window; never expose codes in drafts",
      "Completion requires cleaner evidence; missed deadlines escalate",
      "Refunds, safety issues and booking changes require owner approval",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted reservation outputs, correction rate and turnaround",
      "Accepted turnover outputs, correction rate and turnaround",
      "Accepted conversation outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved rentals rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
  {
    id: "creator-studio",
    vertical: "Creators",
    name: "An original content package ready to publish",
    audience: "Creators, experts and founder-led brands",
    outcome: "An original content package ready to publish",
    trigger: [
      "Weekly editorial planning",
      "Angle approved",
      "Script approved for production",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "Which audience, channels and three voice examples should guide the work?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "Voice examples and approved asset rights. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Who approves claims, likeness rights, generation spend and publishing?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "Notion / Google Drive / Dropbox",
        role: "Source material and editorial calendar",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "Voice examples and approved asset rights",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "editorial",
        name: "Plan the next content series",
        outcome: "Five distinct angles with source links and channel fit",
        acceptance:
          "Deliver five distinct angles with source links and channel fit within five angles; one audience; one week; cite the supplied evidence and flag missing inputs. Reject unsupported expertise and derivative claims.",
        unit: "editorial plan",
        input: "Audience questions, original sources and brand brief",
        output: "Five distinct angles with source links and channel fit",
        limit: "Five angles; one audience; one week",
        policy: "Reject unsupported expertise and derivative claims",
        tools: [
          "Notion / Google Drive / Dropbox",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "script",
        name: "Turn an idea into a script",
        outcome: "One script, captions, source notes and shot list",
        acceptance:
          "Deliver one script, captions, source notes and shot list within one script up to 90 seconds; two revisions; cite the supplied evidence and flag missing inputs. Approve factual claims and likeness permissions before production.",
        unit: "script",
        input: "Approved angle and first-party evidence",
        output: "One script, captions, source notes and shot list",
        limit: "One script up to 90 seconds; two revisions",
        policy:
          "Approve factual claims and likeness permissions before production",
        tools: [
          "Notion / Google Drive / Dropbox",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "production",
        name: "Prepare a publishable asset package",
        outcome:
          "Production brief, export checklist and exact publishing preview",
        acceptance:
          "Deliver production brief, export checklist and exact publishing preview within one channel; three variants; explicit generation cap; cite the supplied evidence and flag missing inputs. Paid generation and publication require approved payload and budget.",
        unit: "asset package",
        input: "Approved script, licensed assets and format requirements",
        output:
          "Production brief, export checklist and exact publishing preview",
        limit: "One channel; three variants; explicit generation cap",
        policy:
          "Paid generation and publication require approved payload and budget",
        tools: [
          "Notion / Google Drive / Dropbox",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "editorial",
        name: "Plan the next content series",
        work: "Use audience questions, original sources and brand brief. Scope: five angles; one audience; one week.",
        output: "Five distinct angles with source links and channel fit",
        gate: "Reject unsupported expertise and derivative claims",
      },
      {
        id: "script",
        name: "Turn an idea into a script",
        work: "Use approved angle and first-party evidence. Scope: one script up to 90 seconds; two revisions.",
        output: "One script, captions, source notes and shot list",
        gate: "Approve factual claims and likeness permissions before production",
      },
      {
        id: "production",
        name: "Prepare a publishable asset package",
        work: "Use approved script, licensed assets and format requirements. Scope: one channel; three variants; explicit generation cap.",
        output:
          "Production brief, export checklist and exact publishing preview",
        gate: "Paid generation and publication require approved payload and budget",
      },
    ],
    controls: [
      "Reject unsupported expertise and derivative claims",
      "Approve factual claims and likeness permissions before production",
      "Paid generation and publication require approved payload and budget",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted editorial plan outputs, correction rate and turnaround",
      "Accepted script outputs, correction rate and turnaround",
      "Accepted asset package outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved creators rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
  {
    id: "commerce",
    vertical: "Commerce",
    name: "Orders and product pages ready for customers",
    audience: "Independent shops and ecommerce operations",
    outcome: "Orders and product pages ready for customers",
    trigger: [
      "Product added or supplier specification changed",
      "Order delayed or fulfilment failed",
      "Return request received",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "Which store, SKU range, inventory source and return window apply?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "Product claims, returns policy and stock timestamps. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Who approves refunds, discounts and product publishing?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "Shopify / WooCommerce / BigCommerce",
        role: "Products, orders and inventory",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "Product claims, returns policy and stock timestamps",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "listing",
        name: "Prepare a product listing",
        outcome: "Title, product copy, variant table and accessibility text",
        acceptance:
          "Deliver title, product copy, variant table and accessibility text within one sku; up to 10 variants; one language; cite the supplied evidence and flag missing inputs. No invented certifications; publish only approved claims.",
        unit: "SKU",
        input: "Supplier specification, images and approved claims",
        output: "Title, product copy, variant table and accessibility text",
        limit: "One SKU; up to 10 variants; one language",
        policy: "No invented certifications; publish only approved claims",
        tools: [
          "Shopify / WooCommerce / BigCommerce",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "order-exception",
        name: "Resolve an order exception",
        outcome: "Exception diagnosis, customer reply and fulfilment proposal",
        acceptance:
          "Deliver exception diagnosis, customer reply and fulfilment proposal within one order; one shipment; last 30 days; cite the supplied evidence and flag missing inputs. No replacement shipment or address change without verification.",
        unit: "order case",
        input: "Order timeline, carrier scan and stock record",
        output: "Exception diagnosis, customer reply and fulfilment proposal",
        limit: "One order; one shipment; last 30 days",
        policy:
          "No replacement shipment or address change without verification",
        tools: [
          "Shopify / WooCommerce / BigCommerce",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "return",
        name: "Assess a return request",
        outcome: "Eligibility checklist, refund calculation and review packet",
        acceptance:
          "Deliver eligibility checklist, refund calculation and review packet within one order; up to five line items; cite the supplied evidence and flag missing inputs. Never issue refunds or restock damaged items without approval.",
        unit: "return request",
        input: "Order, return reason, photos and store policy",
        output: "Eligibility checklist, refund calculation and review packet",
        limit: "One order; up to five line items",
        policy: "Never issue refunds or restock damaged items without approval",
        tools: [
          "Shopify / WooCommerce / BigCommerce",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "listing",
        name: "Prepare a product listing",
        work: "Use supplier specification, images and approved claims. Scope: one sku; up to 10 variants; one language.",
        output: "Title, product copy, variant table and accessibility text",
        gate: "No invented certifications; publish only approved claims",
      },
      {
        id: "order-exception",
        name: "Resolve an order exception",
        work: "Use order timeline, carrier scan and stock record. Scope: one order; one shipment; last 30 days.",
        output: "Exception diagnosis, customer reply and fulfilment proposal",
        gate: "No replacement shipment or address change without verification",
      },
      {
        id: "return",
        name: "Assess a return request",
        work: "Use order, return reason, photos and store policy. Scope: one order; up to five line items.",
        output: "Eligibility checklist, refund calculation and review packet",
        gate: "Never issue refunds or restock damaged items without approval",
      },
    ],
    controls: [
      "No invented certifications; publish only approved claims",
      "No replacement shipment or address change without verification",
      "Never issue refunds or restock damaged items without approval",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted SKU outputs, correction rate and turnaround",
      "Accepted order case outputs, correction rate and turnaround",
      "Accepted return request outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved commerce rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
  {
    id: "b2b-sales",
    vertical: "B2B sales",
    name: "Qualified accounts with a credible next step",
    audience: "Revenue teams selling to businesses",
    outcome: "Qualified accounts with a credible next step",
    trigger: [
      "Target account added",
      "Outreach requested for qualified contact",
      "Opportunity ready for handoff",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "What defines a qualified account, excluded territory and disqualifier?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "ICP, territory and approved outreach rules. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Which sender, opt-out rules and deal owner approve outreach?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "HubSpot / Salesforce / Pipedrive",
        role: "Accounts, contacts and deal history",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "ICP, territory and approved outreach rules",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "account-brief",
        name: "Research a target account",
        outcome: "Cited fit assessment, buying signals and unresolved gaps",
        acceptance:
          "Deliver cited fit assessment, buying signals and unresolved gaps within one account; up to 10 sources; cite the supplied evidence and flag missing inputs. Do not infer private intent or invent contact information.",
        unit: "account brief",
        input: "Company domain, ICP and permitted public sources",
        output: "Cited fit assessment, buying signals and unresolved gaps",
        limit: "One account; up to 10 sources",
        policy: "Do not infer private intent or invent contact information",
        tools: [
          "HubSpot / Salesforce / Pipedrive",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "outreach",
        name: "Prepare relevant outreach",
        outcome: "Three-message sequence with evidence and opt-out language",
        acceptance:
          "Deliver three-message sequence with evidence and opt-out language within one contact; three touches; no bulk send; cite the supplied evidence and flag missing inputs. Suppression list checked; approval required before sending.",
        unit: "outreach sequence",
        input: "Verified business contact and account evidence",
        output: "Three-message sequence with evidence and opt-out language",
        limit: "One contact; three touches; no bulk send",
        policy: "Suppression list checked; approval required before sending",
        tools: [
          "HubSpot / Salesforce / Pipedrive",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "deal-handoff",
        name: "Prepare a deal handoff",
        outcome: "Qualification record, missing evidence and dated next steps",
        acceptance:
          "Deliver qualification record, missing evidence and dated next steps within one opportunity; up to three calls; cite the supplied evidence and flag missing inputs. No invented budget, commitment or automatic stage advancement.",
        unit: "opportunity",
        input: "Call notes, CRM stage and qualification criteria",
        output: "Qualification record, missing evidence and dated next steps",
        limit: "One opportunity; up to three calls",
        policy: "No invented budget, commitment or automatic stage advancement",
        tools: [
          "HubSpot / Salesforce / Pipedrive",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "account-brief",
        name: "Research a target account",
        work: "Use company domain, icp and permitted public sources. Scope: one account; up to 10 sources.",
        output: "Cited fit assessment, buying signals and unresolved gaps",
        gate: "Do not infer private intent or invent contact information",
      },
      {
        id: "outreach",
        name: "Prepare relevant outreach",
        work: "Use verified business contact and account evidence. Scope: one contact; three touches; no bulk send.",
        output: "Three-message sequence with evidence and opt-out language",
        gate: "Suppression list checked; approval required before sending",
      },
      {
        id: "deal-handoff",
        name: "Prepare a deal handoff",
        work: "Use call notes, crm stage and qualification criteria. Scope: one opportunity; up to three calls.",
        output: "Qualification record, missing evidence and dated next steps",
        gate: "No invented budget, commitment or automatic stage advancement",
      },
    ],
    controls: [
      "Do not infer private intent or invent contact information",
      "Suppression list checked; approval required before sending",
      "No invented budget, commitment or automatic stage advancement",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted account brief outputs, correction rate and turnaround",
      "Accepted outreach sequence outputs, correction rate and turnaround",
      "Accepted opportunity outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved b2b sales rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
  {
    id: "customer-support",
    vertical: "Customer support",
    name: "A sourced resolution for every supported case",
    audience: "Support teams and customer success operators",
    outcome: "A sourced resolution for every supported case",
    trigger: [
      "Support ticket received",
      "Ticket assigned for resolution",
      "Related tickets linked to incident",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "Which queues, languages, response deadlines and knowledge versions apply?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "Approved help centre and escalation matrix. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Who handles refunds, security incidents and account recovery?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "Zendesk / Intercom / Freshdesk",
        role: "Tickets, conversations and customer context",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "Approved help centre and escalation matrix",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "triage",
        name: "Route a support case",
        outcome: "Category, priority rationale, owner and response deadline",
        acceptance:
          "Deliver category, priority rationale, owner and response deadline within one ticket; up to 30 messages; cite the supplied evidence and flag missing inputs. Safety and security cases escalate immediately; no silent closure.",
        unit: "ticket",
        input: "Incoming thread and urgency rubric",
        output: "Category, priority rationale, owner and response deadline",
        limit: "One ticket; up to 30 messages",
        policy:
          "Safety and security cases escalate immediately; no silent closure",
        tools: [
          "Zendesk / Intercom / Freshdesk",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "answer",
        name: "Prepare a grounded answer",
        outcome: "Reply with source references, steps and uncertainty flags",
        acceptance:
          "Deliver reply with source references, steps and uncertainty flags within one issue; up to five help articles; cite the supplied evidence and flag missing inputs. Unsupported answers and identity changes require specialist review.",
        unit: "answer",
        input: "Customer question and approved help articles",
        output: "Reply with source references, steps and uncertainty flags",
        limit: "One issue; up to five help articles",
        policy:
          "Unsupported answers and identity changes require specialist review",
        tools: [
          "Zendesk / Intercom / Freshdesk",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "incident",
        name: "Assemble an incident escalation",
        outcome:
          "Reproduction packet, impact summary and customer update draft",
        acceptance:
          "Deliver reproduction packet, impact summary and customer update draft within one incident; up to 20 linked tickets; cite the supplied evidence and flag missing inputs. Redact secrets; no promised restoration time without confirmed evidence.",
        unit: "escalation packet",
        input: "Related tickets, reproduction steps and service notices",
        output: "Reproduction packet, impact summary and customer update draft",
        limit: "One incident; up to 20 linked tickets",
        policy:
          "Redact secrets; no promised restoration time without confirmed evidence",
        tools: [
          "Zendesk / Intercom / Freshdesk",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "triage",
        name: "Route a support case",
        work: "Use incoming thread and urgency rubric. Scope: one ticket; up to 30 messages.",
        output: "Category, priority rationale, owner and response deadline",
        gate: "Safety and security cases escalate immediately; no silent closure",
      },
      {
        id: "answer",
        name: "Prepare a grounded answer",
        work: "Use customer question and approved help articles. Scope: one issue; up to five help articles.",
        output: "Reply with source references, steps and uncertainty flags",
        gate: "Unsupported answers and identity changes require specialist review",
      },
      {
        id: "incident",
        name: "Assemble an incident escalation",
        work: "Use related tickets, reproduction steps and service notices. Scope: one incident; up to 20 linked tickets.",
        output: "Reproduction packet, impact summary and customer update draft",
        gate: "Redact secrets; no promised restoration time without confirmed evidence",
      },
    ],
    controls: [
      "Safety and security cases escalate immediately; no silent closure",
      "Unsupported answers and identity changes require specialist review",
      "Redact secrets; no promised restoration time without confirmed evidence",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted ticket outputs, correction rate and turnaround",
      "Accepted answer outputs, correction rate and turnaround",
      "Accepted escalation packet outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved customer support rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
  {
    id: "recruiting",
    vertical: "Recruiting",
    name: "An evidence-based interview process",
    audience: "Internal talent teams and recruiting partners",
    outcome: "An evidence-based interview process",
    trigger: [
      "Role approved",
      "Application received with consent",
      "Candidate advances to interview",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "Which role requirements are essential and what evidence demonstrates each?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "Job rubric, interview availability and retention rules. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Who approves candidate decisions and access to application data?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "Greenhouse / Lever / Ashby",
        role: "Roles, applications and interview stages",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "Job rubric, interview availability and retention rules",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "role-kit",
        name: "Build an interview kit",
        outcome:
          "Structured questions, scorecard and candidate preparation note",
        acceptance:
          "Deliver structured questions, scorecard and candidate preparation note within one role; up to four interview stages; cite the supplied evidence and flag missing inputs. Job-related criteria only; no protected-trait proxies.",
        unit: "role kit",
        input: "Hiring brief, role expectations and scoring rubric",
        output:
          "Structured questions, scorecard and candidate preparation note",
        limit: "One role; up to four interview stages",
        policy: "Job-related criteria only; no protected-trait proxies",
        tools: [
          "Greenhouse / Lever / Ashby",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "evidence-review",
        name: "Map application evidence",
        outcome:
          "Requirement-by-requirement evidence map with missing information",
        acceptance:
          "Deliver requirement-by-requirement evidence map with missing information within one application; one role; up to five documents; cite the supplied evidence and flag missing inputs. No automatic rejection, personality inference or candidate ranking.",
        unit: "application review",
        input: "Consented application and approved role rubric",
        output:
          "Requirement-by-requirement evidence map with missing information",
        limit: "One application; one role; up to five documents",
        policy:
          "No automatic rejection, personality inference or candidate ranking",
        tools: [
          "Greenhouse / Lever / Ashby",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "schedule",
        name: "Prepare interview coordination",
        outcome: "Conflict-checked slot options and invitation previews",
        acceptance:
          "Deliver conflict-checked slot options and invitation previews within one candidate; up to four interviewers; three options; cite the supplied evidence and flag missing inputs. Respect time zones; candidate details visible only to authorized panel.",
        unit: "interview plan",
        input: "Candidate availability and panel calendars",
        output: "Conflict-checked slot options and invitation previews",
        limit: "One candidate; up to four interviewers; three options",
        policy:
          "Respect time zones; candidate details visible only to authorized panel",
        tools: [
          "Greenhouse / Lever / Ashby",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "role-kit",
        name: "Build an interview kit",
        work: "Use hiring brief, role expectations and scoring rubric. Scope: one role; up to four interview stages.",
        output:
          "Structured questions, scorecard and candidate preparation note",
        gate: "Job-related criteria only; no protected-trait proxies",
      },
      {
        id: "evidence-review",
        name: "Map application evidence",
        work: "Use consented application and approved role rubric. Scope: one application; one role; up to five documents.",
        output:
          "Requirement-by-requirement evidence map with missing information",
        gate: "No automatic rejection, personality inference or candidate ranking",
      },
      {
        id: "schedule",
        name: "Prepare interview coordination",
        work: "Use candidate availability and panel calendars. Scope: one candidate; up to four interviewers; three options.",
        output: "Conflict-checked slot options and invitation previews",
        gate: "Respect time zones; candidate details visible only to authorized panel",
      },
    ],
    controls: [
      "Job-related criteria only; no protected-trait proxies",
      "No automatic rejection, personality inference or candidate ranking",
      "Respect time zones; candidate details visible only to authorized panel",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted role kit outputs, correction rate and turnaround",
      "Accepted application review outputs, correction rate and turnaround",
      "Accepted interview plan outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved recruiting rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
  {
    id: "agencies",
    vertical: "Agencies",
    name: "Client delivery with scope and approvals intact",
    audience: "Creative, marketing and delivery agencies",
    outcome: "Client delivery with scope and approvals intact",
    trigger: [
      "Statement of work signed",
      "Client submits a change request",
      "Client review date approaching",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "Which deliverables, revision allowances and client deadlines are contracted?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "Statement of work, brand assets and approval history. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Who signs off scope changes, client communications and final assets?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "Asana / ClickUp / Monday.com",
        role: "Client projects, owners and delivery milestones",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "Statement of work, brand assets and approval history",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "kickoff",
        name: "Turn a signed scope into a kickoff",
        outcome:
          "Milestone plan, responsibility matrix and missing asset requests",
        acceptance:
          "Deliver milestone plan, responsibility matrix and missing asset requests within one project; up to 10 deliverables; cite the supplied evidence and flag missing inputs. No commitments outside signed scope or confirmed capacity.",
        unit: "project kickoff",
        input: "Signed statement of work and client intake",
        output:
          "Milestone plan, responsibility matrix and missing asset requests",
        limit: "One project; up to 10 deliverables",
        policy: "No commitments outside signed scope or confirmed capacity",
        tools: [
          "Asana / ClickUp / Monday.com",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "change-request",
        name: "Evaluate a change request",
        outcome: "Scope delta, effort assumptions and approval-ready options",
        acceptance:
          "Deliver scope delta, effort assumptions and approval-ready options within one request; up to three options; cite the supplied evidence and flag missing inputs. No unapproved fees, deadline changes or implied client acceptance.",
        unit: "change request",
        input: "Client request, current scope and rate card",
        output: "Scope delta, effort assumptions and approval-ready options",
        limit: "One request; up to three options",
        policy:
          "No unapproved fees, deadline changes or implied client acceptance",
        tools: [
          "Asana / ClickUp / Monday.com",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "client-report",
        name: "Prepare a client delivery review",
        outcome: "Delivery recap, blockers, decisions and next-period plan",
        acceptance:
          "Deliver delivery recap, blockers, decisions and next-period plan within one client; one reporting period; 10 milestones; cite the supplied evidence and flag missing inputs. Separate approved from pending work; never fabricate performance.",
        unit: "client report",
        input: "Task evidence, accepted assets and period metrics",
        output: "Delivery recap, blockers, decisions and next-period plan",
        limit: "One client; one reporting period; 10 milestones",
        policy:
          "Separate approved from pending work; never fabricate performance",
        tools: [
          "Asana / ClickUp / Monday.com",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "kickoff",
        name: "Turn a signed scope into a kickoff",
        work: "Use signed statement of work and client intake. Scope: one project; up to 10 deliverables.",
        output:
          "Milestone plan, responsibility matrix and missing asset requests",
        gate: "No commitments outside signed scope or confirmed capacity",
      },
      {
        id: "change-request",
        name: "Evaluate a change request",
        work: "Use client request, current scope and rate card. Scope: one request; up to three options.",
        output: "Scope delta, effort assumptions and approval-ready options",
        gate: "No unapproved fees, deadline changes or implied client acceptance",
      },
      {
        id: "client-report",
        name: "Prepare a client delivery review",
        work: "Use task evidence, accepted assets and period metrics. Scope: one client; one reporting period; 10 milestones.",
        output: "Delivery recap, blockers, decisions and next-period plan",
        gate: "Separate approved from pending work; never fabricate performance",
      },
    ],
    controls: [
      "No commitments outside signed scope or confirmed capacity",
      "No unapproved fees, deadline changes or implied client acceptance",
      "Separate approved from pending work; never fabricate performance",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted project kickoff outputs, correction rate and turnaround",
      "Accepted change request outputs, correction rate and turnaround",
      "Accepted client report outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved agencies rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
  {
    id: "finance-operations",
    vertical: "Finance operations",
    name: "A clean review queue for the books",
    audience: "Finance teams and outsourced bookkeepers",
    outcome: "A clean review queue for the books",
    trigger: [
      "Supplier invoice received",
      "Statement imported for close",
      "Invoice overdue and undisputed",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "Which entity, currency, accounting period and matching tolerances apply?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "Approval matrix, chart of accounts and close calendar. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Who approves postings, vendor changes and payments?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "Xero / QuickBooks / Odoo",
        role: "Invoices, ledger and purchase orders",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "Approval matrix, chart of accounts and close calendar",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "invoice-match",
        name: "Match a supplier invoice",
        outcome: "Three-way match table, discrepancies and coding proposal",
        acceptance:
          "Deliver three-way match table, discrepancies and coding proposal within one invoice; up to 30 lines; one currency; cite the supplied evidence and flag missing inputs. Duplicate and bank-detail changes stop the case; no payment execution.",
        unit: "invoice",
        input: "Invoice, purchase order and goods receipt",
        output: "Three-way match table, discrepancies and coding proposal",
        limit: "One invoice; up to 30 lines; one currency",
        policy:
          "Duplicate and bank-detail changes stop the case; no payment execution",
        tools: [
          "Xero / QuickBooks / Odoo",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "reconciliation",
        name: "Reconcile a statement batch",
        outcome: "Matched transactions and evidence-linked exception queue",
        acceptance:
          "Deliver matched transactions and evidence-linked exception queue within up to 100 transactions; one account; one period; cite the supplied evidence and flag missing inputs. No invented balancing entries or automatic ledger posting.",
        unit: "reconciliation batch",
        input: "Bank statement and dated ledger export",
        output: "Matched transactions and evidence-linked exception queue",
        limit: "Up to 100 transactions; one account; one period",
        policy: "No invented balancing entries or automatic ledger posting",
        tools: [
          "Xero / QuickBooks / Odoo",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "collections",
        name: "Prepare a receivables follow-up",
        outcome: "Balance check, aging explanation and reminder draft",
        acceptance:
          "Deliver balance check, aging explanation and reminder draft within one customer; up to five overdue invoices; cite the supplied evidence and flag missing inputs. Pause disputed balances; no threats, write-offs or unauthorized fees.",
        unit: "receivable case",
        input: "Open invoice, payment history and customer dispute notes",
        output: "Balance check, aging explanation and reminder draft",
        limit: "One customer; up to five overdue invoices",
        policy:
          "Pause disputed balances; no threats, write-offs or unauthorized fees",
        tools: [
          "Xero / QuickBooks / Odoo",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "invoice-match",
        name: "Match a supplier invoice",
        work: "Use invoice, purchase order and goods receipt. Scope: one invoice; up to 30 lines; one currency.",
        output: "Three-way match table, discrepancies and coding proposal",
        gate: "Duplicate and bank-detail changes stop the case; no payment execution",
      },
      {
        id: "reconciliation",
        name: "Reconcile a statement batch",
        work: "Use bank statement and dated ledger export. Scope: up to 100 transactions; one account; one period.",
        output: "Matched transactions and evidence-linked exception queue",
        gate: "No invented balancing entries or automatic ledger posting",
      },
      {
        id: "collections",
        name: "Prepare a receivables follow-up",
        work: "Use open invoice, payment history and customer dispute notes. Scope: one customer; up to five overdue invoices.",
        output: "Balance check, aging explanation and reminder draft",
        gate: "Pause disputed balances; no threats, write-offs or unauthorized fees",
      },
    ],
    controls: [
      "Duplicate and bank-detail changes stop the case; no payment execution",
      "No invented balancing entries or automatic ledger posting",
      "Pause disputed balances; no threats, write-offs or unauthorized fees",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted invoice outputs, correction rate and turnaround",
      "Accepted reconciliation batch outputs, correction rate and turnaround",
      "Accepted receivable case outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved finance operations rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
  {
    id: "professional-services",
    vertical: "Professional services",
    name: "A client engagement ready for expert review",
    audience: "Consultancies, advisory firms and specialist practices",
    outcome: "A client engagement ready for expert review",
    trigger: [
      "New engagement request received",
      "Expert requests a research memo",
      "Findings approved for client deliverable",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "Which client, deliverable, jurisdiction and expert reviewer are in scope?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "Engagement terms, approved precedents and confidentiality scope. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Which confidential sources may be used and who approves advice?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "Microsoft 365 / Google Workspace / Notion",
        role: "Client files, engagement notes and knowledge",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "Engagement terms, approved precedents and confidentiality scope",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "intake",
        name: "Prepare a client intake",
        outcome: "Scope summary, missing documents and expert review questions",
        acceptance:
          "Deliver scope summary, missing documents and expert review questions within one engagement; up to 10 documents; cite the supplied evidence and flag missing inputs. Conflict and confidentiality checks before cross-file access.",
        unit: "intake packet",
        input: "Client request, engagement terms and document inventory",
        output: "Scope summary, missing documents and expert review questions",
        limit: "One engagement; up to 10 documents",
        policy: "Conflict and confidentiality checks before cross-file access",
        tools: [
          "Microsoft 365 / Google Workspace / Notion",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "research",
        name: "Build an evidence memo",
        outcome: "Cited findings, competing interpretations and open issues",
        acceptance:
          "Deliver cited findings, competing interpretations and open issues within one question; up to 15 sources; dated research cutoff; cite the supplied evidence and flag missing inputs. No unsourced professional conclusions; qualified expert reviews advice.",
        unit: "research memo",
        input: "Defined question and approved reference collection",
        output: "Cited findings, competing interpretations and open issues",
        limit: "One question; up to 15 sources; dated research cutoff",
        policy:
          "No unsourced professional conclusions; qualified expert reviews advice",
        tools: [
          "Microsoft 365 / Google Workspace / Notion",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "deliverable",
        name: "Prepare a client deliverable",
        outcome:
          "Structured draft, source appendix and unresolved decision list",
        acceptance:
          "Deliver structured draft, source appendix and unresolved decision list within one deliverable up to 10 pages; two revisions; cite the supplied evidence and flag missing inputs. Expert signs off before delivery; no signatures or commitments by proxy.",
        unit: "deliverable",
        input: "Approved findings, engagement scope and template",
        output:
          "Structured draft, source appendix and unresolved decision list",
        limit: "One deliverable up to 10 pages; two revisions",
        policy:
          "Expert signs off before delivery; no signatures or commitments by proxy",
        tools: [
          "Microsoft 365 / Google Workspace / Notion",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "intake",
        name: "Prepare a client intake",
        work: "Use client request, engagement terms and document inventory. Scope: one engagement; up to 10 documents.",
        output: "Scope summary, missing documents and expert review questions",
        gate: "Conflict and confidentiality checks before cross-file access",
      },
      {
        id: "research",
        name: "Build an evidence memo",
        work: "Use defined question and approved reference collection. Scope: one question; up to 15 sources; dated research cutoff.",
        output: "Cited findings, competing interpretations and open issues",
        gate: "No unsourced professional conclusions; qualified expert reviews advice",
      },
      {
        id: "deliverable",
        name: "Prepare a client deliverable",
        work: "Use approved findings, engagement scope and template. Scope: one deliverable up to 10 pages; two revisions.",
        output:
          "Structured draft, source appendix and unresolved decision list",
        gate: "Expert signs off before delivery; no signatures or commitments by proxy",
      },
    ],
    controls: [
      "Conflict and confidentiality checks before cross-file access",
      "No unsourced professional conclusions; qualified expert reviews advice",
      "Expert signs off before delivery; no signatures or commitments by proxy",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted intake packet outputs, correction rate and turnaround",
      "Accepted research memo outputs, correction rate and turnaround",
      "Accepted deliverable outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved professional services rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
  {
    id: "field-services",
    vertical: "Field services",
    name: "Every job dispatched with the right context",
    audience: "Maintenance, installation and mobile service teams",
    outcome: "Every job dispatched with the right context",
    trigger: [
      "Service request received",
      "Qualified job ready to schedule",
      "Technician submits visit evidence",
    ],
    questions: [
      {
        key: "scope",
        label: "Work in scope",
        hint: "Which service zones, technician certifications and response windows apply?",
      },
      {
        key: "knowledge",
        label: "Approved source material",
        hint: "Service area, skills matrix and safety procedures. Identify authoritative versions and owners; do not paste credentials.",
      },
      {
        key: "authority",
        label: "Decisions and permissions",
        hint: "Who approves dispatch, parts purchases and safety escalations?",
      },
      {
        key: "volume",
        label: "Volume and task budget",
        hint: "Expected tasks per week, maximum task spend, deadline and the person who approves exceptions.",
      },
    ],
    integrations: [
      {
        name: "Jobber / ServiceTitan / Odoo",
        role: "Jobs, technicians and asset service history",
        adapter: "broker",
        required: true,
      },
      {
        name: "Google Drive / SharePoint / Notion",
        role: "Service area, skills matrix and safety procedures",
        adapter: "broker",
        required: true,
      },
      {
        name: "Slack / Microsoft Teams / Gmail",
        role: "Approval routing and evidence-linked recaps",
        adapter: "broker",
        required: false,
      },
    ],
    tasks: [
      {
        id: "job-triage",
        name: "Qualify a service request",
        outcome:
          "Job classification, urgency, required skills and missing photos",
        acceptance:
          "Deliver job classification, urgency, required skills and missing photos within one site; one asset; one service request; cite the supplied evidence and flag missing inputs. Hazard reports escalate immediately; no remote safety clearance.",
        unit: "service request",
        input: "Customer description, site details and asset history",
        output:
          "Job classification, urgency, required skills and missing photos",
        limit: "One site; one asset; one service request",
        policy:
          "Hazard reports escalate immediately; no remote safety clearance",
        tools: [
          "Jobber / ServiceTitan / Odoo",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "dispatch",
        name: "Prepare a feasible dispatch",
        outcome:
          "Qualified technician options, travel buffer and customer ETA draft",
        acceptance:
          "Deliver qualified technician options, travel buffer and customer eta draft within one job; up to three technicians; one day; cite the supplied evidence and flag missing inputs. No double-booking; verify certification and approval before assignment.",
        unit: "dispatch plan",
        input: "Job requirements, technician calendar and parts availability",
        output:
          "Qualified technician options, travel buffer and customer ETA draft",
        limit: "One job; up to three technicians; one day",
        policy:
          "No double-booking; verify certification and approval before assignment",
        tools: [
          "Jobber / ServiceTitan / Odoo",
          "Google Drive / SharePoint / Notion",
        ],
      },
      {
        id: "closeout",
        name: "Prepare a job closeout",
        outcome: "Service report, invoice proposal and follow-up checklist",
        acceptance:
          "Deliver service report, invoice proposal and follow-up checklist within one completed visit; up to 20 evidence items; cite the supplied evidence and flag missing inputs. Missing completion evidence stays open; price and warranty changes require review.",
        unit: "job closeout",
        input: "Technician notes, photos, used parts and signed work record",
        output: "Service report, invoice proposal and follow-up checklist",
        limit: "One completed visit; up to 20 evidence items",
        policy:
          "Missing completion evidence stays open; price and warranty changes require review",
        tools: [
          "Jobber / ServiceTitan / Odoo",
          "Google Drive / SharePoint / Notion",
        ],
      },
    ],
    stages: [
      {
        id: "job-triage",
        name: "Qualify a service request",
        work: "Use customer description, site details and asset history. Scope: one site; one asset; one service request.",
        output:
          "Job classification, urgency, required skills and missing photos",
        gate: "Hazard reports escalate immediately; no remote safety clearance",
      },
      {
        id: "dispatch",
        name: "Prepare a feasible dispatch",
        work: "Use job requirements, technician calendar and parts availability. Scope: one job; up to three technicians; one day.",
        output:
          "Qualified technician options, travel buffer and customer ETA draft",
        gate: "No double-booking; verify certification and approval before assignment",
      },
      {
        id: "closeout",
        name: "Prepare a job closeout",
        work: "Use technician notes, photos, used parts and signed work record. Scope: one completed visit; up to 20 evidence items.",
        output: "Service report, invoice proposal and follow-up checklist",
        gate: "Missing completion evidence stays open; price and warranty changes require review",
      },
    ],
    controls: [
      "Hazard reports escalate immediately; no remote safety clearance",
      "No double-booking; verify certification and approval before assignment",
      "Missing completion evidence stays open; price and warranty changes require review",
      "External actions require verified connection scopes and an approved policy. Test mode has no external effects.",
      "Keep source references and destination receipts; reconcile ambiguous writes before retrying.",
    ],
    metrics: [
      "Accepted service request outputs, correction rate and turnaround",
      "Accepted dispatch plan outputs, correction rate and turnaround",
      "Accepted job closeout outputs, correction rate and turnaround",
    ],
    memory: [
      "Owner-approved field services rules with version, source and expiry",
      "Corrections are proposed for review before they change future behavior; client records remain isolated.",
    ],
  },
];
