import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// The demo path must never construct the real SDK.
vi.mock("@composio/core", () => ({
  Composio: class {
    constructor() {
      throw new Error("real Composio SDK constructed");
    }
  },
}));
import { processExtraction } from "@/lib/brain/extract";
import type { BrainModel } from "@/lib/brain/model";
import { decideFollowup, observeThread, classifyOwnerMessage } from "@/lib/followups/detect";
import { processMailboxBatch, type InboxBatch, type InboxStore, type MessageRow, type MessageUpdate } from "@/lib/inbox/pipeline";
import { sdkClient } from "@/lib/integrations/action-broker";
import { composioConfigured, integrationReadiness, integrationUser, startConnection } from "@/lib/integrations/composio";
import {
  MAILBOX_TOOLS,
  mailboxClient,
  mailboxConfigured,
  workspaceMailboxAccounts,
  type DraftReceipt,
  type MailboxMode,
  type MailboxProvider,
} from "@/lib/integrations/mailbox";
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import type { Classification, InboxModel } from "@/lib/runtime/inbox-replies";
import { createDemoComposio, DEMO_TOOLS, resolveDemoConsent } from "./fake-sdk";
import { DEFAULT_FIXTURE, type ExpectedKind } from "./fixtures";
import { DEMO_CONSENT_PATH, DemoMailboxForbiddenError, demoMailboxActive, demoMailboxEnabled } from "./guard";
import { memoryDemoStore, setDemoStore, type DemoStore } from "./store";

const ids = { tenantId: "tenant-demo", workspaceId: "ws-demo" };
const userId = integrationUser(ids.tenantId, ids.workspaceId);
const ORIGIN = "http://127.0.0.1:3000";
let store: DemoStore;

beforeEach(() => {
  vi.stubEnv("ORBIS_DEMO_MAILBOX", "true");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("COMPOSIO_API_KEY", "");
  for (const p of ["GMAIL", "OUTLOOK"]) {
    vi.stubEnv(`COMPOSIO_AUTH_CONFIG_${p}`, "");
    vi.stubEnv(`COMPOSIO_TOOL_VERSION_${p}`, "");
  }
  vi.stubEnv("COMPOSIO_TOOL_VERSION", "");
  store = memoryDemoStore();
  setDemoStore(store);
});
afterEach(() => {
  // No-send guarantee holds in the demo too: no draft ever targets the injection address.
  for (const d of store.read().drafts) expect(d.to.join(",")).not.toMatch(/evil/);
  setDemoStore(null);
  vi.unstubAllEnvs();
});

/** Real connection flow: link → demo consent page → approve → server-side verification. */
async function connect(provider: MailboxProvider) {
  const callback = `${ORIGIN}/start?connected=${provider}`;
  const { redirectUrl } = await startConnection(userId, provider, callback);
  const redirect = new URL(redirectUrl!);
  expect(redirect.origin).toBe(ORIGIN);
  expect(redirect.pathname).toBe(DEMO_CONSENT_PATH);
  const accountId = redirect.searchParams.get("account")!;
  expect(await workspaceMailboxAccounts(provider, ids.tenantId, ids.workspaceId)).toEqual([]);
  // Another workspace cannot approve this consent.
  expect(resolveDemoConsent({ accountId, userId: integrationUser("other", "ws"), approve: true, origin: ORIGIN })).toBeNull();
  // Return only to this app's origin.
  expect(resolveDemoConsent({ accountId, userId, approve: true, origin: "https://evil.example" })).toBeNull();
  expect(resolveDemoConsent({ accountId, userId, approve: true, origin: ORIGIN })).toMatchObject({ callbackUrl: callback });
  expect(await workspaceMailboxAccounts(provider, ids.tenantId, ids.workspaceId)).toEqual([accountId]);
  return accountId;
}

