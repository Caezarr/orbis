import type { VerticalHub, VerticalJob } from "./types";

const jobs: VerticalJob[] = [
  {
    slug: "content-drafts",
    label: "Content Drafts",
    title: "Scripts and captions drafted in your voice.",
    summary:
      "Give Orbis a topic, an angle and a few past posts. It drafts a script or caption with two variants, and keeps factual claims separate so you can check them.",
    fit: "For creators rewriting the same hooks and openers every week. Not an agency content factory.",
    catalogFlowId: "flow-012",
    contract: "content-draft",
    inputs: [
      "The topic and the angle you want to take",
      "The format: short video script, carousel, caption or newsletter section",
      "Past posts or transcripts that show your voice",
      "Facts, links or product details the piece must mention",
    ],
    draft: [
      "A main draft and two variants with different hooks",
      "A call to action in your usual pattern",
      "Factual references listed separately from the copy",
      "Unknowns where the piece needs a fact you did not supply",
    ],
    boundaries: [
      "Does not post or schedule anything",
      "Does not invent statistics, results or testimonials",
      "Does not edit video or design visuals",
    ],
    connections: [
      { tool: "notion", use: "Select a page of past posts or a voice guide as a source" },
      { tool: "googledrive", use: "Select scripts or transcripts as a source" },
    ],
    pasteOnly: ["Captions or transcripts from Instagram, TikTok or YouTube: paste or export the text"],
    steps: [
      { input: "Topic and angle", output: "Script drafted", detail: "Voice from your past posts" },
      { input: "Hook ideas", output: "Two variants drafted", detail: "Claims listed separately" },
      { input: "Carousel outline", output: "Slide copy drafted", detail: "Missing facts flagged" },
    ],
    faq: [
      {
        q: "How does it learn my voice?",
        a: "From the past posts and notes you select for the mission. Corrections you approve are kept as instructions for next time.",
      },
      {
        q: "Can it write about a sponsor's product?",
        a: "Yes, from the brief and product details you supply. It will not add claims the brief does not contain.",
      },
    ],
  },
  {
    slug: "research-briefs",
    label: "Research Briefs",
    title: "Research briefs built only from sources you supply.",
    summary:
      "Paste the articles, transcripts and notes you collected on a topic. Orbis organises them into a brief that separates facts from opinions and shows where the evidence is thin, before you film or write.",
    fit: "For creators who research before they publish. Not a newsroom tool and not fact-checking.",
    catalogFlowId: "flow-015",
    contract: "content-draft",
    inputs: [
      "The topic and the audience",
      "The sources you collected: article text, video transcripts, your own notes",
      "The question the piece should answer",
    ],
    draft: [
      "A structured outline for the piece",
      "Key claims, each linked to the source it comes from",
      "Points where your sources disagree",
      "Gaps to research before publishing",
    ],
    boundaries: [
      "Does not search the web: it works only from what you supply",
      "Is not fact-checking or legal review",
      "Does not invent sources or quotes",
    ],
    connections: [
      { tool: "notion", use: "Select a research page or reading list as a source" },
      { tool: "googledrive", use: "Select saved articles or transcripts as a source" },
    ],
    pasteOnly: ["Competitor videos: paste the transcript or your notes"],
    steps: [
      { input: "Topic and sources", output: "Research brief drafted", detail: "Claims linked to sources" },
      { input: "Competitor transcript", output: "Angle notes drafted", detail: "Gaps flagged as unknowns" },
      { input: "Conflicting articles", output: "Disagreements listed", detail: "You decide what to say" },
    ],
    faq: [
      {
        q: "Will it find sources for me?",
        a: "No. This mission has no live browsing. It organises and checks what you give it.",
      },
      {
        q: "Can I trust every claim in the brief?",
        a: "Each claim points to one of your sources, and weak spots are flagged, but you still verify before publishing.",
      },
    ],
  },
  {
    slug: "sponsorship-replies",
    label: "Sponsorship Replies",
    title: "Brand emails answered from your own rate card.",
    summary:
      "Paste a brand's inbound email. Orbis pulls out what they are asking for, drafts a reply using your rate card and deliverables, and flags anything the card does not cover.",
    fit: "For creators handling brand requests themselves. Not a talent agency or a media sales CRM.",
    catalogFlowId: "flow-001",
    contract: "request-analysis",
    inputs: [
      "The brand's email",
      "Your rate card and packages",
      "Your rules: categories you decline, usage rights, exclusivity terms",
    ],
    draft: [
      "A summary of the request: deliverables, dates, usage and budget if stated",
      "A reply that quotes only prices from your rate card",
      "Questions to send back where the brief is vague",
      "Flags where the request conflicts with your rules",
    ],
    boundaries: [
      "Does not send the reply",
      "Does not set or invent prices",
      "Does not negotiate, accept terms or review contracts",
    ],
    connections: [
      {
        tool: "gmail",
        use: "Can be connected to your workspace; you paste the brand email into the run",
      },
      { tool: "notion", use: "Select your rate card as a source" },
      { tool: "googledrive", use: "Select your media kit as a source" },
    ],
    steps: [
      { input: "Brand inbound email", output: "Reply drafted", detail: "Rates from your card" },
      { input: "Usage rights question", output: "Clarifying questions drafted", detail: "Your rules applied" },
      { input: "Package not on your card", output: "Gap flagged", detail: "Price left for you to set" },
    ],
    faq: [
      {
        q: "Will it negotiate for me?",
        a: "No. It drafts the reply. Pricing, terms and the decision to accept stay with you.",
      },
      {
        q: "What if my rate card is missing a package?",
        a: "The draft says so and leaves the price blank for you to fill in.",
      },
    ],
  },
  {
    slug: "calendar-prep",
    label: "Calendar Prep",
    title: "A weekly content plan you lock yourself.",
    summary:
      "Share your themes, sponsor deadlines and batch-day constraints. Orbis drafts a week plan with a shot list and lists every deadline it found in your notes.",
    fit: "For creators who batch content and still scramble mid-week. Not a scheduling tool.",
    catalogFlowId: "flow-011",
    contract: "content-draft",
    inputs: [
      "Your themes or series for the week",
      "Sponsor deliverables and due dates",
      "Your posting cadence per platform",
      "Batch-day constraints: location, props, guests",
    ],
    draft: [
      "A week plan by day and platform",
      "A shot list grouped for your batch day",
      "Deadlines, each traced back to your notes",
      "Unknowns, such as missing props or pending approvals",
    ],
    boundaries: [
      "Does not schedule posts or create calendar events",
      "Does not replace your scheduling tool",
      "Does not decide which sponsor comes first",
    ],
    connections: [
      { tool: "notion", use: "Select your content board as a source" },
      {
        tool: "googlecalendar",
        use: "Can be connected to your workspace; Orbis does not create events",
      },
    ],
    pasteOnly: ["Queues from scheduling tools such as Later or Buffer: export or paste them"],
    steps: [
      { input: "Week themes", output: "Week plan drafted", detail: "Your cadence kept" },
      { input: "Batch day notes", output: "Shot list drafted", detail: "Missing props flagged" },
      { input: "Sponsor deadlines", output: "Deadline list drafted", detail: "Traced to your notes" },
    ],
    faq: [
      {
        q: "Will it publish or schedule my posts?",
        a: "No. You copy the plan into your scheduling tool and lock the dates yourself.",
      },
      {
        q: "How does it know my cadence?",
        a: "From the notes or content board you select. If the cadence is not written down, it asks.",
      },
    ],
  },
];

