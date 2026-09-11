/** Content-creators FAQ copy — wired into wave1 hub/jobs */
export type FaqItem = { q: string; a: string };

export const creatorsHubFaq: FaqItem[] = [
  { q: "Will it post to Instagram/TikTok alone?", a: "No by default. Test mode first; outside publish needs policy + connector." },
  { q: "Replace Later/Notion?", a: "No — work around them when connectors exist." },
  { q: "Several formats?", a: "Start with one format context; expand when the first mission is worth keeping." },
  { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  { q: "Does it know my voice?", a: "From the audit/sources you select. Thin sources show as unknowns." },
];

export const creatorsJobFaq: Record<string, FaqItem[]> = {
  "content-drafts": [
    { q: "Will Orbis publish the draft?", a: "Not by default. You publish after review." },
    { q: "Does it know my voice?", a: "From niche notes and sources you select. Missing voice notes show as unknowns." },
    { q: "Several formats (Reel, carousel, Short)?", a: "Start with one format context; expand when the first mission is worth keeping." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
  "research-briefs": [
    { q: "Does it invent citations?", a: "No — sources are listed, and gaps are flagged as unknowns." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
  "sponsorship-replies": [
    { q: "Will Orbis email the brand?", a: "Not by default. You send and negotiate." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
  "calendar-prep": [
    { q: "Does it lock my calendar automatically?", a: "No. You lock the schedule before anything ships." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
};
