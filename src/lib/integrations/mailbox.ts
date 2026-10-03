import { z } from "zod";
import type { Composio } from "@composio/core";
import {
  authConfigId,
  composioConfigured,
  integrationUser,
  toolkitSlug,
} from "./composio";
import { DEMO_TOOL_VERSIONS, demoMailboxEnabled } from "./demo-mailbox/guard";
import {
  canonical,
  hash,
  sdkClient,
  verifyPrivateAccount,
} from "./action-broker";
import {
  normalizeGmailMessages,
  normalizeOutlookMessages,
  parseData,
  type MailMessage,
} from "./mailbox-normalize";

/*
 * Mailbox path of the action broker: read inbound mail and create reply DRAFTS.
 * It can never send. Enforcement is layered and lives in code, not in prompts:
 *   1. The tool map below is a closed, code-reviewed constant. Slugs are not read
 *      from env and not chosen by a model or an API caller.
 *   2. assertMailboxPolicy() refuses any slug outside the allowlist and any slug
 *      matching a send/forward/delete/rule pattern, at import time and per call.
 *   3. Arguments are built by code from typed inputs and validated by strict zod
 *      schemas (no cc/bcc/extra recipients field exists). The reply recipient is
 *      computed from the original message, never from model output.
 *   4. OAuth scopes are read + compose only (see docs/product/inbox-drafts.md).
 *      Note: gmail.compose / Mail.ReadWrite technically allow sending a draft via
 *      the provider API, so (1)-(3) remain the effective no-send guarantee.
 *
 * Tool slugs and arguments verified against Composio docs (2026-10-02):
 *   https://docs.composio.dev/toolkits/gmail   (toolkit version 20260915_00)
 *   https://docs.composio.dev/toolkits/outlook (toolkit version 20260929_00)
 * Response shapes are parsed defensively; validate with a real account before
 * enabling (the docs type tool output only as `data`).
 */
export type MailboxProvider = "gmail" | "outlook";
export const mailboxProviders = ["gmail", "outlook"] as const;
export type MailboxOperation =
  | "list_inbound"
  | "list_sent"
  | "read_thread"
  | "list_thread_sent"
  | "list_drafts"
  | "create_reply_draft";
export const MAILBOX_TOOLS: Readonly<
  Record<MailboxProvider, Readonly<Record<MailboxOperation, string>>>
> = Object.freeze({
  gmail: Object.freeze({
    list_inbound: "GMAIL_FETCH_EMAILS",
    list_sent: "GMAIL_FETCH_EMAILS",
    read_thread: "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
    // Gmail thread messages carry the SENT label; no separate call needed.
    list_thread_sent: "GMAIL_FETCH_MESSAGE_BY_THREAD_ID",
    list_drafts: "GMAIL_LIST_DRAFTS",
    create_reply_draft: "GMAIL_CREATE_EMAIL_DRAFT",
  }),
  outlook: Object.freeze({
    list_inbound: "OUTLOOK_LIST_MESSAGES",
    list_sent: "OUTLOOK_LIST_MESSAGES",
    read_thread: "OUTLOOK_LIST_MESSAGES",
    list_thread_sent: "OUTLOOK_LIST_MESSAGES",
    list_drafts: "OUTLOOK_LIST_MESSAGES",
    // Graph createReply: replies to the original message's sender only.
    create_reply_draft: "OUTLOOK_CREATE_DRAFT_REPLY",
  }),
});
const ALLOWED_SLUGS = new Set(
  Object.values(MAILBOX_TOOLS).flatMap((ops) => Object.values(ops)),
);
// Any of these words in a slug means an effect this path must never have.
const FORBIDDEN_SLUG =
  /SEND|FORWARD|REPLY_TO_THREAD|REPLY_ALL|DELETE|TRASH|MOVE|RULE|FILTER|SETTING|MODIFY|UPDATE|PATCH|LABEL|IMPORT|INSERT|BATCH|SPAM|ARCHIVE|AUTO_?REPLY|VACATION|DELEGATE/;
export const MAILBOX_POLICY = {
  id: "inbox-drafts-v1",
  allowedOperations: [
    "list_inbound",
    "list_sent",
    "read_thread",
    "list_thread_sent",
    "list_drafts",
    "create_reply_draft",
  ] as MailboxOperation[],
  externalWrites: ["create_reply_draft"] as MailboxOperation[],
  send: false,
} as const;
export const MAILBOX_POLICY_HASH = hash({
  policy: MAILBOX_POLICY,
  tools: MAILBOX_TOOLS,
});

