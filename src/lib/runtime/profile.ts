import { id } from "@/lib/ids";
import { looksLikeUrl, normalizeWebsite } from "@/lib/ssrf";
import type { CompanyProfile, ProfileClaim } from "@/lib/domain/types";
import { DEMO_TENANT } from "@/lib/store/seed";

type Known = {
  match: RegExp;
  name: string;
  website: string;
  summary: string;
  industry: string;
  size: string;
  region: string;
  tags: string[];
  facts: Array<{ label: string; value: string; sourceUrl?: string }>;
  hypotheses: Array<{ label: string; value: string }>;
  missing: Array<{ label: string; value: string }>;
};

const KNOWN: Known[] = [
  {
    match: /acme|construction|chantier|vinci/i,
    name: "Acme",
    website: "https://acme.com",
    summary:
      "B2B software for construction teams. Acme helps site managers plan, quote and coordinate crews without a patchwork of spreadsheets.",
    industry: "Construction software",
    size: "SME — ~50 people",
    region: "Europe",
    tags: ["B2B", "Construction", "SaaS", "Europe"],
    facts: [
      {
        label: "What you do",
        value: "Site operations software: planning, quoting, crew coordination.",
        sourceUrl: "https://acme.com",
      },
      {
        label: "Who you serve",
        value: "General contractors and site managers, typically 20–200 people.",
        sourceUrl: "https://acme.com/customers",
      },
      {
        label: "What you care about",
        value: "Time-to-quote and not inventing prices in customer replies.",
        sourceUrl: "https://acme.com/about",
      },
    ],
    hypotheses: [
      { label: "Ideal customer", value: "Mid-size contractors running 3+ simultaneous sites." },
      { label: "Primary channel", value: "Inbound from LinkedIn and partner referrals." },
    ],
    missing: [
      { label: "Offer catalog", value: "Approved price list and weekend-coverage terms." },
      { label: "Delivery constraint", value: "Standard lead time for on-site rollout." },
    ],
  },
  {
    match: /wonka/i,
    name: "Wonka",
    website: "https://wonka.ai",
    summary:
      "AI platform for companies that want useful work delegated — not another chatbot. Wonka sits between operators and the models they already use.",
    industry: "Enterprise AI",
    size: "Scale-up",
    region: "Europe",
    tags: ["B2B", "AI", "SaaS", "Europe"],
    facts: [
      { label: "What you do", value: "An operating layer for installing AI work inside existing companies.", sourceUrl: "https://wonka.ai" },
      { label: "Who you serve", value: "Operators who know the business and want work delegated quickly." },
    ],
    hypotheses: [{ label: "First wedge", value: "Customer-request analysis and meeting preparation." }],
    missing: [{ label: "First connector", value: "Which source is safe and valuable enough to connect first." }],
  },
];

function claimsFromKnown(known: Known): ProfileClaim[] {
  return [
    ...known.facts.map((item) => ({
      id: id("claim"),
      kind: "fact" as const,
      label: item.label,
      value: item.value,
      sourceUrl: item.sourceUrl,
      confidence: 0.86,
    })),
    ...known.hypotheses.map((item) => ({
      id: id("claim"),
      kind: "hypothesis" as const,
      label: item.label,
      value: item.value,
      confidence: 0.52,
    })),
    ...known.missing.map((item) => ({
      id: id("claim"),
      kind: "missing" as const,
      label: item.label,
      value: item.value,
      confidence: 0,
    })),
  ];
}

export function buildProfile(input: string, tenantId = DEMO_TENANT): CompanyProfile {
  const text = input.trim();
  const known = KNOWN.find((item) => item.match.test(text));
  const website = looksLikeUrl(text) ? normalizeWebsite(text) : undefined;

  if (known) {
    return {
      id: id("profile"),
      tenantId,
      name: known.name,
      website: website ?? known.website,
      summary: known.summary,
      industry: known.industry,
      size: known.size,
      region: known.region,
      tags: known.tags,
      claims: claimsFromKnown(known),
      input: text,
      completedAt: new Date().toISOString(),
    };
  }

  const nameGuess =
    website?.replace(/^https?:\/\//, "").split("/")[0]?.split(".")[0] ??
    text.split(/\s+/).slice(0, 3).join(" ") ??
    "Your company";
  const pretty = nameGuess.charAt(0).toUpperCase() + nameGuess.slice(1);

  return {
    id: id("profile"),
    tenantId,
    name: pretty,
    website,
    summary: text.length > 40 ? text.slice(0, 280) : `${pretty} — enough context to suggest a first piece of work.`,
    industry: "Unspecified",
    tags: ["Needs confirmation"],
    claims: [
      {
        id: id("claim"),
        kind: "fact",
        label: "What you said",
        value: text.slice(0, 240) || "A company that wants work delegated.",
        sourceUrl: website,
        confidence: 0.7,
      },
      {
        id: id("claim"),
        kind: "hypothesis",
        label: "Useful starting work",
        value: "Customer-request analysis or a research brief is usually the fastest first result.",
        confidence: 0.5,
      },
      {
        id: id("claim"),
        kind: "missing",
        label: "Customers and offer",
        value: "Who you serve and what is approved to say are still missing.",
        confidence: 0,
      },
    ],
    input: text,
    completedAt: new Date().toISOString(),
  };
}
