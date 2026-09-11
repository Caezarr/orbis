/** Airbnb FAQ v2 — home honesty tone; Eng paste/replace airbnb-faq.ts */
export type FaqItem = { q: string; a: string };

export const airbnbHubFaq: FaqItem[] = [
  { q: "Will it message guests alone?", a: "Not by default. Test mode first. Outside send needs a verified connector and an explicit policy." },
  { q: "Replace Guesty / Hostaway?", a: "No. Work around them when connectors exist. Your stack stays yours." },
  { q: "Multi-calendar?", a: "Start with one listing context. Expand when the first mission is worth keeping." },
  { q: "How much?", a: "Free audit. Solo ~€149/mo proposed — indicative. A VA on guest chat + reviews often sits inside €2–4k/mo loaded capacity — direction, not a quote." },
  { q: "Does it know my house rules?", a: "From the sources you select. Missing rules show as unknowns." },
  { q: "What can I use today?", a: "Website/intake, guided audit, bounded missions, evaluated runs you review. Self-serve OAuth and scheduled outside sends are still being built." },
];

export const airbnbJobFaq: Record<string, FaqItem[]> = {
  "guest-messaging": [
    { q: "Will Orbis message the guest?", a: "Not by default. Test mode first; outside send needs policy + connector." },
    { q: "Does it know my house rules?", a: "From the sources you select. Missing rules show as unknowns." },
    { q: "Several listings?", a: "Start with one context; expand when the first mission earns it." },
    { q: "How much?", a: "Free audit. Solo ~€149/mo proposed — indicative. VA guest-chat slice often inside €2–4k/mo loaded." },
  ],
  "review-replies": [
    { q: "Will Orbis publish the review reply?", a: "Not by default. You publish after review." },
    { q: "Does it invent what happened?", a: "No. Thin stay notes show as unknowns." },
    { q: "Several listings?", a: "One context first." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
  "listing-copy": [
    { q: "Does it post to Airbnb?", a: "No by default. You paste after review." },
    { q: "SEO / ranking promises?", a: "No. Clear copy you control — not marketplace magic." },
    { q: "Several listings?", a: "Start with one." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
  "cleaning-handoff": [
    { q: "Does it message cleaners automatically?", a: "Not by default. Ops still confirm on site." },
    { q: "Replace your PMS?", a: "No — work around it when connectors exist." },
    { q: "Multi-property?", a: "One listing context first." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
  "pricing-notes": [
    { q: "Does it change my prices?", a: "No. You set the rate." },
    { q: "Dynamic pricing / revenue OS?", a: "No — research-flavored notes only." },
    { q: "Guarantee occupancy?", a: "No." },
    { q: "How much?", a: "Free audit; Solo ~€149 proposed — indicative." },
  ],
};