describe("demo switch is impossible in production (fail closed)", () => {
  it("refuses NODE_ENV=production and VERCEL_ENV=production, loudly", () => {
    expect(demoMailboxEnabled()).toBe(true);
    for (const [name, value] of [
      ["NODE_ENV", "production"],
      ["VERCEL_ENV", "production"],
    ] as const) {
      vi.stubEnv(name, value);
      expect(() => demoMailboxEnabled()).toThrow(DemoMailboxForbiddenError);
      expect(demoMailboxActive()).toBe(false);
      // Every Composio entry point refuses instead of silently serving the fake.
      expect(() => sdkClient()).toThrow(DemoMailboxForbiddenError);
      expect(() => composioConfigured()).toThrow(DemoMailboxForbiddenError);
      expect(() => createDemoComposio(store)).toThrow();
      expect(mailboxConfigured("gmail")).toBe(false);
      expect(() => resolveDemoConsent({ accountId: "ca_demo_x", userId, approve: true, origin: ORIGIN })).toThrow();
      vi.stubEnv(name, name === "NODE_ENV" ? "test" : "");
    }
  });
  it("is off unless explicitly set to true", () => {
    vi.stubEnv("ORBIS_DEMO_MAILBOX", "1");
    expect(demoMailboxEnabled()).toBe(false);
    expect(mailboxConfigured("gmail")).toBe(false);
  });
  it("the dev consent route answers 404 on production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("@/app/api/dev/demo-mailbox/consent/route");
    const res = await POST(new Request(`${ORIGIN}/api/dev/demo-mailbox/consent`, { method: "POST" }));
    expect(res.status).toBe(404);
  });
});

describe("fake SDK surface", () => {
  it("knows exactly the allowlisted mailbox tools, nothing else", async () => {
    const allowlisted = new Set(Object.values(MAILBOX_TOOLS).flatMap((ops) => Object.values(ops)));
    expect(new Set(Object.keys(DEMO_TOOLS))).toEqual(allowlisted);
    const sdk = createDemoComposio(store);
    for (const slug of ["GMAIL_SEND_EMAIL", "GMAIL_SEND_DRAFT", "OUTLOOK_SEND_EMAIL", "GMAIL_DELETE_MESSAGE"]) {
      await expect(sdk.tools.execute(slug, { userId, connectedAccountId: "x", arguments: {} })).rejects.toThrow();
      await expect(sdk.tools.getRawComposioToolBySlug(slug)).rejects.toThrow();
    }
  });
  it("configures Gmail and Outlook without any Composio key", () => {
    expect(mailboxConfigured("gmail")).toBe(true);
    expect(mailboxConfigured("outlook")).toBe(true);
    const ready = integrationReadiness().filter((i) => i.configured).map((i) => i.slug);
    expect(ready).toEqual(expect.arrayContaining(["gmail", "outlook"]));
  });
  it("refuses tools for an account that is not active for that user, and extra arguments", async () => {
    const accountId = await connect("gmail");
    const sdk = createDemoComposio(store);
    const other = await sdk.tools.execute("GMAIL_FETCH_EMAILS", {
      userId: integrationUser("other", "ws"),
      connectedAccountId: accountId,
      arguments: { user_id: "me", query: "in:inbox newer_than:14d" },
    });
    expect(other.successful).toBe(false);
    const thread = (await sdk.tools.execute("GMAIL_FETCH_EMAILS", {
      userId,
      connectedAccountId: accountId,
      arguments: { user_id: "me", query: "in:inbox newer_than:14d", max_results: 1 },
    })) as { data: { messages: { threadId: string }[] } };
    const withCc = await sdk.tools.execute("GMAIL_CREATE_EMAIL_DRAFT", {
      userId,
      connectedAccountId: accountId,
      arguments: { user_id: "me", thread_id: thread.data.messages[0]!.threadId, recipient_email: "a@b.example", body: "x", cc: ["x@evil.example"] },
    });
    expect(withCc).toMatchObject({ successful: false });
    expect(store.read().drafts).toHaveLength(0);
  });
});

// ------------------------------------------------------------- pipeline integration
const threadOf = (m: MailMessage) =>
  DEFAULT_FIXTURE.threads.find((t) => t.subject === m.subject.replace(/^(re|tr)\s*:\s*/i, ""));
const inboxModel = () =>
  ({
    classify: vi.fn(async (m: MailMessage) => {
      const expected: ExpectedKind = threadOf(m)?.expect ?? "noise";
      if (expected === "skipped") throw new Error(`model called for a deterministic skip: ${m.subject}`);
      return { output: { classification: expected as Classification, reason: "" }, usage: { inputTokens: 10, outputTokens: 2 } };
    }),
    draft: vi.fn(async ({ message }: { message: MailMessage }) => ({
      output: {
        body: `Bonjour,\n\nMerci pour votre message (${message.subject}). Je reviens vers vous rapidement. [[À CONFIRMER : disponibilités]]\n\nMehdi`,
        questions: ["Quelles disponibilités proposer ?"],
        citations: [],
      },
      usage: { inputTokens: 100, outputTokens: 50 },
    })),
  }) satisfies InboxModel;

