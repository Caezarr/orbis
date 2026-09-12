// Discovery does not imply provider support. Additional tools require explicit
// COMPOSIO_TOOLKIT_<ID> configuration validated against a real auth config.
const registry = [
  [
    "gmail",
    "Gmail",
    "Communication",
    "Customer conversations and daily recaps"
  ],
  [
    "outlook",
    "Outlook",
    "Communication",
    "Email and team communication"
  ],
  [
    "googlecalendar",
    "Google Calendar",
    "Planning",
    "Schedules and availability"
  ],
  [
    "googledrive",
    "Google Drive",
    "Knowledge",
    "Approved documents and media"
  ],
  [
    "notion",
    "Notion",
    "Knowledge",
    "Knowledge and editorial planning"
  ],
  [
    "slack",
    "Slack",
    "Communication",
    "Operational alerts and team decisions"
  ],
  [
    "teams",
    "Microsoft Teams",
    "Communication",
    "Team conversations and meeting handoffs"
  ],
  [
    "discord",
    "Discord",
    "Communication",
    "Community questions and moderation queues"
  ],
  [
    "zoom",
    "Zoom",
    "Communication",
    "Meeting context and follow-up preparation"
  ],
  [
    "telegram",
    "Telegram",
    "Communication",
    "Community messages and operational alerts"
  ],
  [
    "dropbox",
    "Dropbox",
    "Knowledge",
    "Shared files and client deliverables"
  ],
  [
    "box",
    "Box",
    "Knowledge",
    "Controlled business documents"
  ],
  [
    "onedrive",
    "OneDrive",
    "Knowledge",
    "Microsoft documents and shared references"
  ],
  [
    "confluence",
    "Confluence",
    "Knowledge",
    "Team documentation and support playbooks"
  ],
  [
    "airtable",
    "Airtable",
    "Planning",
    "Structured operations and content trackers"
  ],
  [
    "asana",
    "Asana",
    "Planning",
    "Project tasks and delivery milestones"
  ],
  [
    "trello",
    "Trello",
    "Planning",
    "Kanban boards and team handoffs"
  ],
  [
    "clickup",
    "ClickUp",
    "Planning",
    "Work queues and dependencies"
  ],
  [
    "monday",
    "monday.com",
    "Planning",
    "Operational boards and ownership"
  ],
  [
    "todoist",
    "Todoist",
    "Planning",
    "Tasks and follow-up reminders"
  ],
  [
    "calendly",
    "Calendly",
    "Planning",
    "Booking availability and appointments"
  ],
  [
    "hubspot",
    "HubSpot",
    "Sales",
    "CRM contacts and deal follow-ups"
  ],
  [
    "salesforce",
    "Salesforce",
    "Sales",
    "Account records and sales pipeline"
  ],
  [
    "pipedrive",
    "Pipedrive",
    "Sales",
    "Deal stages and next sales actions"
  ],
  [
    "apollo",
    "Apollo",
    "Sales",
    "Prospect research and enrichment"
  ],
  [
    "close",
    "Close",
    "Sales",
    "Sales conversations and lead ownership"
  ],
  [
    "zoho",
    "Zoho CRM",
    "Sales",
    "Customer records and opportunities"
  ],
  [
    "zendesk",
    "Zendesk",
    "Support",
    "Support tickets and escalation context"
  ],
  [
    "intercom",
    "Intercom",
    "Support",
    "Customer conversations and help content"
  ],
  [
    "freshdesk",
    "Freshdesk",
    "Support",
    "Service requests and ticket triage"
  ],
  [
    "helpscout",
    "Help Scout",
    "Support",
    "Shared inbox and customer history"
  ],
  [
    "gorgias",
    "Gorgias",
    "Support",
    "Commerce support and order questions"
  ],
  [
    "shopify",
    "Shopify",
    "Commerce",
    "Orders, products and fulfillment context"
  ],
  [
    "woocommerce",
    "WooCommerce",
    "Commerce",
    "Store orders and product catalogue"
  ],
  [
    "stripe",
    "Stripe",
    "Finance",
    "Payment status and subscriptions"
  ],
  [
    "paypal",
    "PayPal",
    "Finance",
    "Transactions and reconciliation"
  ],
  [
    "quickbooks",
    "QuickBooks",
    "Finance",
    "Invoices and bookkeeping"
  ],
  [
    "xero",
    "Xero",
    "Finance",
    "Accounting records and reconciliation"
  ],
  [
    "pennylane",
    "Pennylane",
    "Finance",
    "Supplier invoices and financial operations"
  ],
  [
    "sage",
    "Sage",
    "Finance",
    "Accounting documents and reporting"
  ],
  [
    "greenhouse",
    "Greenhouse",
    "Recruiting",
    "Candidates and interview stages"
  ],
  [
    "lever",
    "Lever",
    "Recruiting",
    "Applicant pipeline and recruiter handoffs"
  ],
  [
    "ashby",
    "Ashby",
    "Recruiting",
    "Hiring plans and interview coordination"
  ],
  [
    "workable",
    "Workable",
    "Recruiting",
    "Job openings and candidate review"
  ],
  [
    "bamboohr",
    "BambooHR",
    "Recruiting",
    "Employee records and onboarding"
  ],
  [
    "figma",
    "Figma",
    "Creative",
    "Design references and review context"
  ],
  [
    "canva",
    "Canva",
    "Creative",
    "Brand assets and presentations"
  ],
  [
    "youtube",
    "YouTube",
    "Creative",
    "Channel content and video performance"
  ],
  [
    "instagram",
    "Instagram",
    "Creative",
    "Social content and audience context"
  ],
  [
    "linkedin",
    "LinkedIn",
    "Creative",
    "Professional content and company presence"
  ],
  [
    "buffer",
    "Buffer",
    "Creative",
    "Publishing queues and editorial planning"
  ],
  [
    "higgsfield",
    "Higgsfield",
    "Creative",
    "Video production with approved assets and budget"
  ],
  [
    "mailchimp",
    "Mailchimp",
    "Marketing",
    "Email campaigns and audience segments"
  ],
  [
    "brevo",
    "Brevo",
    "Marketing",
    "Campaign contacts and engagement"
  ],
  [
    "klaviyo",
    "Klaviyo",
    "Marketing",
    "Commerce audiences and lifecycle campaigns"
  ],
  [
    "googleanalytics",
    "Google Analytics",
    "Marketing",
    "Traffic sources and conversion reporting"
  ],
  [
    "github",
    "GitHub",
    "Engineering",
    "Issues, pull requests and releases"
  ],
  [
    "gitlab",
    "GitLab",
    "Engineering",
    "Repository activity and delivery"
  ],
  [
    "linear",
    "Linear",
    "Engineering",
    "Product issues and priorities"
  ],
  [
    "jira",
    "Jira",
    "Engineering",
    "Tickets and sprint coordination"
  ],
  [
    "sentry",
    "Sentry",
    "Engineering",
    "Application errors and incident triage"
  ],
  [
    "hostaway",
    "Hostaway",
    "Property & field",
    "Reservations, arrivals and property operations"
  ],
  [
    "guesty",
    "Guesty",
    "Property & field",
    "Bookings and guest operations"
  ],
  [
    "jobber",
    "Jobber",
    "Property & field",
    "Field jobs, quotes and visit schedules"
  ],
  [
    "servicetitan",
    "ServiceTitan",
    "Property & field",
    "Dispatch, work orders and service history"
  ],
  [
    "docusign",
    "DocuSign",
    "Professional services",
    "Agreement status and signature tracking"
  ],
  [
    "pandadoc",
    "PandaDoc",
    "Professional services",
    "Proposals and document approvals"
  ],
  [
    "harvest",
    "Harvest",
    "Professional services",
    "Time entries and project budgets"
  ]
] as const;
export type IntegrationSlug = (typeof registry)[number][0];
export const integrations = registry.map(([slug, name, category, purpose]) => ({ slug, name, category, purpose }));
export const integrationCategories = [...new Set(integrations.map((i) => i.category))];
export function isIntegrationSlug(value: string): value is IntegrationSlug {
  return integrations.some((i) => i.slug === value);
}
