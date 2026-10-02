import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  list: vi.fn(),
  auth: vi.fn(),
  schema: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@composio/core", () => ({
  Composio: class {
    connectedAccounts = { list: sdk.list };
    authConfigs = { get: sdk.auth };
    tools = { getRawComposioToolBySlug: sdk.schema, execute: sdk.execute };
  },
}));
import {
  assertMailboxPolicy,
  buildArguments,
  mailboxClient,
  MAILBOX_TOOLS,
  MailboxPolicyError,
  MailboxUncertainError,
  RECONCILE_RETRY_AFTER_MS,
  workspaceMailboxAccounts,
  type DraftLedger,
  type DraftReceipt,
  type MailboxProvider,
} from "./mailbox";
import { integrationUser } from "./composio";

export function memoryLedger() {
  const rows = new Map<
    string,
    {
      state: "claimed" | "uncertain" | "done";
      claimedAt: Date;
      attempts: number;
      receipt?: DraftReceipt;
    }
  >();
  const ledger: DraftLedger = {
    async claim(key) {
      const row = rows.get(key);
      if (!row) {
        rows.set(key, { state: "claimed", claimedAt: new Date(), attempts: 1 });
        return { state: "claimed" };
      }
      if (row.state === "done") return { state: "done", receipt: row.receipt! };
      return {
        state: "uncertain",
        claimedAt: row.claimedAt,
        attempts: row.attempts,
      };
    },
    async retry(key) {
      const row = rows.get(key)!;
      row.state = "claimed";
      row.attempts++;
      row.claimedAt = new Date();
      return true;
    },
    async record(key, receipt) {
      rows.set(key, { ...rows.get(key)!, state: "done", receipt });
    },
    async markUncertain(key) {
      rows.get(key)!.state = "uncertain";
    },
  };
  return { ledger, rows };
}
const identity = {
  tenantId: "tenant",
  workspaceId: "workspace",
  connectedAccountId: "account",
};
function account(slug: MailboxProvider, overrides = {}) {
  return {
    id: "account",
    status: "ACTIVE",
    isDisabled: false,
    authConfig: { id: `config-${slug}`, isDisabled: false },
    toolkit: { slug },
    ...overrides,
  };
}
function setup(provider: MailboxProvider) {
  sdk.auth.mockResolvedValue({
    status: "ENABLED",
    toolkit: { slug: provider },
  });
  sdk.list.mockResolvedValue({ items: [account(provider)] });
  sdk.schema.mockImplementation(async (slug: string) => ({
    slug,
    toolkit: { slug: provider },
    version: "20260915_00",
  }));
}
const draftRequest = {
  idempotencyKey: "key-1",
  threadId: "thread1",
  messageId: "msg1",
  recipient: "client@example.com",
  body: "Bonjour, merci pour votre demande.",
};
const executedSlugs = () => sdk.execute.mock.calls.map((c) => c[0] as string);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("COMPOSIO_API_KEY", "fixture-key");
  for (const p of ["GMAIL", "OUTLOOK"]) {
    vi.stubEnv(`COMPOSIO_AUTH_CONFIG_${p}`, `config-${p.toLowerCase()}`);
    vi.stubEnv(`COMPOSIO_TOOLKIT_${p}`, p.toLowerCase());
    vi.stubEnv(`COMPOSIO_TOOL_VERSION_${p}`, "20260915_00");
  }
  setup("gmail");
});
afterEach(() => {
  // Global no-send guarantee: no test in this file ever reaches a sending tool.
  for (const slug of executedSlugs())
    expect(slug).not.toMatch(/SEND|FORWARD|REPLY_TO_THREAD|REPLY_ALL/);
  vi.unstubAllEnvs();
});

