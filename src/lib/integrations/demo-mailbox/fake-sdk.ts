import {
  DEMO_AUTH_CONFIGS,
  DEMO_CONSENT_PATH,
  demoMailboxEnabled,
} from "./guard";
import {
  demoStore,
  gmailMessageId,
  gmailThreadId,
  newId,
  outlookConversationId,
  outlookMessageId,
  type DemoAccount,
  type DemoDraft,
  type DemoMessage,
  type DemoProvider,
  type DemoState,
  type DemoStore,
} from "./store";

/*
 * In-process stand-in for the subset of the Composio SDK Orbis uses:
 *   authConfigs.get, connectedAccounts.list/link/get/delete,
 *   tools.getRawComposioToolBySlug, tools.execute.
 * It sits BELOW the mailbox broker: mailbox.ts still builds arguments, checks
 * the allowlist and FORBIDDEN_SLUG, verifies the account and pins the version
 * before anything reaches this object. Responses follow the shapes the
 * normalizers parse (Gmail `messages[]` with messageId/threadId/labelIds/
 * messageText/payload.headers; Graph `value[]` messages).
 *
 * Defense in depth: this fake keeps its own closed list of tools and rejects
 * everything else, including every sending tool, even if the broker were
 * bypassed.
 */
export const DEMO_TOOLS = Object.freeze({
  GMAIL_FETCH_EMAILS: "gmail",
  GMAIL_FETCH_MESSAGE_BY_THREAD_ID: "gmail",
  GMAIL_LIST_DRAFTS: "gmail",
  GMAIL_CREATE_EMAIL_DRAFT: "gmail",
  OUTLOOK_LIST_MESSAGES: "outlook",
  OUTLOOK_CREATE_DRAFT_REPLY: "outlook",
} as const satisfies Record<string, DemoProvider>);
type DemoTool = keyof typeof DEMO_TOOLS;
const isDemoTool = (slug: string): slug is DemoTool =>
  Object.hasOwn(DEMO_TOOLS, slug);

class DemoSdkError extends Error {}
const providerOfConfig = (id: string): DemoProvider | undefined =>
  id === DEMO_AUTH_CONFIGS.gmail
    ? "gmail"
    : id === DEMO_AUTH_CONFIGS.outlook
      ? "outlook"
      : undefined;

function accountView(a: DemoAccount) {
  return {
    id: a.id,
    status: a.status,
    isDisabled: false,
    statusReason: null,
    toolkit: { slug: a.provider },
    authConfig: {
      id: a.authConfigId,
      isComposioManaged: false,
      isDisabled: false,
    },
    data: {},
    params: {},
    testRequestEndpoint: "",
    createdAt: a.createdAt,
    updatedAt: a.createdAt,
  };
}

