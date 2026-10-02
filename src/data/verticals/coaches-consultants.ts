import type { VerticalHub, VerticalJob } from "./types";

const jobs: VerticalJob[] = [
  {
    slug: "discovery-prep",
    label: "Discovery Call Prep",
    title: "Walk into discovery calls with a brief, not ten tabs.",
    summary:
      "Paste the intake form and anything the prospect shared. Orbis prepares a call brief with an agenda, questions to ask and the fit criteria your notes say matter.",
    fit: "For coaches and consultants who run their own discovery calls. Not clinical or therapy intake.",
    catalogFlowId: "flow-091",
    contract: "meeting-prep",
    inputs: [
      "Answers from your intake or booking form",
      "Your ideal-client criteria and offers",
      "Anything the prospect sent you: an email, text you copied from their website",
    ],
    draft: [
      "Context stated only from your sources",
      "An agenda for the call",
      "Questions mapped to your fit criteria",
      "Likely objections and the decisions to seek",
      "Unknowns such as budget or timeline",
    ],
    boundaries: [
      "Does not invent a biography or past conversations",
      "Does not join or record the call",
      "Does not decide fit for you",
    ],
    connections: [
      { tool: "notion", use: "Select your offers and ideal-client page as a source" },
      { tool: "googledrive", use: "Select your offer document as a source" },
      {
        tool: "gmail",
        use: "Can be connected to your workspace; you paste the prospect's email",
      },
    ],
    pasteOnly: ["Calendly or form answers: paste or export them"],
    steps: [
      { input: "Intake form answers", output: "Call brief drafted", detail: "Context from your sources" },
      { input: "Ideal-client criteria", output: "Fit questions drafted", detail: "Mapped to your criteria" },
      { input: "Budget field left empty", output: "Unknown flagged", detail: "Question added to the agenda" },
    ],
    faq: [
      {
        q: "Will it look the prospect up online?",
        a: "No. It uses only what you paste or select, so the brief never relies on a guessed biography.",
      },
      {
        q: "Can I use it for several offers?",
        a: "Select the offer document that matches the call. The brief uses that offer's criteria.",
      },
    ],
  },
  {
    slug: "follow-up-emails",
    label: "Follow-Up Emails",
    title: "Follow-ups that reflect what was actually said.",
    summary:
      "Paste your call notes or a transcript excerpt. Orbis drafts a follow-up email recapping the points discussed and the next step, using only offer terms from your documents.",
    fit: "For coaches and consultants who want follow-ups out the same day. Not a sales engagement suite.",
    catalogFlowId: "flow-002",
    contract: "request-analysis",
    inputs: [
      "Your call notes or a transcript excerpt",
      "Your offer or pricing document",
      "The next step you want to propose",
    ],
    draft: [
      "A recap of decisions and open questions, each taken from your notes",
      "The follow-up email",
      "The proposed next step",
      "Unknowns where the notes lack an owner, a date or a price",
    ],
    boundaries: [
      "Does not send the email",
      "Does not quote a price that is not in your documents",
      "Does not make commitments on your behalf",
    ],
    connections: [
      {
        tool: "gmail",
        use: "Can be connected to your workspace; the draft stays in Orbis for you to copy",
      },
      {
        tool: "outlook",
        use: "Can be connected to your workspace; the draft stays in Orbis for you to copy",
      },
      { tool: "notion", use: "Select your offer page as a source" },
    ],
    pasteOnly: ["Zoom or other call transcripts: paste the relevant excerpt"],
    steps: [
      { input: "Post-call notes", output: "Follow-up drafted", detail: "Points from this conversation" },
      { input: "Proposal to send", output: "Cover email drafted", detail: "Terms from your offer page" },
      { input: "No-show", output: "Reschedule note drafted", detail: "Your usual tone" },
    ],
    faq: [
      {
        q: "Will it close the deal?",
        a: "No. It drafts the email. Pricing, objections and commitments stay with you.",
      },
      {
        q: "What if my notes are thin?",
        a: "The draft recaps only what the notes contain and lists the gaps for you to fill before sending.",
      },
    ],
  },
  {
    slug: "lead-research",
    label: "Lead Research",
    title: "Lead research from the pages you choose.",
    summary:
      "Paste a prospect's website text, public profile details and your notes. Orbis builds a short research card with fit hypotheses, each tied to a source, and lists what it could not establish.",
    fit: "For consultants who research before they pitch. Not a data vendor or an enrichment tool.",
    catalogFlowId: "flow-009",
    contract: "request-analysis",
    inputs: [
      "Website text or documents you collected about the company",
      "Public profile information you are allowed to use",
      "Your ideal-client criteria",
    ],
    draft: [
      "Company context, with the source of each fact",
      "Fit hypotheses compared with your criteria",
      "Questions to validate on a call",
      "Unknowns such as role, company size or budget",
    ],
    boundaries: [
      "Does not browse or scrape LinkedIn or the web: it uses only what you paste",
      "Does not contact the lead",
      "Gives hypotheses, not verdicts",
    ],
    connections: [{ tool: "notion", use: "Select your ideal-client page as a source" }],
    pasteOnly: ["LinkedIn profiles or company pages: copy the public text you are allowed to use"],
    steps: [
      { input: "Company website text", output: "Research card drafted", detail: "Source listed per fact" },
      { input: "Profile notes", output: "Fit hypotheses drafted", detail: "Compared with your criteria" },
      { input: "Company size unclear", output: "Unknown flagged", detail: "Question for the call" },
    ],
    faq: [
      {
        q: "Does it scrape LinkedIn?",
        a: "No. There is no LinkedIn connection and no live browsing in this mission. You paste what you are allowed to use.",
      },
      {
        q: "Is the fit assessment reliable?",
        a: "It is a set of hypotheses tied to sources. You confirm fit on the call.",
      },
    ],
  },
  {
    slug: "session-notes",
    label: "Session Notes",
    title: "Session notes turned into a clear action list.",
    summary:
      "Paste your session notes or a transcript excerpt. Orbis structures them in your template, pulls out commitments with owners and dates, and drafts a client recap for you to review.",
    fit: "For coaches and consultants who want clean notes after each session. Not clinical documentation or therapy software.",
    catalogFlowId: "flow-051",
    contract: "research-brief",
    inputs: [
      "Your session notes or a transcript excerpt",
      "Your notes template",
      "Actions from the previous session, to check progress",
    ],
    draft: [
      "Structured notes in your template",
      "An action list with owner and due date where they were stated",
      "A client recap for your review",
      "Unknowns where an owner or date is missing",
    ],
    boundaries: [
      "Is not clinical documentation, diagnosis or therapy notes",
      "Does not email the recap",
      "Does not invent commitments",
    ],
    connections: [
      { tool: "notion", use: "Select your template and previous notes as sources" },
      { tool: "googledrive", use: "Select the client folder's notes as a source" },
    ],
    pasteOnly: ["Zoom or other call transcripts: paste the excerpt you want structured"],
    steps: [
      { input: "Session notes", output: "Notes structured", detail: "Your template applied" },
      { input: "Commitments heard", output: "Action list drafted", detail: "Missing dates flagged" },
      { input: "Client update", output: "Recap drafted", detail: "You review before sharing" },
    ],
    faq: [
      {
        q: "Can I use it for therapy or medical notes?",
        a: "No. It is meant for coaching and consulting practice notes, not clinical records.",
      },
      {
        q: "What about confidentiality?",
        a: "You choose what to paste or select for each run. Do not include material you are not permitted to process in your tools.",
      },
    ],
  },
];

