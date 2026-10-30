import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// The demo path must never construct the real SDK.
vi.mock("@composio/core", () => ({
  Composio: class {
    constructor() {
      throw new Error("real Composio SDK constructed");
    }
  },
}));
import { processMailboxBatch, type InboxStore, type MessageRow, type MessageUpdate } from "@/lib/inbox/pipeline";
import { integrationUser, startConnection } from "@/lib/integrations/composio";
import { resolveDemoConsent } from "@/lib/integrations/demo-mailbox/fake-sdk";
import { memoryDemoStore, setDemoStore, type DemoStore } from "@/lib/integrations/demo-mailbox/store";
import { mailboxClient, type DraftReceipt } from "@/lib/integrations/mailbox";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import {
  bestSourceSentence,
  DEMO_DRAFT_NOTICE,
  demoClassify,
  demoFollowupModel,
  demoInboxModel,
  demoModelActive,
} from "./demo-model";
import { guardDraft, type ReplySource } from "./inbox-replies";
import { getModel, providerStatus } from "./provider";

const ids = { tenantId: "tenant-demo", workspaceId: "ws-demo" };
const userId = integrationUser(ids.tenantId, ids.workspaceId);
const ORIGIN = "http://127.0.0.1:3000";
let store: DemoStore;

beforeEach(() => {
  vi.stubEnv("ORBIS_AI_PROVIDER", "demo");
  vi.stubEnv("ORBIS_AI_MODEL", "");
  vi.stubEnv("ORBIS_DEMO_MAILBOX", "true");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("COMPOSIO_API_KEY", "");
  store = memoryDemoStore();
  setDemoStore(store);
});
afterEach(() => {
  setDemoStore(null);
  vi.unstubAllEnvs();
});

const mail = (subject: string, text: string): MailMessage =>
  ({
    id: "m1",
    threadId: "t1",
    subject,
    text,
    from: { address: "client@example.fr" },
    replyTo: [],
    fromOwner: false,
    receivedAt: new Date().toISOString(),
  }) as unknown as MailMessage;

describe("demo model switch (fail closed)", () => {
  it("is active only with the demo mailbox, off production", () => {
    expect(demoModelActive()).toBe(true);
    vi.stubEnv("ORBIS_DEMO_MAILBOX", "");
    expect(demoModelActive()).toBe(false);
    vi.stubEnv("ORBIS_DEMO_MAILBOX", "true");
    for (const [name, value] of [
      ["NODE_ENV", "production"],
      ["VERCEL_ENV", "production"],
    ] as const) {
      vi.stubEnv(name, value);
      expect(demoModelActive()).toBe(false);
      vi.stubEnv(name, name === "NODE_ENV" ? "test" : "");
    }
    vi.stubEnv("ORBIS_AI_PROVIDER", "openai");
    expect(demoModelActive()).toBe(false);
  });
  it("never counts as a configured provider: other model features stay off", () => {
    vi.stubEnv("ORBIS_AI_MODEL", "anything");
    expect(providerStatus().configured).toBe(false);
    expect(() => getModel()).toThrow();
  });
});

describe("deterministic output", () => {
  it("triages by keywords", () => {
    expect(demoClassify(mail("Devis salon", "Bonjour, combien pour 20 m² ?"))).toBe("quote_request");
    expect(demoClassify(mail("La lettre du mois", "Pour vous désabonner, cliquez ici"))).toBe("noise");
    expect(demoClassify(mail("Confirmation de commande n° 12", "Votre livraison arrive"))).toBe("supplier");
    expect(demoClassify(mail("Attestation décennale", "Renouvellement"))).toBe("admin");
    expect(demoClassify(mail("Merci !", "Le chantier est superbe."))).toBe("customer_request");
  });

  it("quotes a source verbatim, and the guard keeps the citation and the figure", async () => {
    const sources: ReplySource[] = [
      { id: "fact:1", kind: "fact", name: "Prix", content: "Peinture des murs : 26 € HT le m², fournitures comprises.\nZone : métropole lilloise." },
    ];
    const message = mail("Peinture des murs", "Bonjour, quel prix pour la peinture des murs d'un salon ?");
    expect(bestSourceSentence(message.text, sources)?.sentence).toBe("Peinture des murs : 26 € HT le m², fournitures comprises.");
    const { output } = await demoInboxModel.draft({ message, thread: [], company: {}, sources, toneSamples: [] });
    expect(output.body.startsWith(DEMO_DRAFT_NOTICE)).toBe(true);
    const guarded = guardDraft(output, { sources, message });
    expect(guarded.issues).toEqual([]);
    expect(guarded.citations).toHaveLength(1);
    expect(guarded.body).toContain("26 € HT le m²");
    expect(guarded.body).toContain("[[À CONFIRMER : réponse précise à la demande]]");
  });

  it("proposes only the slots computed by code", async () => {
    const slots = [{ label: "mardi 14 octobre à 9 h" }, { label: "jeudi 16 octobre à 14 h" }];
    const { output } = await demoInboxModel.draft({
      message: mail("Visite", "Pouvez-vous passer voir le chantier ?"),
      thread: [],
      company: {},
      sources: [],
      toneSamples: [],
      meeting: { mode: "slots", kind: "visit", timezone: "Europe/Paris", slots } as never,
    });
    for (const s of slots) expect(output.body).toContain(s.label);
    expect(output.body).not.toContain("[[");
  });

  it("extracts only verbatim quotes from the request", async () => {
    const text = "Bonjour, je voudrais repeindre ma cuisine. Budget 1 500 € TTC, travaux avant fin novembre.";
    const { output } = await demoFollowupModel.extractRequest(mail("Cuisine", text));
    for (const q of [output.needQuote, output.budgetQuote, output.deadlineQuote]) expect(text).toContain(q!);
    expect(output.budgetQuote).toBe("1 500 € TTC");
    const last = await demoFollowupModel.draftFollowup({ stage: 2 } as never);
    expect(last.output.body).toContain("dernière relance");
  });
});

