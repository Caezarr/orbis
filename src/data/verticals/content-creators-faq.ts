/** Content-creators FAQ — Eng paste into src/data/verticals/ (same pattern as airbnb-faq.ts) */
export type FaqItem = { q: string; a: string };

export const contentCreatorsHubFaq: FaqItem[] = [
  { q: "Will it post to Instagram or TikTok alone?", a: "No by default. Test mode first; outside publish needs policy + connector." },
  { q: "Will it negotiate brand deals for me?", a: "No. It drafts replies from your rate card and scope notes. You send, price, and sign." },
  { q: "Does it replace Later / Notion / my editor?", a: "No — work around them when connectors exist. Your stack stays yours." },
  { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  { q: "Does it know my voice and niche?", a: "From the audit/sources you select (past posts, brand guidelines, rate card). Missing pieces show as unknowns." },
  { q: "Several channels?", a: "Start with one niche context; expand when the first mission is worth keeping." },
];

export const contentCreatorsJobFaq: Record<string, FaqItem[]> = {
  "content-drafts": [
    { q: "Will Orbis post the draft?", a: "Not by default. Test mode first; outside publish needs policy + connector." },
    { q: "Does it know my voice?", a: "From the audit/sources you select (past posts, brand notes). Missing voice samples show as unknowns." },
    { q: "Several formats (Reel, carousel, Short)?", a: "Start with one format context; expand when the first mission is worth keeping." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
  "research-briefs": [
    { q: "Will Orbis invent sources?", a: "No. Missing or thin evidence shows as unknowns. You verify before you film." },
    { q: "Does it scrape competitors automatically?", a: "Not by default. You supply links / context in the audit or run; connectors come later with policy." },
    { q: "Is this journalism or fact-checking?", a: "Ops research for content — not a newsroom workflow, not legal review." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
  "sponsorship-replies": [
    { q: "Will Orbis email the brand?", a: "Not by default. Test mode first; outside send needs policy + connector." },
    { q: "Will it set my rates?", a: "No. Rates come from the card/sources you select. Missing prices show as unknowns — you fill them." },
    { q: "Several brands at once?", a: "Start with one thread context; expand when the first mission is worth keeping." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
  "calendar-prep": [
    { q: "Will Orbis schedule posts for me?", a: "Not by default. Test mode first; outside write needs policy + connector." },
    { q: "Does it replace Later / Buffer?", a: "No — prep around them. Scheduling tools stay yours." },
    { q: "Does it know my posting cadence?", a: "From the audit/sources you select. Missing cadence shows as unknowns." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
};