export class MailboxPolicyError extends Error {}
export class MailboxUncertainError extends Error {}
export function assertMailboxPolicy(
  provider: MailboxProvider,
  operation: MailboxOperation,
  slug: string,
) {
  if (!mailboxProviders.includes(provider))
    throw new MailboxPolicyError("Unsupported mailbox provider.");
  if (!MAILBOX_POLICY.allowedOperations.includes(operation))
    throw new MailboxPolicyError("Mailbox operation is not allowed.");
  if (MAILBOX_TOOLS[provider][operation] !== slug || !ALLOWED_SLUGS.has(slug))
    throw new MailboxPolicyError("Mailbox tool is not in the allowlist.");
  if (FORBIDDEN_SLUG.test(slug))
    throw new MailboxPolicyError("Mailbox tool has a forbidden effect.");
  if (operation === "create_reply_draft" && !/DRAFT/.test(slug))
    throw new MailboxPolicyError("Only draft creation is allowed.");
}
// Fail at import time if someone edits the map into a sending tool.
for (const provider of mailboxProviders)
  for (const [operation, slug] of Object.entries(MAILBOX_TOOLS[provider]))
    assertMailboxPolicy(provider, operation as MailboxOperation, slug);

const email = z.string().trim().toLowerCase().email().max(320);
const providerId = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_\-=+/.:]+$/);
export const LIST_LIMITS = { maxMessages: 50, maxWindowDays: 31 } as const;
/** Sent-mail reads (company sheet extraction): one bounded page, read-only. */
export const SENT_LIST_LIMITS = { maxMessages: 200, maxWindowDays: 90 } as const;
const listInput = z
  .object({
    windowDays: z.number().int().min(1).max(LIST_LIMITS.maxWindowDays),
    maxMessages: z.number().int().min(1).max(LIST_LIMITS.maxMessages),
    now: z.date().optional(),
    // Incremental batches: only messages received at or after this instant.
    since: z.date().optional(),
  })
  .strict();
const draftInput = z
  .object({
    threadId: providerId,
    messageId: providerId,
    recipient: email,
    body: z.string().trim().min(1).max(20_000),
  })
  .strict();
const odataString = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Arguments are code-built from typed inputs; callers cannot add fields. */
export function buildArguments(
  provider: MailboxProvider,
  operation: MailboxOperation,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (operation === "list_inbound" || operation === "list_sent") {
    const {
      windowDays,
      maxMessages,
      now,
      since: after,
    } = (
      operation === "list_sent"
        ? listInput.extend({
            windowDays: z.number().int().min(1).max(SENT_LIST_LIMITS.maxWindowDays),
            maxMessages: z.number().int().min(1).max(SENT_LIST_LIMITS.maxMessages),
          })
        : listInput
    ).parse(input);
    const sent = operation === "list_sent";
    const inboundAfter = sent ? undefined : after;
    if (provider === "gmail")
      return {
        user_id: "me",
        // Inbound: inbox only, excluding chats; spam/trash excluded by default.
        // Incremental: Gmail `after:` accepts epoch seconds (second precision).
        query: sent
          ? `in:sent newer_than:${windowDays}d`
          : `in:inbox -in:chats -in:sent -in:drafts ${
              inboundAfter
                ? `after:${Math.floor(inboundAfter.getTime() / 1000)}`
                : `newer_than:${windowDays}d`
            }`,
        max_results: maxMessages,
        verbose: true,
        include_payload: true,
        include_spam_trash: false,
      };
    const since = (
      inboundAfter ??
      new Date((now ?? new Date()).getTime() - windowDays * 86_400_000)
    ).toISOString();
    return {
      user_id: "me",
      folder: sent ? "sentitems" : "inbox",
      top: maxMessages,
      received_date_time_ge: sent ? undefined : since,
      sent_date_time_gt: sent ? since : undefined,
      select: OUTLOOK_SELECT,
    };
  }
  if (operation === "read_thread" || operation === "list_thread_sent") {
    const { threadId } = z
      .object({ threadId: providerId })
      .strict()
      .parse(input);
    if (provider === "gmail") return { user_id: "me", thread_id: threadId };
    return {
      user_id: "me",
      folder: operation === "read_thread" ? "allfolders" : "sentitems",
      filter: `conversationId eq ${odataString(threadId)}`,
      top: 25,
      select: OUTLOOK_SELECT,
    };
  }
  if (operation === "list_drafts") {
    const { threadId } = z
      .object({ threadId: providerId })
      .strict()
      .parse(input);
    if (provider === "gmail")
      return { user_id: "me", verbose: true, max_results: 100 };
    return {
      user_id: "me",
      folder: "drafts",
      filter: `conversationId eq ${odataString(threadId)}`,
      top: 25,
      select: ["id", "conversationId", "createdDateTime", "toRecipients"],
    };
  }
  if (operation === "create_reply_draft") {
    const { threadId, messageId, recipient, body } = draftInput.parse(input);
    if (provider === "gmail")
      // Empty subject keeps the draft in the thread (Composio GMAIL_CREATE_EMAIL_DRAFT).
      return {
        user_id: "me",
        thread_id: threadId,
        recipient_email: recipient,
        body,
        is_html: false,
      };
    // Graph createReply derives the recipient from the original message. The
    // pipeline only calls this when that sender equals `recipient` (no Reply-To
    // divergence), and verifies the returned recipients afterwards.
    return { user_id: "me", message_id: messageId, comment: body };
  }
  throw new MailboxPolicyError("Mailbox operation is not allowed.");
}
const OUTLOOK_SELECT = [
  "id",
  "conversationId",
  "subject",
  "from",
  "sender",
  "replyTo",
  "toRecipients",
  "receivedDateTime",
  "sentDateTime",
  "body",
  "internetMessageHeaders",
  "categories",
  "isDraft",
  "inferenceClassification",
  "webLink",
  "parentFolderId",
];