// ------------------------------------------------------------------ Gmail shapes
const fmt = (p: { name: string; email: string }) => `${p.name} <${p.email}>`;
function gmailLabels(m: DemoMessage) {
  return m.direction === "out"
    ? ["SENT"]
    : [
        "INBOX",
        "UNREAD",
        ...(m.labels.some((l) => l.startsWith("CATEGORY_"))
          ? m.labels
          : ["CATEGORY_PERSONAL", ...m.labels]),
      ];
}
function gmailMessage(m: DemoMessage) {
  const to = m.to.map(fmt).join(", ");
  const headers = [
    { name: "From", value: fmt(m.from) },
    { name: "To", value: to },
    { name: "Subject", value: m.subject },
    { name: "Date", value: new Date(m.at).toUTCString() },
    ...(m.replyTo ? [{ name: "Reply-To", value: m.replyTo }] : []),
    ...Object.entries(m.headers).map(([name, value]) => ({ name, value })),
  ];
  return {
    messageId: gmailMessageId(m.key),
    threadId: gmailThreadId(m.threadKey),
    messageTimestamp: m.at,
    labelIds: gmailLabels(m),
    sender: fmt(m.from),
    to,
    subject: m.subject,
    messageText: m.text,
    preview: { subject: m.subject, body: m.text.slice(0, 200) },
    attachmentList: [],
    payload: {
      mimeType: "text/plain",
      headers,
      body: {
        data: Buffer.from(m.text, "utf8").toString("base64url"),
        size: Buffer.byteLength(m.text),
      },
    },
  };
}
function gmailDraftMessage(d: DemoDraft, state: DemoState) {
  const to = d.to.join(", ");
  return {
    messageId: d.messageKey,
    threadId: gmailThreadId(d.threadKey),
    messageTimestamp: d.createdAt,
    labelIds: ["DRAFT"],
    sender: fmt(state.owner),
    to,
    subject: d.subject,
    messageText: d.body,
    preview: { subject: d.subject, body: d.body.slice(0, 200) },
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: fmt(state.owner) },
        { name: "To", value: to },
        { name: "Subject", value: d.subject },
      ],
    },
  };
}
/** Subset of Gmail search used by buildArguments(): in:, -in:, newer_than:Nd, after:epoch. */
function gmailSearch(state: DemoState, query: string, max: number) {
  const tokens = query.trim().split(/\s+/);
  const has = (t: string) => tokens.includes(t);
  const newer = tokens
    .find((t) => t.startsWith("newer_than:"))
    ?.match(/^newer_than:(\d+)d$/);
  const after = tokens
    .find((t) => t.startsWith("after:"))
    ?.match(/^after:(\d+)$/);
  const since = newer
    ? Date.now() - Number(newer[1]) * 86_400_000
    : after
      ? Number(after[1]) * 1000
      : 0;
  const unknown = tokens.filter(
    (t) =>
      !/^(-?in:(inbox|sent|chats|drafts)|newer_than:\d+d|after:\d+)$/.test(t),
  );
  if (unknown.length)
    throw new DemoSdkError(
      `Unsupported demo Gmail query: ${unknown.join(" ")}`,
    );
  return state.messages
    .filter((m) =>
      has("in:sent")
        ? m.direction === "out"
        : has("in:inbox")
          ? m.direction === "in"
          : true,
    )
    .filter((m) => Date.parse(m.at) >= since)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, max)
    .map(gmailMessage);
}

// ---------------------------------------------------------------- Outlook shapes
const graphAddress = (email: string, name?: string) => ({
  emailAddress: { address: email, name: name ?? email },
});
function outlookMessage(m: DemoMessage) {
  return {
    id: outlookMessageId(m.key),
    conversationId: outlookConversationId(m.threadKey),
    subject: m.subject,
    from: graphAddress(m.from.email, m.from.name),
    sender: graphAddress(m.from.email, m.from.name),
    replyTo: m.replyTo ? [graphAddress(m.replyTo)] : [],
    toRecipients: m.to.map((t) => graphAddress(t.email, t.name)),
    receivedDateTime: m.at,
    sentDateTime: m.at,
    body: { contentType: "text", content: m.text },
    bodyPreview: m.text.slice(0, 255),
    internetMessageHeaders: Object.entries(m.headers).map(([name, value]) => ({
      name,
      value,
    })),
    categories: [],
    isDraft: false,
    inferenceClassification: m.labels.some((l) =>
      /PROMOTIONS|UPDATES|SOCIAL/.test(l),
    )
      ? "other"
      : "focused",
    parentFolderId: m.direction === "out" ? "sentitems" : "inbox",
  };
}
function outlookDraft(d: DemoDraft, state: DemoState) {
  return {
    id: d.messageKey,
    conversationId: outlookConversationId(d.threadKey),
    subject: d.subject,
    from: graphAddress(state.owner.email, state.owner.name),
    sender: graphAddress(state.owner.email, state.owner.name),
    replyTo: [],
    toRecipients: d.to.map((t) => graphAddress(t)),
    createdDateTime: d.createdAt,
    receivedDateTime: d.createdAt,
    sentDateTime: null,
    body: { contentType: "text", content: d.body },
    bodyPreview: d.body.slice(0, 255),
    internetMessageHeaders: [],
    categories: [],
    isDraft: true,
    parentFolderId: "drafts",
  };
}
function outlookList(
  state: DemoState,
  args: Record<string, unknown>,
  provider: DemoProvider,
) {
  const folder = String(args.folder ?? "inbox");
  const top = Math.min(Number(args.top ?? 10) || 10, 1000);
  const filter = typeof args.filter === "string" ? args.filter : "";
  const conversation = filter.match(/^conversationId eq '((?:[^']|'')*)'$/);
  if (filter && !conversation)
    throw new DemoSdkError(`Unsupported demo Outlook filter: ${filter}`);
  const conversationId = conversation?.[1]?.replaceAll("''", "'");
  const receivedGe =
    typeof args.received_date_time_ge === "string"
      ? Date.parse(args.received_date_time_ge)
      : 0;
  const sentGt =
    typeof args.sent_date_time_gt === "string"
      ? Date.parse(args.sent_date_time_gt)
      : 0;
  const messages =
    folder === "drafts"
      ? []
      : state.messages.filter((m) =>
          folder === "inbox"
            ? m.direction === "in"
            : folder === "sentitems"
              ? m.direction === "out"
              : folder === "allfolders",
        );
  const drafts =
    folder === "drafts" || folder === "allfolders"
      ? state.drafts
          .filter((d) => d.provider === provider)
          .map((d) => outlookDraft(d, state))
      : [];
  const value = [
    ...messages
      .filter(
        (m) =>
          (!receivedGe || Date.parse(m.at) >= receivedGe) &&
          (!sentGt || Date.parse(m.at) > sentGt),
      )
      .map(outlookMessage),
    ...drafts,
  ]
    .filter((m) => !conversationId || m.conversationId === conversationId)
    .sort((a, b) =>
      String(b.receivedDateTime).localeCompare(String(a.receivedDateTime)),
    )
    .slice(0, top);
  return {
    "@odata.context":
      "https://graph.microsoft.com/v1.0/$metadata#users('me')/messages",
    value,
  };
}

