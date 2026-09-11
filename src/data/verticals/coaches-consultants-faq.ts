/** Coaches-consultants FAQ — Eng paste into src/data/verticals/ (same pattern as airbnb-faq.ts) */
export type FaqItem = { q: string; a: string };

export const coachesConsultantsHubFaq: FaqItem[] = [
  { q: "Will it email clients alone?", a: "No by default. Test mode first; outside send needs policy + connector." },
  { q: "Is this therapy / medical / clinical software?", a: "No. Bounded ops missions (prep, follow-up, research, notes). Coaching judgment and any regulated advice stay with you." },
  { q: "What about client confidentiality?", a: "You control sources and approval. Nothing leaves your practice without you. Do not paste sensitive clinical material you are not allowed to process in your tools." },
  { q: "Replace Calendly / HubSpot / Notion?", a: "No — work around them when connectors exist." },
  { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  { q: "Does it know my ICP and offers?", a: "From the audit/sources you select. Missing offer lines or ICP rules show as unknowns." },
];

export const coachesConsultantsJobFaq: Record<string, FaqItem[]> = {
  "discovery-prep": [
    { q: "Will Orbis join or run the discovery call?", a: "No. Prep brief only. You lead the call." },
    { q: "Is this clinical intake?", a: "No. Business/ops prep for coaching and consulting discovery — not medical or therapy intake." },
    { q: "Does it know my ICP?", a: "From the audit/sources you select. Missing disqualifiers show as unknowns." },
    { q: "Several offers / niches?", a: "Start with one offer context; expand when the first mission is worth keeping." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
  "follow-up-emails": [
    { q: "Will Orbis email the prospect?", a: "Not by default. Test mode first; outside send needs policy + connector." },
    { q: "Will it close the deal?", a: "No. Draft only. Pricing, objections, and commitment stay with you." },
    { q: "Does it know what we discussed?", a: "From the call notes / sources you select. Missing points show as unknowns — you fill them before send." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
  "lead-research": [
    { q: "Will Orbis message the lead?", a: "Not from this mission. Research brief only; outreach is a separate decision you control." },
    { q: "Does it scrape LinkedIn automatically?", a: "Not by default. You supply the URL / context; connectors come later with policy." },
    { q: "Is fit guaranteed?", a: "No. Hypotheses to test — you decide on the call." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
  "session-notes": [
    { q: "Will Orbis email the client the notes?", a: "Not by default. Test mode first; outside send needs policy + connector." },
    { q: "Is this medical / therapy documentation?", a: "No. Practice ops notes and client-update drafts for coaching/consulting — not clinical charting, not diagnosis." },
    { q: "Does it invent action items?", a: "No. Missing owners or dates show as unknowns. You confirm commitments before anything leaves." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
};