export type MailboxMode = "test" | "scoped_autonomy";
export type DraftReceipt = {
  draftId: string;
  threadId: string;
  payloadHash: string;
  policyHash: string;
  simulated: boolean;
  reconciled: boolean;
  recipients?: string[];
};
/** Durable, atomic store keyed by the draft idempotency key (see inbox store). */
export type DraftLedger = {
  claim(
    key: string,
    payloadHash: string,
  ): Promise<
    | { state: "claimed" }
    | { state: "done"; receipt: DraftReceipt }
    | { state: "uncertain"; claimedAt: Date; attempts: number }
  >;
  /** Re-claim an uncertain attempt after reconciliation found nothing. */
  retry(key: string): Promise<boolean>;
  record(key: string, receipt: DraftReceipt): Promise<void>;
  markUncertain(key: string): Promise<void>;
};
export type MailboxIdentity = {
  tenantId: string;
  workspaceId: string;
  connectedAccountId: string;
};
export const RECONCILE_RETRY_AFTER_MS = 10 * 60_000;
export const MAX_DRAFT_ATTEMPTS = 3;

function configuration(provider: MailboxProvider) {
  if (typeof window !== "undefined")
    throw new MailboxPolicyError("Mailbox broker is server-only.");
  const toolkit = toolkitSlug(provider);
  const config = authConfigId(provider);
  const version =
    process.env[`COMPOSIO_TOOL_VERSION_${provider.toUpperCase()}`]?.trim() ||
    process.env.COMPOSIO_TOOL_VERSION?.trim() ||
    (demoMailboxEnabled() ? DEMO_TOOL_VERSIONS[provider] : undefined);
  if (
    !composioConfigured() ||
    !toolkit ||
    !config ||
    !version ||
    !/^[0-9]{8}_[0-9]+$/.test(version)
  )
    throw new MailboxPolicyError(
      "Mailbox requires a configured toolkit, auth config and pinned tool version.",
    );
  return { toolkit, config, version };
}

/** Server configuration presence only (key, auth config, toolkit, pinned version) — not a verified connection. */
export function mailboxConfigured(provider: MailboxProvider) {
  try {
    configuration(provider);
    return true;
  } catch {
    return false;
  }
}

/**
 * One client per batch. Account ownership and tool/version are verified once for
 * reads and again before every draft creation.
 */
