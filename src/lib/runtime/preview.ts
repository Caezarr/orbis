export type LandingPreview = {
  name: string;
  industry: string;
  facts: Array<{ label: string; value: string; kind: "fact" | "hypothesis" | "missing" }>;
  signal: { title: string; whyNow: string };
  capability: string;
};

export function previewFromInput(input: string): LandingPreview | null {
  const text = input.trim();
  if (text.length < 4) return null;
  const url = /https?:\/\/|www\.|[a-z0-9-]+\.(com|fr|io|co)/i.test(text);
  const construction = /acme|construction|site|chantier|vinci|crew/i.test(text);
  const agency = /agency|inbound|request|support/i.test(text);
  const name = url && construction ? "Acme" : construction ? "Construction software" : agency ? "Inbound ops" : "Your company";
  return {
    name,
    industry: construction ? "Construction software" : agency ? "Client services" : url ? "From the public site" : "From your description",
    facts: [
      {
        kind: "fact",
        label: "What you do",
        value: construction
          ? "Site operations software for construction SMEs."
          : agency
            ? "A team that answers inbound requests all day."
            : url
              ? "We will read the public pages and keep facts separate from guesses."
              : "We treat this as a first explanation, not a source of truth.",
      },
      {
        kind: construction ? "hypothesis" : "missing",
        label: construction ? "Ideal customer" : "Catalog",
        value: construction ? "Mid-size contractors running several sites." : "Approved prices and exceptions are not in the profile yet.",
      },
      {
        kind: "missing",
        label: "Delivery constraint",
        value: "Weekend coverage is not in the catalog. A reply can still be prepared without a price.",
      },
    ],
    signal: {
      title: agency || construction ? "Inbound requests already arrive" : "A bounded first result exists",
      whyNow: "The first useful result does not need an external write. Test mode keeps send blocked.",
    },
    capability: construction || agency ? "Analyze incoming customer requests" : "Research brief",
  };
}