describe("mailbox policy", () => {
  it.each([
    ["gmail", "create_reply_draft", "GMAIL_SEND_EMAIL"],
    ["gmail", "create_reply_draft", "GMAIL_SEND_DRAFT"],
    ["gmail", "create_reply_draft", "GMAIL_REPLY_TO_THREAD"],
    ["gmail", "list_inbound", "GMAIL_FORWARD_MESSAGE"],
    ["outlook", "create_reply_draft", "OUTLOOK_SEND_DRAFT"],
    ["outlook", "create_reply_draft", "OUTLOOK_SEND_REPLY"],
    ["outlook", "create_reply_draft", "OUTLOOK_CREATE_FORWARD_DRAFT"],
    ["outlook", "create_reply_draft", "OUTLOOK_CREATE_REPLY_ALL_DRAFT"],
  ] as const)("refuses %s %s via %s", (provider, op, slug) => {
    expect(() => assertMailboxPolicy(provider, op, slug)).toThrow(
      MailboxPolicyError,
    );
  });
  it("refuses unknown operations and has no sending tool in the frozen map", () => {
    expect(() =>
      assertMailboxPolicy("gmail", "send" as never, "GMAIL_SEND_EMAIL"),
    ).toThrow(MailboxPolicyError);
    expect(Object.isFrozen(MAILBOX_TOOLS)).toBe(true);
    expect(Object.isFrozen(MAILBOX_TOOLS.gmail)).toBe(true);
    for (const ops of Object.values(MAILBOX_TOOLS))
      for (const slug of Object.values(ops))
        expect(slug).not.toMatch(/SEND|FORWARD|REPLY_ALL|DELETE|TRASH/);
  });
  it("draft arguments are strict: no cc, bcc or extra recipients can be injected", () => {
    expect(() =>
      buildArguments("gmail", "create_reply_draft", {
        ...draftRequest,
        idempotencyKey: undefined,
        cc: ["x@evil.test"],
      }),
    ).toThrow();
    expect(() =>
      buildArguments("gmail", "create_reply_draft", {
        threadId: "t",
        messageId: "m",
        recipient: "not an email",
        body: "x",
      }),
    ).toThrow();
  });
});

describe("Composio argument shapes (docs.composio.dev/toolkits/gmail|outlook)", () => {
  const now = new Date("2026-10-02T00:00:00Z");
  it("gmail", () => {
    expect(
      buildArguments("gmail", "list_inbound", {
        windowDays: 14,
        maxMessages: 50,
        now,
      }),
    ).toEqual({
      user_id: "me",
      query: "in:inbox -in:chats -in:sent -in:drafts newer_than:14d",
      max_results: 50,
      verbose: true,
      include_payload: true,
      include_spam_trash: false,
    });
    expect(buildArguments("gmail", "read_thread", { threadId: "t1" })).toEqual({
      user_id: "me",
      thread_id: "t1",
    });
    expect(
      buildArguments("gmail", "create_reply_draft", {
        threadId: "t1",
        messageId: "m1",
        recipient: "Client@Example.com",
        body: "Hello",
      }),
    ).toEqual({
      user_id: "me",
      thread_id: "t1",
      recipient_email: "client@example.com",
      body: "Hello",
      is_html: false,
    });
    expect(() =>
      buildArguments("gmail", "list_inbound", {
        windowDays: 14,
        maxMessages: 500,
      }),
    ).toThrow();
  });
  it("outlook", () => {
    const list = buildArguments("outlook", "list_inbound", {
      windowDays: 14,
      maxMessages: 50,
      now,
    });
    expect(list).toMatchObject({
      user_id: "me",
      folder: "inbox",
      top: 50,
      received_date_time_ge: "2026-09-18T00:00:00.000Z",
    });
    expect(
      buildArguments("outlook", "read_thread", { threadId: "AAQkx=" }),
    ).toMatchObject({
      folder: "allfolders",
      filter: "conversationId eq 'AAQkx='",
    });
    // Provider ids are charset-restricted, so OData filter injection is refused.
    expect(() =>
      buildArguments("outlook", "read_thread", {
        threadId: "x' or isRead eq true or 'a",
      }),
    ).toThrow();
    expect(
      buildArguments("outlook", "create_reply_draft", {
        threadId: "c1",
        messageId: "AAMk1=",
        recipient: "client@example.com",
        body: "Hello",
      }),
    ).toEqual({ user_id: "me", message_id: "AAMk1=", comment: "Hello" });
  });
});