export function mailboxClient(
  provider: MailboxProvider,
  identity: MailboxIdentity,
  options: { mode: MailboxMode; sdk?: Composio } = { mode: "test" },
) {
  const cfg = configuration(provider);
  const userId = integrationUser(identity.tenantId, identity.workspaceId);
  const sdk = options.sdk ?? sdkClient();
  const verifiedTools = new Set<string>();
  let accountVerifiedAt = 0;
  async function verify(slug: string, fresh: boolean) {
    const opts = { signal: AbortSignal.timeout(15_000) };
    if (fresh || Date.now() - accountVerifiedAt > 5 * 60_000) {
      const auth = await sdk.authConfigs.get(cfg.config, opts);
      if (auth.status !== "ENABLED" || auth.toolkit.slug !== cfg.toolkit)
        throw new MailboxPolicyError(
          "Mailbox authentication configuration is invalid.",
        );
      if (
        !(await verifyPrivateAccount(
          sdk,
          {
            userId,
            accountId: identity.connectedAccountId,
            config: cfg.config,
            toolkit: cfg.toolkit,
          },
          opts,
        ))
      )
        throw new MailboxPolicyError(
          "An active mailbox owned by this workspace is required.",
        );
      accountVerifiedAt = Date.now();
    }
    if (!verifiedTools.has(slug)) {
      const tool = await sdk.tools.getRawComposioToolBySlug(
        slug,
        { version: cfg.version },
        opts,
      );
      if (
        tool.slug !== slug ||
        tool.toolkit?.slug !== cfg.toolkit ||
        tool.version !== cfg.version
      )
        throw new MailboxPolicyError(
          "Mailbox tool or version could not be verified.",
        );
      verifiedTools.add(slug);
    }
  }
  async function execute(
    operation: MailboxOperation,
    input: Record<string, unknown>,
  ) {
    const slug = MAILBOX_TOOLS[provider][operation];
    assertMailboxPolicy(provider, operation, slug);
    const args = JSON.parse(
      canonical(
        Object.fromEntries(
          Object.entries(buildArguments(provider, operation, input)).filter(
            ([, v]) => v !== undefined,
          ),
        ),
      ),
    ) as Record<string, unknown>;
    await verify(slug, operation === "create_reply_draft");
    const result = await sdk.tools.execute(
      slug,
      {
        userId,
        connectedAccountId: identity.connectedAccountId,
        arguments: args,
        version: cfg.version,
        allowTracing: false,
      },
      { signal: AbortSignal.timeout(30_000) },
    );
    return { result, args };
  }
  async function read(
    operation: Exclude<MailboxOperation, "create_reply_draft">,
    input: Record<string, unknown>,
  ) {
    try {
      const { result } = await execute(operation, input);
      if (!result.successful) throw new Error("unsuccessful");
      return parseData(result.data);
    } catch (error) {
      if (error instanceof MailboxPolicyError) throw error;
      throw new Error("Mailbox read failed. Check the connection and retry.");
    }
  }
  const normalize = (data: unknown) =>
    provider === "gmail"
      ? normalizeGmailMessages(data)
      : normalizeOutlookMessages(data);

  async function findDraftInThread(threadId: string) {
    const data = await read("list_drafts", { threadId });
    if (provider === "gmail") {
      const drafts = Array.isArray((data as { drafts?: unknown[] })?.drafts)
        ? (data as { drafts: Record<string, unknown>[] }).drafts
        : [];
      const found = drafts.find((d) => {
        const message = (d.message ?? {}) as Record<string, unknown>;
        return (message.threadId ?? d.threadId ?? d.thread_id) === threadId;
      });
      return found ? String(found.id ?? found.draft_id ?? "") : undefined;
    }
    const found = normalizeOutlookMessages(data, { includeDrafts: true }).find(
      (m) => m.threadId === threadId && m.isDraft,
    );
    return found?.id;
  }

  return {
    provider,
    policyHash: MAILBOX_POLICY_HASH,
    async listInbound(input: {
      windowDays: number;
      maxMessages: number;
      now?: Date;
      since?: Date;
    }): Promise<MailMessage[]> {
      const since = input.since?.toISOString();
      return normalize(await read("list_inbound", input))
        .filter((m) => !since || !m.receivedAt || m.receivedAt >= since)
        .slice(0, input.maxMessages);
    },
    async listSent(input: { windowDays: number; maxMessages: number }) {
      return normalize(await read("list_sent", input))
        .filter((m) => m.fromOwner || provider === "outlook")
        .slice(0, input.maxMessages);
    },
    /** Messages the owner sent in one thread (Gmail SENT label / Outlook sentitems). */
    async listThreadSent(threadId: string) {
      const messages = normalize(await read("list_thread_sent", { threadId }));
      return provider === "gmail"
        ? messages.filter((m) => m.fromOwner && !m.isDraft)
        : messages.map((m) => ({ ...m, fromOwner: true }));
    },
    async readThread(threadId: string) {
      const messages = normalize(await read("read_thread", { threadId }));
      if (provider === "gmail") return messages;
      const sent = new Set(
        normalize(await read("list_thread_sent", { threadId })).map(
          (m) => m.id,
        ),
      );
      return messages.map((m) => ({ ...m, fromOwner: sent.has(m.id) }));
    },
    /**
     * Idempotent draft creation. A claimed-but-unconfirmed attempt is reconciled
     * by listing drafts in the thread before any retry; uncertain outcomes are
     * never reported as success.
     */
    async createReplyDraft(
      input: {
        idempotencyKey: string;
        threadId: string;
        messageId: string;
        recipient: string;
        body: string;
      },
      ledger: DraftLedger,
    ): Promise<DraftReceipt & { created: boolean }> {
      const payload = draftInput.parse({
        threadId: input.threadId,
        messageId: input.messageId,
        recipient: input.recipient,
        body: input.body,
      });
      const payloadHash = hash({
        provider,
        account: identity.connectedAccountId,
        payload,
        policy: MAILBOX_POLICY_HASH,
      });
      const base = {
        threadId: payload.threadId,
        payloadHash,
        policyHash: MAILBOX_POLICY_HASH,
      };
      const claim = await ledger.claim(input.idempotencyKey, payloadHash);
      if (claim.state === "done") return { ...claim.receipt, created: false };
      if (options.mode === "test") {
        // Test mode never reaches the provider; receipt marks the simulation.
        const receipt = {
          ...base,
          draftId: `simulated:${payloadHash.slice(0, 16)}`,
          simulated: true,
          reconciled: false,
        };
        await ledger.record(input.idempotencyKey, receipt);
        return { ...receipt, created: false };
      }
      if (claim.state === "uncertain") {
        const existing = await findDraftInThread(payload.threadId);
        if (existing) {
          const receipt = {
            ...base,
            draftId: existing,
            simulated: false,
            reconciled: true,
          };
          await ledger.record(input.idempotencyKey, receipt);
          return { ...receipt, created: false };
        }
        if (
          claim.attempts >= MAX_DRAFT_ATTEMPTS ||
          Date.now() - claim.claimedAt.getTime() < RECONCILE_RETRY_AFTER_MS ||
          !(await ledger.retry(input.idempotencyKey))
        )
          throw new MailboxUncertainError(
            "A previous draft attempt is unconfirmed; waiting before reconciling again.",
          );
      }
      let data: unknown;
      try {
        const { result } = await execute("create_reply_draft", payload);
        if (!result.successful) throw new Error("unsuccessful");
        data = parseData(result.data);
      } catch (error) {
        await ledger.markUncertain(input.idempotencyKey);
        if (error instanceof MailboxPolicyError) throw error;
        throw new MailboxUncertainError(
          "Draft creation was not confirmed. It will be reconciled before any retry.",
        );
      }
      const draftId = draftIdFrom(provider, data);
      if (!draftId) {
        await ledger.markUncertain(input.idempotencyKey);
        throw new MailboxUncertainError(
          "Draft creation returned no draft id. It will be reconciled before any retry.",
        );
      }
      const recipients =
        provider === "outlook"
          ? normalizeOutlookMessages(data, { includeDrafts: true })[0]?.to
          : [payload.recipient];
      const receipt = {
        ...base,
        draftId,
        simulated: false,
        reconciled: false,
        recipients,
      };
      await ledger.record(input.idempotencyKey, receipt);
      return { ...receipt, created: true };
    },
  };
}
export type MailboxClient = ReturnType<typeof mailboxClient>;