// ------------------------------------------------------------------- tool runner
const STRICT_ARGS: Record<DemoTool, readonly string[]> = {
  GMAIL_FETCH_EMAILS: [
    "user_id",
    "query",
    "max_results",
    "verbose",
    "include_payload",
    "include_spam_trash",
  ],
  GMAIL_FETCH_MESSAGE_BY_THREAD_ID: ["user_id", "thread_id"],
  GMAIL_LIST_DRAFTS: ["user_id", "verbose", "max_results"],
  GMAIL_CREATE_EMAIL_DRAFT: [
    "user_id",
    "thread_id",
    "recipient_email",
    "body",
    "is_html",
  ],
  OUTLOOK_LIST_MESSAGES: [
    "user_id",
    "folder",
    "top",
    "received_date_time_ge",
    "sent_date_time_gt",
    "filter",
    "select",
  ],
  OUTLOOK_CREATE_DRAFT_REPLY: ["user_id", "message_id", "comment"],
};
const replySubject = (subject: string, prefix: string) =>
  /^(re|tr|fw|fwd)\s*:/i.test(subject) ? subject : `${prefix}: ${subject}`;

function runTool(
  store: DemoStore,
  slug: DemoTool,
  account: DemoAccount,
  args: Record<string, unknown>,
) {
  const unexpected = Object.keys(args).filter(
    (k) => !STRICT_ARGS[slug].includes(k),
  );
  if (unexpected.length)
    throw new DemoSdkError(
      `Unexpected arguments for ${slug}: ${unexpected.join(", ")}`,
    );
  if (args.user_id !== "me")
    throw new DemoSdkError(
      "Demo tools only act on the connected mailbox (user_id=me).",
    );
  switch (slug) {
    case "GMAIL_FETCH_EMAILS": {
      const state = store.read();
      const messages = gmailSearch(
        state,
        String(args.query ?? ""),
        Math.min(Number(args.max_results ?? 10) || 10, 500),
      );
      return {
        messages,
        nextPageToken: null,
        resultSizeEstimate: messages.length,
      };
    }
    case "GMAIL_FETCH_MESSAGE_BY_THREAD_ID": {
      const state = store.read();
      const threadId = String(args.thread_id ?? "");
      const messages = [
        ...state.messages
          .filter((m) => gmailThreadId(m.threadKey) === threadId)
          .map(gmailMessage),
        ...state.drafts
          .filter(
            (d) =>
              d.provider === "gmail" && gmailThreadId(d.threadKey) === threadId,
          )
          .map((d) => gmailDraftMessage(d, state)),
      ].sort((a, b) => a.messageTimestamp.localeCompare(b.messageTimestamp));
      return { messages };
    }
    case "GMAIL_LIST_DRAFTS": {
      const state = store.read();
      const drafts = state.drafts
        .filter((d) => d.provider === "gmail")
        .slice(-Math.min(Number(args.max_results ?? 100) || 100, 500))
        .reverse()
        .map((d) => ({
          id: d.id,
          message: {
            id: d.messageKey,
            threadId: gmailThreadId(d.threadKey),
            labelIds: ["DRAFT"],
          },
        }));
      return { drafts, nextPageToken: null };
    }
    case "GMAIL_CREATE_EMAIL_DRAFT":
      return store.update((state) => {
        const threadId = String(args.thread_id ?? "");
        const thread = state.messages.filter(
          (m) => gmailThreadId(m.threadKey) === threadId,
        );
        if (!thread.length)
          throw new DemoSdkError("Thread not found in the demo mailbox.");
        const recipient = String(args.recipient_email ?? "")
          .trim()
          .toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
          throw new DemoSdkError("Invalid recipient.");
        const draft: DemoDraft = {
          id: newId("r-"),
          messageKey: gmailMessageId(`draft:${newId("")}`),
          provider: "gmail",
          accountId: account.id,
          threadKey: thread[0]!.threadKey,
          to: [recipient],
          // Empty subject keeps the draft in the thread, like the real tool.
          subject: replySubject(thread[0]!.subject, "Re"),
          body: String(args.body ?? ""),
          createdAt: new Date().toISOString(),
        };
        state.drafts.push(draft);
        return {
          id: draft.id,
          message: { id: draft.messageKey, threadId, labelIds: ["DRAFT"] },
        };
      });
    case "OUTLOOK_LIST_MESSAGES":
      return outlookList(store.read(), args, "outlook");
    case "OUTLOOK_CREATE_DRAFT_REPLY":
      return store.update((state) => {
        const messageId = String(args.message_id ?? "");
        const original = state.messages.find(
          (m) => outlookMessageId(m.key) === messageId,
        );
        if (!original)
          throw new DemoSdkError("Message not found in the demo mailbox.");
        // Graph createReply: Reply-To wins over From when the original sets it.
        const to = original.replyTo
          ? [original.replyTo.toLowerCase()]
          : [original.from.email.toLowerCase()];
        const draft: DemoDraft = {
          id: "",
          messageKey: outlookMessageId(`draft:${newId("")}`),
          provider: "outlook",
          accountId: account.id,
          threadKey: original.threadKey,
          inReplyTo: original.key,
          to,
          subject: replySubject(original.subject, "RE"),
          body: String(args.comment ?? ""),
          createdAt: new Date().toISOString(),
        };
        draft.id = draft.messageKey;
        state.drafts.push(draft);
        return outlookDraft(draft, state);
      });
  }
}

