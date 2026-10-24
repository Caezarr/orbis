import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RequestView } from "@/lib/followups/service";
import { RequestsView, type RequestsData } from "./RequestsView";

type Followup = RequestView["followups"][number];

function render(followup: Partial<Followup>) {
  const item: RequestView = {
    id: "item-1",
    kind: "quote_request",
    status: "repondu",
    statusLabel: "Répondu",
    contact: { name: "Client", email: "client@example.test", domain: "example.test" },
    need: null,
    budget: null,
    deadline: null,
    extraction: "done",
    receivedAt: null,
    firstRepliedAt: null,
    lastOwnerAt: null,
    lastCustomerAt: null,
    awaitingCustomer: true,
    snoozedUntil: null,
    followupsDismissed: false,
    closedAt: null,
    drafts: 1,
    openUrl: "https://mail.google.com/mail/",
    followups: [
      { id: "f-1", stage: 1, status: "drafted", draftedAt: null, preview: null, questions: [], flags: [], simulated: true, ...followup },
    ],
  };
  const data: RequestsData = {
    items: [item],
    counts: { nouveau: 0, repondu: 1, relance: 0, gagne: 0, perdu: 0 },
    settings: { enabled: true, businessDays: 3, maxStages: 2, replyBaselineMinutes: null },
    mode: "test",
    canEdit: false,
    canAdmin: false,
  };
  return renderToStaticMarkup(
    createElement(RequestsView, { view: "relances", data, filters: {}, busy: null, onFilter: () => undefined, onAction: () => undefined }),
  );
}

describe("RequestsView follow-up review", () => {
  it("lists Orbi's questions and [[À CONFIRMER]] spots before sending, once each", () => {
    const html = render({
      preview: "Bonjour, notre devis tient toujours. Passage prévu [[À CONFIRMER : date de passage]], tarif [[À CONFIRMER : prix]].",
      questions: ["Quel prix confirmer au client ?", "Quelle date de passage proposer ?"],
    });
    expect(html).toContain("À confirmer avant d’envoyer");
    expect(html).toContain("<li>Quel prix confirmer au client ?</li>");
    expect(html).toContain("<li>Quelle date de passage proposer ?</li>");
    // Both spots are already covered by a question: not listed a second time.
    expect(html).not.toContain("<li>date de passage</li>");
    expect(html).not.toContain("<li>prix</li>");
  });

  it("lists a spot that no question covers", () => {
    const html = render({ preview: "Le délai reste [[À CONFIRMER : délai]].", questions: [] });
    expect(html).toContain("<li>délai</li>");
  });

  it("keeps the guards' notes and drops internal flags", () => {
    const html = render({ preview: "Bonjour", flags: ["guard:amount", "claim_check:budget"] });
    expect(html).toContain('aria-label="Points à vérifier"');
    expect(html).not.toContain("À confirmer avant d’envoyer");
    expect(html).not.toContain("claim_check");
  });

  it("shows nothing extra for a confident follow-up", () => {
    const html = render({ preview: "Bonjour, avez-vous pu regarder notre devis ?" });
    expect(html).not.toContain("À confirmer avant d’envoyer");
    expect(html).not.toContain("Points à vérifier");
  });
});