describe("mailbox client", () => {
  it("lists and normalizes recent inbound Gmail mail with a tenant-bound private account", async () => {
    sdk.execute.mockResolvedValue({
      successful: true,
      data: {
        messages: [
          {
            messageId: "m1",
            threadId: "t1",
            sender: "Alice <alice@client.test>",
            subject: "Devis",
            messageText: "Bonjour, pouvez-vous me faire un devis ?",
            labelIds: ["INBOX"],
            messageTimestamp: "2026-10-01T10:00:00Z",
          },
        ],
      },
    });
    const client = mailboxClient("gmail", identity, {
      mode: "scoped_autonomy",
    });
    const messages = await client.listInbound({
      windowDays: 14,
      maxMessages: 50,
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: "m1",
      threadId: "t1",
      from: { address: "alice@client.test", name: "Alice" },
      subject: "Devis",
    });
    expect(sdk.list.mock.calls[0][0]).toMatchObject({
      userIds: [integrationUser("tenant", "workspace")],
      accountType: "PRIVATE",
    });
    expect(sdk.execute.mock.calls[0][0]).toBe("GMAIL_FETCH_EMAILS");
    expect(sdk.execute.mock.calls[0][1]).toMatchObject({
      userId: integrationUser("tenant", "workspace"),
      connectedAccountId: "account",
      version: "20260915_00",
      allowTracing: false,
    });
  });
  it("refuses a foreign or disabled account and an unpinned version", async () => {
    sdk.list.mockResolvedValue({
      items: [account("gmail", { isDisabled: true })],
    });
    await expect(
      mailboxClient("gmail", identity, { mode: "scoped_autonomy" }).listInbound(
        {
          windowDays: 14,
          maxMessages: 10,
        },
      ),
    ).rejects.toThrow(MailboxPolicyError);
    expect(sdk.execute).not.toHaveBeenCalled();
    vi.stubEnv("COMPOSIO_TOOL_VERSION_GMAIL", "latest");
    vi.stubEnv("COMPOSIO_TOOL_VERSION", "");
    expect(() => mailboxClient("gmail", identity)).toThrow("pinned");
  });
  it("creates exactly one Gmail draft per idempotency key and records the receipt", async () => {
    sdk.execute.mockResolvedValue({
      successful: true,
      data: { id: "r-draft-1", message: { id: "m9", threadId: "thread1" } },
    });
    const { ledger, rows } = memoryLedger();
    const client = mailboxClient("gmail", identity, {
      mode: "scoped_autonomy",
    });
    const first = await client.createReplyDraft(draftRequest, ledger);
    const second = await client.createReplyDraft(draftRequest, ledger);
    expect(first).toMatchObject({ draftId: "r-draft-1", created: true });
    expect(second).toMatchObject({ draftId: "r-draft-1", created: false });
    expect(executedSlugs()).toEqual(["GMAIL_CREATE_EMAIL_DRAFT"]);
    expect(sdk.execute.mock.calls[0][1].arguments).toEqual({
      user_id: "me",
      thread_id: "thread1",
      recipient_email: "client@example.com",
      body: draftRequest.body,
      is_html: false,
    });
    expect(rows.get("key-1")?.receipt?.draftId).toBe("r-draft-1");
  });
  it("test mode never calls the provider to create a draft", async () => {
    const { ledger } = memoryLedger();
    const receipt = await mailboxClient("gmail", identity, {
      mode: "test",
    }).createReplyDraft(draftRequest, ledger);
    expect(receipt.simulated).toBe(true);
    expect(sdk.execute).not.toHaveBeenCalled();
  });
  it("on timeout marks the attempt uncertain and reconciles by listing drafts before any retry", async () => {
    const { ledger, rows } = memoryLedger();
    const client = mailboxClient("gmail", identity, {
      mode: "scoped_autonomy",
    });
    sdk.execute.mockRejectedValueOnce(new Error("timeout with SECRET token"));
    await expect(client.createReplyDraft(draftRequest, ledger)).rejects.toThrow(
      MailboxUncertainError,
    );
    expect(rows.get("key-1")?.state).toBe("uncertain");
    // Reconciliation finds the draft that the timed-out call actually created.
    sdk.execute.mockResolvedValueOnce({
      successful: true,
      data: {
        drafts: [
          { id: "other", message: { threadId: "elsewhere" } },
          { id: "r-draft-7", message: { threadId: "thread1" } },
        ],
      },
    });
    const receipt = await client.createReplyDraft(draftRequest, ledger);
    expect(receipt).toMatchObject({
      draftId: "r-draft-7",
      reconciled: true,
      created: false,
    });
    expect(executedSlugs()).toEqual([
      "GMAIL_CREATE_EMAIL_DRAFT",
      "GMAIL_LIST_DRAFTS",
    ]);
  });
  it("does not retry a recent uncertain attempt when reconciliation finds nothing; retries after the window", async () => {
    const { ledger, rows } = memoryLedger();
    const client = mailboxClient("gmail", identity, {
      mode: "scoped_autonomy",
    });
    sdk.execute.mockResolvedValueOnce({ successful: false, error: "boom" });
    await expect(client.createReplyDraft(draftRequest, ledger)).rejects.toThrow(
      MailboxUncertainError,
    );
    sdk.execute.mockResolvedValue({ successful: true, data: { drafts: [] } });
    await expect(client.createReplyDraft(draftRequest, ledger)).rejects.toThrow(
      "unconfirmed",
    );
    expect(
      executedSlugs().filter((s) => s === "GMAIL_CREATE_EMAIL_DRAFT"),
    ).toHaveLength(1);
    rows.get("key-1")!.claimedAt = new Date(
      Date.now() - RECONCILE_RETRY_AFTER_MS - 1,
    );
    sdk.execute.mockImplementation(async (slug: string) =>
      slug === "GMAIL_LIST_DRAFTS"
        ? { successful: true, data: { drafts: [] } }
        : { successful: true, data: { id: "r-draft-2" } },
    );
    expect(await client.createReplyDraft(draftRequest, ledger)).toMatchObject({
      draftId: "r-draft-2",
      created: true,
    });
    expect(
      executedSlugs().filter((s) => s === "GMAIL_CREATE_EMAIL_DRAFT"),
    ).toHaveLength(2);
  });
  it("Outlook draft reply uses createReply (sender only) and reports returned recipients", async () => {
    setup("outlook");
    sdk.execute.mockResolvedValue({
      successful: true,
      data: {
        id: "AAMkDraft=",
        conversationId: "thread1",
        isDraft: true,
        toRecipients: [{ emailAddress: { address: "client@example.com" } }],
      },
    });
    const { ledger } = memoryLedger();
    const receipt = await mailboxClient("outlook", identity, {
      mode: "scoped_autonomy",
    }).createReplyDraft(draftRequest, ledger);
    expect(receipt).toMatchObject({
      draftId: "AAMkDraft=",
      recipients: ["client@example.com"],
    });
    expect(sdk.execute.mock.calls[0][0]).toBe("OUTLOOK_CREATE_DRAFT_REPLY");
    expect(sdk.execute.mock.calls[0][1].arguments).toEqual({
      user_id: "me",
      message_id: "msg1",
      comment: draftRequest.body,
    });
  });
  it("lists only active private workspace accounts", async () => {
    sdk.list.mockResolvedValue({
      items: [
        account("gmail"),
        account("gmail", { id: "off", status: "EXPIRED" }),
      ],
    });
    expect(
      await workspaceMailboxAccounts("gmail", "tenant", "workspace"),
    ).toEqual(["account"]);
  });
});