/** Builds the fake. `store` defaults to the shared file store (or the test override). */
export function createDemoComposio(store: DemoStore = demoStore()) {
  // Fail closed again at construction: never hand out the fake on production.
  if (!demoMailboxEnabled())
    throw new DemoSdkError("Demo mailbox is not enabled.");
  const activeAccount = (
    id: string,
    userId: string,
    provider: DemoProvider,
  ) => {
    const account = store.read().accounts.find((a) => a.id === id);
    if (
      !account ||
      account.status !== "ACTIVE" ||
      account.userId !== userId ||
      account.provider !== provider
    )
      return undefined;
    return account;
  };
  return {
    authConfigs: {
      async get(id: string) {
        const provider = providerOfConfig(id);
        if (!provider) throw new DemoSdkError("Auth config not found.");
        return {
          id,
          name: `Demo ${provider}`,
          status: "ENABLED",
          toolkit: { slug: provider },
          isComposioManaged: false,
        };
      },
    },
    connectedAccounts: {
      async list(
        query: {
          userIds?: string[];
          authConfigIds?: string[];
          toolkitSlugs?: string[];
          statuses?: string[];
          accountType?: string;
          cursor?: string;
          limit?: number;
        } = {},
      ) {
        const items = store
          .read()
          .accounts.filter(
            (a) =>
              (!query.userIds || query.userIds.includes(a.userId)) &&
              (!query.authConfigIds ||
                query.authConfigIds.includes(a.authConfigId)) &&
              (!query.toolkitSlugs ||
                query.toolkitSlugs.includes(a.provider)) &&
              (!query.statuses || query.statuses.includes(a.status)),
          )
          .slice(0, query.limit ?? 100)
          .map(accountView);
        return { items, nextCursor: null, totalPages: 1 };
      },
      async get(id: string) {
        const account = store.read().accounts.find((a) => a.id === id);
        if (!account) throw new DemoSdkError("Connected account not found.");
        return accountView(account);
      },
      async link(
        userId: string,
        authConfigId: string,
        options: { callbackUrl?: string } = {},
      ) {
        const provider = providerOfConfig(authConfigId);
        if (!provider) throw new DemoSdkError("Auth config not found.");
        let callback: URL;
        try {
          callback = new URL(options.callbackUrl ?? "");
        } catch {
          throw new DemoSdkError("A callback URL is required.");
        }
        if (
          !/^https?:$/.test(callback.protocol) ||
          callback.username ||
          callback.password
        )
          throw new DemoSdkError("Invalid callback URL.");
        const account: DemoAccount = {
          id: newId("ca_demo_"),
          userId,
          provider,
          authConfigId,
          status: "INITIATED",
          callbackUrl: callback.href,
          createdAt: new Date().toISOString(),
        };
        store.update((state) => {
          // One pending consent per user/provider; older pending links are dropped.
          state.accounts = state.accounts.filter(
            (a) =>
              !(
                a.userId === userId &&
                a.provider === provider &&
                a.status === "INITIATED"
              ),
          );
          state.accounts.push(account);
        });
        const redirect = new URL(DEMO_CONSENT_PATH, callback.origin);
        redirect.searchParams.set("account", account.id);
        return {
          id: account.id,
          status: account.status,
          redirectUrl: redirect.href,
        };
      },
      async delete(id: string) {
        store.update((state) => {
          state.accounts = state.accounts.filter((a) => a.id !== id);
        });
        return { success: true };
      },
    },
    tools: {
      async getRawComposioToolBySlug(
        slug: string,
        options: { version?: string } = {},
      ) {
        if (!isDemoTool(slug))
          throw new DemoSdkError(
            `Tool ${slug} is not available in the demo mailbox.`,
          );
        return {
          slug,
          name: slug,
          toolkit: { slug: DEMO_TOOLS[slug], name: DEMO_TOOLS[slug] },
          version: options.version,
          inputParameters: { type: "object", properties: {} },
        };
      },
      async execute(
        slug: string,
        body: {
          userId?: string;
          connectedAccountId?: string;
          arguments?: Record<string, unknown>;
        },
      ) {
        if (!isDemoTool(slug))
          throw new DemoSdkError(
            `Tool ${slug} is not available in the demo mailbox.`,
          );
        const account = activeAccount(
          body.connectedAccountId ?? "",
          body.userId ?? "",
          DEMO_TOOLS[slug],
        );
        if (!account)
          return {
            data: {},
            error: "No active demo account for this user and toolkit.",
            successful: false,
          };
        try {
          return {
            data: runTool(store, slug, account, body.arguments ?? {}),
            error: null,
            successful: true,
          };
        } catch (error) {
          if (!(error instanceof DemoSdkError)) throw error;
          return { data: {}, error: error.message, successful: false };
        }
      },
    },
  };
}
export type DemoComposio = ReturnType<typeof createDemoComposio>;

/** Consent page action: activates a pending account owned by `userId`. */
export function resolveDemoConsent(
  input: {
    accountId: string;
    userId: string;
    approve: boolean;
    origin: string;
  },
  store: DemoStore = demoStore(),
) {
  if (!demoMailboxEnabled())
    throw new DemoSdkError("Demo mailbox is not enabled.");
  return store.update((state) => {
    const account = state.accounts.find((a) => a.id === input.accountId);
    if (
      !account ||
      account.userId !== input.userId ||
      account.status !== "INITIATED"
    )
      return null;
    // Return only to this app (no open redirect through the demo consent page).
    if (new URL(account.callbackUrl).origin !== input.origin) return null;
    if (input.approve) {
      account.status = "ACTIVE";
      // Reconnecting the same provider replaces the previous demo account.
      state.accounts = state.accounts.filter(
        (a) =>
          a.id === account.id ||
          !(a.userId === account.userId && a.provider === account.provider),
      );
    } else state.accounts = state.accounts.filter((a) => a.id !== account.id);
    return {
      callbackUrl: account.callbackUrl,
      provider: account.provider,
      status: input.approve ? "ACTIVE" : "DENIED",
    };
  });
}