/** Same ledger semantics as postgresInboxStore (see pipeline.test.ts). */
function memoryInbox() {
  const rows = new Map<string, MessageRow & Omit<MessageUpdate, "classification" | "status"> & { receipt?: DraftReceipt; state: string }>();
  const inbox: InboxStore = {
    async upsertMessage(message) {
      if (!rows.has(message.id)) rows.set(message.id, { rowId: message.id, status: "seen", classification: null, state: "none" });
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
        async claim() {
          if (row.state === "done") return { state: "done", receipt: row.receipt! };
          if (row.state === "none") {
            row.state = "claimed";
            return { state: "claimed" };
          }
          return { state: "uncertain", claimedAt: new Date(), attempts: 1 };
        },
        retry: async () => false,
        async record(_key, receipt) {
          row.state = "done";
          row.receipt = receipt;
        },
        async markUncertain() {
          row.state = "uncertain";
        },
      };
    },
    heartbeat: async () => true,
  };
  return { inbox, rows };
}
const context = {
  company: { name: "MDK Peinture", summary: "Peintre en bâtiment à Allennes-les-Marais" },
  sourcesFor: () => [],
};
async function runBatch(provider: MailboxProvider, accountId: string, mode: MailboxMode, memory = memoryInbox()) {
  const batch: InboxBatch = {
    id: `batch-${provider}`,
    ...ids,
    provider,
    connectedAccountId: accountId,
    missionVersion: "inbox-replies@1",
    windowDays: 14,
    maxMessages: 50,
    maxDrafts: 50,
  };
  const track = vi.fn(async () => ({ created: true }));
  const model = inboxModel();
  const stats = await processMailboxBatch({
    batch,
    mailbox: mailboxClient(provider, { ...ids, connectedAccountId: accountId }, { mode }),
    model,
    store: memory.inbox,
    context,
    costs: { classifyCents: 1, draftCents: 5 },
    requests: { track },
  });
  const bySubject = new Map([...memory.rows.values()].map((r) => [r.rowId, r]));
  return { stats, track, model, memory, bySubject };
}

describe.each(["gmail", "outlook"] as const)("first run end to end on the demo mailbox (%s)", (provider) => {
  it("connects, triages, drafts into the fake mailbox and stays idempotent", async () => {
    const accountId = await connect(provider);
    const { stats, track, model, memory } = await runBatch(provider, accountId, "scoped_autonomy");
    const inWindow = DEFAULT_FIXTURE.threads.filter((t) =>
      t.messages.some((m) => m.dir === "in" && m.day > -14),
    );
    expect(stats.listed).toBe(inWindow.length);
    // Deterministic skips (no-reply senders, newsletters, auto-replies), then
    // threads the owner already answered (quotes sent, a confirmed visit).
    const deterministic = DEFAULT_FIXTURE.threads.filter((t) => t.expect === "skipped").length;
    const answered = inWindow.filter((t) => t.messages.at(-1)!.dir === "out");
    expect(answered.map((t) => t.key)).toEqual(
      expect.arrayContaining(["allennes-visite", "lille-t3", "haubourdin-facade", "tournai-couloir2", "seclin-dimensions"]),
    );
    expect(stats.skipped).toBe(deterministic + answered.length);
    expect(model.classify).toHaveBeenCalledTimes(inWindow.length - deterministic);
    // Actionable: quote/customer requests, each tracked in the request pipeline
    // (answered quotes too: they feed follow-ups). The relayed site form (Reply-To differs) needs review.
    const actionable = inWindow.filter((t) => t.expect === "quote_request" || t.expect === "customer_request");
    expect(stats.actionable).toBe(actionable.length);
    expect(track).toHaveBeenCalledTimes(actionable.length);
    expect(stats.needsReview).toBe(1);
    expect(stats.drafted).toBe(actionable.length - answered.length - 1);
    expect(stats.failed + stats.uncertain).toBe(0);

    const drafts = store.read().drafts;
    expect(drafts).toHaveLength(stats.drafted);
    expect(drafts.every((d) => d.provider === provider && d.to.length === 1)).toBe(true);
    // Recipients are the original senders, computed by code.
    const contacts = new Set(DEFAULT_FIXTURE.threads.map((t) => t.contact.email));
    expect(drafts.every((d) => contacts.has(d.to[0]!))).toBe(true);
    expect(drafts.some((d) => d.to[0] === "julie.martin@orange.example" && d.subject.startsWith(provider === "gmail" ? "Re:" : "RE:"))).toBe(true);
    // The injection mail is drafted to its sender only, and flagged.
    const injected = [...memory.rows.values()].find((r) => (r.flags ?? []).some((f) => f.startsWith("injection_suspected")));
    expect(injected?.status).toBe("drafted");
    expect(drafts.find((d) => d.threadKey === "injection")?.to).toEqual(["l.bernard@mail-pro.example"]);
    // Relayed site form: never drafted, flagged for review.
    expect(drafts.some((d) => d.threadKey === "site-formulaire")).toBe(false);
    expect(drafts.some((d) => d.threadKey === "allennes-visite")).toBe(false);

    // Re-running the same batch creates nothing new (ledger + stored state).
    const again = await runBatch(provider, accountId, "scoped_autonomy", memory);
    expect(again.stats.drafted).toBe(0);
    expect(store.read().drafts).toHaveLength(drafts.length);
  });

  it("test mode never writes to the mailbox: simulated receipts only", async () => {
    const accountId = await connect(provider);
    const { stats, memory } = await runBatch(provider, accountId, "test");
    expect(stats.drafted).toBeGreaterThan(0);
    expect(store.read().drafts).toHaveLength(0);
    expect([...memory.rows.values()].filter((r) => r.receipt).every((r) => r.receipt!.simulated)).toBe(true);
  });
});