function draftIdFrom(provider: MailboxProvider, data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>;
  const nested = (d.response_data ?? d.draft ?? {}) as Record<string, unknown>;
  const raw =
    provider === "gmail"
      ? (d.draft_id ?? d.draftId ?? d.id ?? nested.id)
      : (d.id ?? nested.id);
  return typeof raw === "string" && /^[A-Za-z0-9_\-=+/.:]{1,1024}$/.test(raw)
    ? raw
    : undefined;
}

/** Active PRIVATE accounts for this workspace; ids only, never SDK objects. */
export async function workspaceMailboxAccounts(
  provider: MailboxProvider,
  tenantId: string,
  workspaceId: string,
  sdk: Composio = sdkClient(),
) {
  const cfg = configuration(provider);
  const opts = { signal: AbortSignal.timeout(15_000) };
  const accounts = await sdk.connectedAccounts.list(
    {
      userIds: [integrationUser(tenantId, workspaceId)],
      authConfigIds: [cfg.config],
      toolkitSlugs: [cfg.toolkit],
      accountType: "PRIVATE",
      limit: 100,
    },
    opts,
  );
  return accounts.items
    .filter(
      (a) =>
        a.status === "ACTIVE" &&
        !a.isDisabled &&
        !a.authConfig.isDisabled &&
        a.authConfig.id === cfg.config &&
        a.toolkit.slug === cfg.toolkit,
    )
    .map((a) => a.id);
}