export const contentCreators: VerticalHub = {
  slug: "content-creators",
  label: "Content Creators",
  seoTitle: "Scripts, Research Briefs and Brand Replies for Content Creators",
  title: "Your channel. Less blank-page work.",
  lead: "Scripts, research, brand emails and the weekly plan each start from scratch in another chat window. Orbis prepares them as drafts from your past posts, notes and rate card, and you decide what gets published or sent.",
  intro:
    "Choose one recurring creator task. Orbis runs it on the sources you select and marks anything it could not back up.",
  fit: "For solo creators and small creator teams. Not an agency content factory and not a scheduling tool.",
  teaser: "Scripts and captions, research briefs, brand replies and weekly content plans.",
  tools: ["notion", "googledrive", "gmail", "googlecalendar"],
  toolsNote:
    "Instagram, TikTok, YouTube and scheduling tools are not connected to Orbis: paste captions and transcripts, or export them. Past posts, voice guides and rate cards can be selected from Notion, Google Drive or SharePoint. Gmail and Google Calendar can be connected to your workspace, but these missions do not send email or create events.",
  principles: [
    "Drafts in your voice, based on past posts you choose as sources",
    "No statistics or results unless your sources contain them",
    "Brand replies built from your own rate card",
    "Orbis does not post, schedule or email anything",
  ],
  workshop: [
    { input: "Topic and angle", output: "Script drafted", detail: "Voice from past posts" },
    { input: "Brand inbound email", output: "Reply drafted", detail: "Rates from your card" },
    { input: "Next week's themes", output: "Content plan drafted", detail: "Deadlines traced" },
  ],
  faq: [
    {
      q: "Will it post to Instagram, TikTok or YouTube?",
      a: "No. Orbis has no connection to these platforms and does not publish. You copy the draft.",
    },
    {
      q: "Will it negotiate brand deals?",
      a: "No. It drafts replies from your rate card and rules. You send, price and sign.",
    },
    {
      q: "Does it replace Notion or my editor?",
      a: "No. Notion pages can be selected as sources; your editing and scheduling tools stay yours.",
    },
    {
      q: "Does it know my niche?",
      a: "From the past posts, notes and guidelines you select. Anything missing is listed as an unknown.",
    },
  ],
  finalTitle: "Start with your channel.",
  jobs,
};