export const coachesConsultants: VerticalHub = {
  slug: "coaches-consultants",
  label: "Coaches & Consultants",
  seoTitle: "Call Prep, Follow-Ups and Session Notes for Coaches and Consultants",
  title: "Your practice. Less admin between sessions.",
  lead: "Call prep, follow-up emails, lead research and session notes eat the hours between client conversations. Orbis prepares each one as a draft from your notes and offer documents, and you decide what reaches a client.",
  intro:
    "Start with the task you put off most often. Orbis works only from the sources you select, and lists what it could not confirm.",
  fit: "For independent coaches, consultants and small practices. Not therapy, medical or clinical software.",
  teaser: "Discovery call briefs, follow-up emails, lead research and session notes.",
  tools: ["notion", "googledrive", "gmail", "outlook"],
  toolsNote:
    "Calendly, Zoom and LinkedIn are not connected to Orbis: paste form answers, transcripts or profile text you are allowed to use. Offer documents and templates can be selected from Notion, Google Drive or SharePoint. Gmail and Outlook can be connected to your workspace, but these missions do not send email.",
  principles: [
    "Briefs and emails grounded in your own notes and offer documents",
    "No invented biographies, past conversations or commitments",
    "You choose what client material goes into each run",
    "Orbis does not email clients or prospects",
  ],
  workshop: [
    { input: "Discovery call booked", output: "Call brief drafted", detail: "Fit criteria from your notes" },
    { input: "Post-call notes", output: "Follow-up drafted", detail: "Offer terms from your documents" },
    { input: "Session transcript", output: "Notes and actions drafted", detail: "You review first" },
  ],
  faq: [
    {
      q: "Will it email my clients?",
      a: "No. Orbis drafts; you copy and send from your own inbox.",
    },
    {
      q: "Is this therapy, medical or clinical software?",
      a: "No. It prepares practice admin: call briefs, follow-ups, research and notes. Coaching judgment and any regulated advice stay with you.",
    },
    {
      q: "Does it connect to Calendly, Zoom or LinkedIn?",
      a: "No. Paste form answers, transcripts or profile text into the run.",
    },
    {
      q: "Does it know my offers?",
      a: "From the offer documents you select. Missing terms are listed as unknowns rather than guessed.",
    },
  ],
  finalTitle: "Start with your practice.",
  jobs,
};