describe("company sheet and follow-ups material", () => {
  it("sent mail is readable for extraction and carries the business facts", async () => {
    const accountId = await connect("gmail");
    const mailbox = mailboxClient("gmail", { ...ids, connectedAccountId: accountId }, { mode: "test" });
    const inputs: string[] = [];
    const model: BrainModel = {
      extract: vi.fn(async (input) => {
        inputs.push(JSON.stringify(input));
        return { output: { facts: [] }, usage: { inputTokens: 1, outputTokens: 1 } };
      }),
      explainEdit: vi.fn(),
    };
    const rows = new Map<string, "pending" | "processed" | "skipped">();
    const stats = await processExtraction({
      job: { windowDays: 90, maxMessages: 200 },
      mailbox,
      model,
      cents: 1,
      store: {
        upsertSent: async (m) => {
          if (!rows.has(m.id)) rows.set(m.id, "pending");
          return { rowId: m.id, status: rows.get(m.id)! };
        },
        markSent: async (list, status) => {
          for (const id of list) rows.set(id, status);
        },
        reserve: async () => "usage",
        addUsage: async () => {},
        saveCandidates: async (c) => ({ inserted: c.length, merged: 0, skipped: 0 }),
        heartbeat: async () => true,
      },
    });
    expect(stats.listed).toBeGreaterThanOrEqual(40);
    expect(stats.processed).toBeGreaterThanOrEqual(30);
    const all = inputs.join("\n");
    for (const fact of ["26 € HT/m²", "30 %", "Allennes-les-Marais", "d'avril à octobre", "Belgique"])
      expect(all).toContain(fact);
  });

  it("quotes sent without reply are due for a follow-up", async () => {
    const accountId = await connect("outlook");
    const mailbox = mailboxClient("outlook", { ...ids, connectedAccountId: accountId }, { mode: "test" });
    const inbound = await mailbox.listInbound({ windowDays: 14, maxMessages: 50 });
    const due: string[] = [];
    for (const key of ["lille-t3", "haubourdin-facade", "tournai-couloir2", "seclin-dimensions", "annoeullin-question"]) {
      const thread = DEFAULT_FIXTURE.threads.find((t) => t.key === key)!;
      const first = inbound.find((m) => m.from?.address === thread.contact.email)!;
      const messages = await mailbox.readThread(first.threadId);
      const obs = observeThread(messages, thread.contact.email, null);
      const decision = decideFollowup(
        obs,
        { status: "repondu", followupsDismissed: false, snoozedUntil: null, contactEmail: thread.contact.email, businessDays: 5, maxStages: 2, enabled: true, existing: [] },
        new Date(),
      );
      if (decision.action === "propose") due.push(key);
      // The owner's last message is recognised by code (no model call needed).
      expect(classifyOwnerMessage(obs.lastOwner!.text)).not.toBe("ambiguous");
    }
    // Quotes sent 8-12 days ago with no reply are due; the answered quote is not.
    expect(due).toEqual(expect.arrayContaining(["lille-t3", "haubourdin-facade", "seclin-dimensions"]));
    expect(due).not.toContain("annoeullin-question");
  });
});
