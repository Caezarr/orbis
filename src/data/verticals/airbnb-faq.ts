/** Airbnb FAQ copy — wired into wave1 hub/jobs */
export type FaqItem = { q: string; a: string };

export const airbnbHubFaq: FaqItem[] = [
  { q: "Will it message guests alone?", a: "No by default. Test mode first; outside send needs policy + connector." },
  { q: "Replace Guesty/Hostaway?", a: "No — work around them when connectors exist." },
  { q: "Multi-calendar?", a: "Start with one listing context." },
  { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  { q: "Does it know my house rules?", a: "From the audit/sources you select. Missing rules show as unknowns." },
];

export const airbnbJobFaq: Record<string, FaqItem[]> = {
  "guest-messaging": [
    { q: "Will Orbis message the guest?", a: "Not by default. Test mode first; outside send needs policy + connector." },
    { q: "Does it know my house rules?", a: "From the audit/sources you select. Missing rules show as unknowns." },
    { q: "Several listings?", a: "Start with one context; expand when the first mission is worth keeping." },
    { q: "How much?", a: "Free audit + first deliverable to review. Solo ~€149/mo proposed, indicative." },
  ],
  "review-replies": [
    { q: "Will Orbis publish the review reply?", a: "Not by default. You publish after review." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
  "listing-copy": [
    { q: "Does it post to Airbnb?", a: "No by default. You paste live after review." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
  "cleaning-handoff": [
    { q: "Does it message cleaners automatically?", a: "Not by default. Ops still confirm on site." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
  "pricing-notes": [
    { q: "Does it change my prices?", a: "No. You set the price. Notes are research-flavored." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
};