// The real pipeline (guard, ledger, mailbox broker) on the demo mailbox.
function memoryInbox() {
  const rows = new Map<string, MessageRow & Omit<MessageUpdate, "classification" | "status"> & { receipt?: DraftReceipt; done?: boolean }>();
  const inbox: InboxStore = {
    async upsertMessage(message) {
      if (!rows.has(message.id)) rows.set(message.id, { rowId: message.id, status: "seen", classification: null });
      return rows.get(message.id)!;
    },
    async update(rowId, update) {
      Object.assign(rows.get(rowId)!, update);
    },
    reserveBudget: async () => true,
    addUsage: async () => {},
    ledger(rowId) {
      const row = rows.get(rowId)!;
      return {
        claim: async () => (row.done ? { state: "done", receipt: row.receipt! } : { state: "claimed" }),
        retry: async () => false,
        async record(_key, receipt) {
          row.done = true;
          row.receipt = receipt;
        },
        markUncertain: async () => {},
      };
    },
    heartbeat: async () => true,
  };
  return { inbox, rows };
}

describe("first run on the demo mailbox with the demo model", () => {
  it("drafts into the fake mailbox, every draft labelled, to the original sender only", async () => {
    const callback = `${ORIGIN}/start?connected=gmail`;
    const { redirectUrl } = await startConnection(userId, "gmail", callback);
    const accountId = new URL(redirectUrl!).searchParams.get("account")!;
    resolveDemoConsent({ accountId, userId, approve: true, origin: ORIGIN });
    const memory = memoryInbox();
    const stats = await processMailboxBatch({
      batch: {
        id: "batch-demo",
        ...ids,
        provider: "gmail",
        connectedAccountId: accountId,
        missionVersion: "inbox-replies@1",
        windowDays: 14,
        maxMessages: 50,
        maxDrafts: 50,
      },
      mailbox: mailboxClient("gmail", { ...ids, connectedAccountId: accountId }, { mode: "scoped_autonomy" }),
      model: demoInboxModel,
      store: memory.inbox,
      context: {
        company: { name: "MDK Peinture", summary: undefined },
        sourcesFor: () => [
          { id: "fact:zone", kind: "fact", name: "Zone", content: "Nous intervenons sur la métropole lilloise et à Tournai." },
        ],
      },
      costs: { classifyCents: 0, draftCents: 0 },
      requests: { track: async () => ({ created: true }) },
    });
    expect(stats.drafted).toBeGreaterThan(0);
    expect(stats.failed + stats.uncertain).toBe(0);
    expect(stats.needsReview).toBe(1);
    const drafts = store.read().drafts;
    expect(drafts).toHaveLength(stats.drafted);
    expect(drafts.every((d) => d.body.startsWith(DEMO_DRAFT_NOTICE) && d.to.length === 1)).toBe(true);
    expect(drafts.some((d) => d.to.join(",").includes("evil"))).toBe(false);
    // Relayed site form (Reply-To differs) is never drafted, whatever the model.
    expect(drafts.some((d) => d.threadKey === "site-formulaire")).toBe(false);
    const flags = [...memory.rows.values()].flatMap((r) => r.flags ?? []);
    expect(flags).not.toContain("guard:invalid_citation");
  });
});
