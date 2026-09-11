import { flows } from "./catalog";
const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const ignored = new Set(
  "with from that this have want need help prepare preparer faire partir notre votre pour avec dans les des une des mon mes mes jour clear analyse".split(
    " ",
  ),
);
const aliases: Record<string, string> = {
  quote: "devis",
  quotes: "devis",
  customer: "client",
  customers: "client",
  requests: "demandes",
  reply: "reponse",
  replies: "reponse",
  meetings: "reunion",
  meeting: "reunion",
  research: "veille",
  competitors: "concurrent",
  invoices: "facture",
  invoice: "facture",
  sales: "commercial",
  hiring: "recrutement",
  emails: "email",
};
export function suggestMissions(text: string) {
  const tokens = [
    ...new Set(
      normalise(text)
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 3 && !ignored.has(t))
        .flatMap((t) => (aliases[t] ? [t, aliases[t]] : [t])),
    ),
  ];
  return flows
    .map((flow) => {
      const title = normalise(flow.title);
      const rest = normalise(`${flow.input} ${flow.output} ${flow.department}`);
      return {
        flow,
        score: tokens.reduce(
          (sum, t) => sum + (title.includes(t) ? 3 : rest.includes(t) ? 1 : 0),
          0,
        ),
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
