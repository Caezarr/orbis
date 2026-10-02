import type { VerticalHub, VerticalJob } from "./types";

const jobs: VerticalJob[] = [
  {
    slug: "guest-messaging",
    label: "Guest Messaging",
    title: "Guest replies drafted. You press send.",
    summary:
      "Paste a guest question about check-in, Wi-Fi, parking or an extra guest. Orbis drafts a reply from that listing's house rules and tells you which facts it could not find.",
    fit: "For hosts answering the same guest questions across one or several listings. Not a hotel contact centre.",
    catalogFlowId: "flow-021",
    contract: "request-analysis",
    inputs: [
      "The guest message or thread, pasted from Airbnb, Booking.com, your PMS or your inbox",
      "The house manual or rules for that listing: a Notion page, a Google Drive or SharePoint document, or pasted text",
      "Anything specific to the stay that matters: arrival time, number of guests, special requests",
    ],
    draft: [
      "A reply in your tone that answers each question the guest asked",
      "The house-rule lines the reply relies on, quoted from your source",
      "Questions the guest raised that your sources do not answer, listed as unknowns",
      "No early check-in, refund or discount unless your rules state it",
    ],
    boundaries: [
      "Does not send the message: you copy it into the platform and send it",
      "Does not read Airbnb or Booking.com directly",
      "Does not make exceptions to your rules on your behalf",
    ],
    connections: [
      { tool: "notion", use: "Select the house manual page as a source" },
      { tool: "googledrive", use: "Select a house-rules document as a source" },
      { tool: "sharepoint", use: "Select a house-rules document as a source" },
      {
        tool: "gmail",
        use: "Can be connected to your workspace; you paste the thread to answer",
      },
    ],
    steps: [
      { input: "Late check-in question", output: "Reply drafted", detail: "Arrival rule quoted" },
      { input: "Wi-Fi not working", output: "Reply drafted", detail: "Router steps from your manual" },
      { input: "Extra guest request", output: "Reply drafted", detail: "Occupancy rule cited" },
    ],
    faq: [
      {
        q: "What if my house manual is out of date?",
        a: "The draft can only be as accurate as the sources you select. Update the source, then run the draft again.",
      },
      {
        q: "Can it handle a complaint?",
        a: "It drafts a calm, factual reply from your rules and lists what needs your decision, such as a refund or a visit. The decision stays with you.",
      },
      {
        q: "Does Orbis see guest personal data?",
        a: "Only what you paste or select for the run. Keep door codes and payment details out of the text you paste unless the reply needs them.",
      },
    ],
  },
  {
    slug: "review-replies",
    label: "Review Replies",
    title: "Review replies drafted. Your name stays on them.",
    summary:
      "Paste a guest review and your notes from the stay. Orbis drafts a public reply that addresses what the guest actually wrote, without inventing what happened.",
    fit: "For hosts with reviews waiting for a response, including the awkward middling ones. Not a reputation-management suite.",
    catalogFlowId: "flow-072",
    contract: "content-draft",
    inputs: [
      "The review text",
      "Your notes from the stay: what happened, what you fixed, what you offered",
      "Past replies you liked, so the tone matches",
    ],
    draft: [
      "A main reply and two variants with a different tone",
      "Each point from the review it addresses, and any it leaves to you",
      "Factual statements listed separately so you can check them before posting",
    ],
    boundaries: [
      "Does not post the reply on Airbnb or any other platform",
      "Does not invent what happened during the stay: thin notes become unknowns",
      "Keeps guest personal details out of a public reply",
    ],
    connections: [
      { tool: "notion", use: "Keep past replies or a tone guide as a source" },
      { tool: "googledrive", use: "Select stay notes or an incident log as a source" },
    ],
    steps: [
      { input: "Middling review", output: "Reply drafted", detail: "Stay notes cited" },
      { input: "Cleanliness complaint", output: "Reply drafted", detail: "Fix described from your notes" },
      { input: "Glowing review", output: "Thank-you drafted", detail: "Two variants to choose from" },
    ],
    faq: [
      {
        q: "Will it argue with the guest?",
        a: "No. The reply stays factual and polite, and only states what your notes support.",
      },
      {
        q: "What about a review I think is unfair?",
        a: "Orbis drafts a measured public reply and flags statements you should verify. Disputes with the platform stay with you.",
      },
    ],
  },
  {
    slug: "listing-copy",
    label: "Listing Copy",
    title: "Listing copy drafted from what is really in the house.",
    summary:
      "Give Orbis your amenities list, house rules and notes on the area. It drafts listing text and flags any amenity or claim that your sources do not support.",
    fit: "For hosts launching a listing or refreshing it for a new season. Not a marketplace SEO agency.",
    catalogFlowId: "flow-076",
    contract: "content-draft",
    inputs: [
      "Your amenities and equipment list",
      "House rules and access details",
      "What changed or the seasonal angle you want",
      "The current listing text, if you want a rewrite",
    ],
    draft: [
      "Title options and a description, with two variants",
      "Amenities mentioned only when they appear in your list",
      "Questions to answer before publishing, such as parking type or step-free access",
    ],
    boundaries: [
      "Does not edit your listing on Airbnb, Booking.com or any platform",
      "Makes no ranking, occupancy or booking promises",
      "Does not add amenities or features that are not in your sources",
    ],
    connections: [
      { tool: "notion", use: "Select your property sheet as a source" },
      { tool: "googledrive", use: "Select the amenities list or inventory as a source" },
      { tool: "sharepoint", use: "Select the property file as a source" },
    ],
    steps: [
      { input: "Summer refresh", output: "Description drafted", detail: "Seasonal angle from your notes" },
      { input: "New hot tub", output: "Amenity section drafted", detail: "Taken from your equipment list" },
      { input: "Rewrite an old listing", output: "Two variants drafted", detail: "Unsupported claims flagged" },
    ],
    faq: [
      {
        q: "Will it improve my ranking?",
        a: "Orbis makes no ranking or booking promises. It drafts clear copy that you control and paste yourself.",
      },
      {
        q: "I have several listings. Can details get mixed up?",
        a: "Run the mission per listing, with that listing's sources selected, so details stay separate.",
      },
    ],
  },
  {
    slug: "cleaning-handoff",
    label: "Cleaning Handoff",
    title: "Turnover briefs your cleaning team can follow.",
    summary:
      "Combine your standard cleaning checklist with notes from the last stay. Orbis drafts one turnover brief per changeover and lists what still needs an answer.",
    fit: "For hosts coordinating cleaners between stays. Not a property management system or a staffing tool.",
    catalogFlowId: "flow-055",
    contract: "research-brief",
    inputs: [
      "Your standard turnover checklist for the listing",
      "Notes from the departing stay: damage, missing items, restock needs",
      "Details of the next arrival you choose to share: date, number of guests, bed setup",
    ],
    draft: [
      "A step-by-step checklist for that listing and that changeover",
      "Issues carried over from the last stay",
      "A restock list",
      "Unknowns, such as a missing bed configuration or key handover",
    ],
    boundaries: [
      "Does not message your cleaners: you share the brief",
      "Does not book or schedule cleaning",
      "Does not confirm work on site: your team still checks",
    ],
    connections: [
      { tool: "notion", use: "Select the standard checklist as a source" },
      { tool: "googledrive", use: "Select the checklist or inventory as a source" },
    ],
    pasteOnly: ["Notes from WhatsApp or voice messages: paste the text into the run"],
    steps: [
      { input: "Checkout notes", output: "Turnover brief drafted", detail: "Standard checklist applied" },
      { input: "Broken lamp reported", output: "Issue carried forward", detail: "Flagged for your decision" },
      { input: "Next guests bring a baby", output: "Bed setup listed", detail: "Cot availability marked unknown" },
    ],
    faq: [
      {
        q: "Can it send the brief to my cleaner?",
        a: "No. Orbis does not message anyone. Copy the brief into the channel your team already uses.",
      },
      {
        q: "Does it know my reservations?",
        a: "Only what you put in the run. A read-only Hostaway pilot can preview reservation dates and status for allowed listings; it never writes and returns no guest details.",
      },
    ],
  },
  {
    slug: "pricing-notes",
    label: "Pricing Notes",
    title: "Pricing notes from the comparables you collect.",
    summary:
      "Paste the comparable listings and local event dates you have gathered. Orbis writes a short note comparing them with your listing; the nightly rate stays your decision.",
    fit: "For hosts who want a reasoned note before changing a rate. Not dynamic pricing and not a revenue-management tool.",
    catalogFlowId: "flow-080",
    contract: "content-draft",
    inputs: [
      "Comparable listings you collected, pasted as text or notes",
      "Your listing's features and current rates",
      "The dates you are pricing and any local events you know of",
    ],
    draft: [
      "Your listing compared with each comparable, on the features you supplied",
      "Differences that could argue for a higher or lower rate, written as reasoning rather than a number to apply",
      "Gaps where the comparables are too thin to compare",
    ],
    boundaries: [
      "Does not change prices in Airbnb, Booking.com or your PMS",
      "Does not search the web for comparables: it uses only what you supply",
      "Makes no occupancy or revenue promises",
    ],
    connections: [
      { tool: "googledrive", use: "Select your comparables notes as a source" },
      { tool: "notion", use: "Select your rate history page as a source" },
    ],
    steps: [
      { input: "Festival weekend", output: "Comparison note drafted", detail: "Event taken from your input" },
      { input: "Comparables pasted", output: "Differences listed", detail: "Thin data flagged" },
      { input: "Quiet midweek", output: "Note drafted", detail: "Rate decision left to you" },
    ],
    faq: [
      {
        q: "Will it set my price?",
        a: "No. The note explains differences; you choose the rate and change it yourself.",
      },
      {
        q: "Where do the comparables come from?",
        a: "From you. Orbis has no live browsing in this mission, so it only compares the listings you paste or select.",
      },
    ],
  },
];

export const airbnbHosts: VerticalHub = {
  slug: "airbnb-hosts",
  label: "Airbnb Hosts",
  seoTitle: "Guest Replies, Reviews and Listing Copy for Airbnb Hosts",
  title: "A bigger hosting business. Not a bigger inbox.",
  lead: "Guest questions, unanswered reviews, seasonal listing rewrites and turnover notes pile up between stays. Orbis prepares each one as a draft built from your house rules and listing details, and you decide what goes out.",
  intro:
    "Pick the hosting task that eats your evenings. Orbis runs it as a bounded mission on the sources you select, and shows you what it could not verify.",
  fit: "For hosts and small short-term rental managers. Not a property management system and not a channel manager.",
  teaser: "Guest replies, review responses, listing copy, turnover briefs and pricing notes.",
  tools: ["notion", "googledrive", "gmail", "outlook"],
  toolsNote:
    "There is no direct Airbnb or Booking.com connection. Guest messages reach Orbis when you paste them from the platform, your PMS or the email notifications you already receive. House rules and listing documents can be selected from Notion, Google Drive or SharePoint. A Hostaway connection is in a read-only pilot: it previews reservation dates and status for allowed listings, never guest messages, and never writes.",
  principles: [
    "Drafts grounded in your house manual and listing, with the lines they rely on quoted",
    "Missing facts, such as parking or late check-in rules, flagged instead of guessed",
    "Corrections you approve are kept as instructions for that mission",
    "Orbis does not message guests, post to a listing or change a rate",
  ],
  workshop: [
    { input: "Reply to a guest", output: "Guest reply drafted", detail: "House rules quoted" },
    { input: "Answer a review", output: "Review reply drafted", detail: "Stay notes cited" },
    { input: "Refresh a listing", output: "Listing copy drafted", detail: "Unsupported amenities flagged" },
  ],
  faq: [
    {
      q: "Will Orbis message my guests?",
      a: "No. Orbis prepares the reply; you copy it into Airbnb, your PMS or your inbox and send it yourself. Sending from Orbis is not enabled.",
    },
    {
      q: "Does it connect to Airbnb?",
      a: "No. Paste the guest thread, or work from the email notifications you already receive. A Hostaway connection exists as a read-only pilot that previews reservation dates and status.",
    },
    {
      q: "Does it replace my PMS or channel manager?",
      a: "No. It prepares drafts next to the tools you keep.",
    },
    {
      q: "Where do my house rules come from?",
      a: "From the sources you select: a Notion page, a Google Drive or SharePoint document, or text you paste. Anything missing is listed as an unknown.",
    },
  ],
  finalTitle: "Start with your listings.",
  jobs,
};
