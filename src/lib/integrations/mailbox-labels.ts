import { z } from "zod";
import type { Composio } from "@composio/core";
import { hash } from "./action-broker";
import { BrokerPolicyError, pinnedConfig, verifiedExecutor } from "./broker-exec";
import { authConfigId, integrationUser, toolkitSlug } from "./composio";
import { parseData } from "./mailbox-normalize";
import type { MailboxProvider } from "./mailbox";

/*
 * Visible triage: Orbis labels (Gmail) / categories (Outlook) on messages Orbis
 * has already classified. A separate broker path from mailbox.ts on purpose:
 * the draft path stays read + create-draft only.
 *   1. Closed, frozen tool map. Slugs never come from env, input or a model.
 *   2. Arguments are built by code. The only label NAMES that can ever be
 *      written are the five constants below (ORBI_LABELS); label ids must belong
 *      to labels whose name is one of them; system labels (INBOX, SPAM, TRASH,
 *      UNREAD, STARRED, IMPORTANT, CATEGORY_*) can never be added or removed.
 *   3. Outlook: OUTLOOK_UPDATE_EMAIL can technically change subject, body,
 *      recipients, flags… The argument builder emits ONLY {user_id, message_id,
 *      categories}; non-Orbis categories already on the message are preserved.
 *   4. Nothing derived from email content: which labels apply is a pure
 *      function of the schema-validated classification and the draft status.
 *
 * Scopes: Outlook `Mail.ReadWrite` (already granted for drafts; no master
 * category is created, so no `MailboxSettings.ReadWrite`). Gmail needs
 * `gmail.modify` (restricted) to change message labels: `gmail.labels` only
 * manages label definitions (Google API reference, users.messages.modify).
 * Gmail labels therefore stay behind ORBIS_INBOX_LABELS_GMAIL.
 *
 * Slugs verified with the Composio CLI schemas (2026-10-03): GMAIL_LIST_LABELS,
 * GMAIL_CREATE_LABEL, GMAIL_ADD_LABEL_TO_EMAIL (gmail 20260915_00);
 * OUTLOOK_GET_MESSAGE, OUTLOOK_UPDATE_EMAIL (outlook 20261002_00).
 */
export const ORBI_LABELS = Object.freeze({
  quote: "Orbi · Devis",
  client: "Orbi · Client",
  supplier: "Orbi · Fournisseur",
  admin: "Orbi · Admin",
  draft_ready: "Orbi · Brouillon prêt",
} as const);
export type OrbiLabelKey = keyof typeof ORBI_LABELS;
export const ORBI_LABEL_KEYS = Object.keys(ORBI_LABELS) as OrbiLabelKey[];
const ORBI_NAMES: ReadonlySet<string> = new Set(Object.values(ORBI_LABELS));
export const isOrbiLabelName = (name: string) => ORBI_NAMES.has(name);

export type LabelOperation =
  | "list_labels"
  | "create_label"
  | "read_message_labels"
  | "set_message_labels";
export const LABEL_TOOLS: Readonly<
  Record<MailboxProvider, Readonly<Partial<Record<LabelOperation, string>>>>
> = Object.freeze({
  gmail: Object.freeze({
    list_labels: "GMAIL_LIST_LABELS",
    create_label: "GMAIL_CREATE_LABEL",
    set_message_labels: "GMAIL_ADD_LABEL_TO_EMAIL",
  }),
  outlook: Object.freeze({
    read_message_labels: "OUTLOOK_GET_MESSAGE",
    set_message_labels: "OUTLOOK_UPDATE_EMAIL",
  }),
});
const ALLOWED = new Set(
  Object.values(LABEL_TOOLS).flatMap((ops) => Object.values(ops)),
);
const FORBIDDEN_SLUG =
  /SEND|FORWARD|REPLY|DELETE|TRASH|MOVE|RULE|FILTER|SETTING|SPAM|ARCHIVE|VACATION|DELEGATE|BATCH|IMPORT|INSERT|DRAFT|THREAD|ATTACHMENT|CONTACT|EVENT|CALENDAR|FOLDER|MASTER/;
export const LABEL_POLICY = {
  id: "mailbox-labels-v1",
  allowedOperations: [
    "list_labels",
    "create_label",
    "read_message_labels",
    "set_message_labels",
  ] as LabelOperation[],
  externalWrites: ["create_label", "set_message_labels"] as LabelOperation[],
  labelNames: Object.values(ORBI_LABELS),
  send: false,
} as const;
export const LABEL_POLICY_HASH = hash({ policy: LABEL_POLICY, tools: LABEL_TOOLS });
export class LabelPolicyError extends Error {}

export function assertLabelPolicy(
  provider: MailboxProvider,
  operation: LabelOperation,
  slug: string | undefined,
) {
  if (provider !== "gmail" && provider !== "outlook")
    throw new LabelPolicyError("Unsupported mailbox provider.");
  if (!LABEL_POLICY.allowedOperations.includes(operation))
    throw new LabelPolicyError("Label operation is not allowed.");
  if (!slug || LABEL_TOOLS[provider][operation] !== slug || !ALLOWED.has(slug))
    throw new LabelPolicyError("Label tool is not in the allowlist.");
  if (FORBIDDEN_SLUG.test(slug))
    throw new LabelPolicyError("Label tool has a forbidden effect.");
}
for (const provider of ["gmail", "outlook"] as const)
  for (const [operation, slug] of Object.entries(LABEL_TOOLS[provider]))
    assertLabelPolicy(provider, operation as LabelOperation, slug);

const providerId = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_\-=+/.:]+$/);
/** User label ids only: Gmail system labels are upper-case words (INBOX, SPAM…). */
const gmailUserLabelId = z
  .string()
  .regex(/^Label_[A-Za-z0-9_-]{1,64}$/);
const orbiName = z.string().refine(isOrbiLabelName, "Not an Orbis label");
const outlookCategory = z.string().min(1).max(255);

/** Arguments are code-built; callers cannot add fields. */
export function buildLabelArguments(
  provider: MailboxProvider,
  operation: LabelOperation,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (provider === "gmail") {
    if (operation === "list_labels") {
      z.object({}).strict().parse(input);
      return { user_id: "me", include_details: false };
    }
    if (operation === "create_label") {
      const { name } = z.object({ name: orbiName }).strict().parse(input);
      return {
        user_id: "me",
        label_name: name,
        label_list_visibility: "labelShow",
        message_list_visibility: "show",
      };
    }
    if (operation === "set_message_labels") {
      const { messageId, add, remove } = z
        .object({
          messageId: providerId,
          add: z.array(gmailUserLabelId).max(5),
          remove: z.array(gmailUserLabelId).max(5),
        })
        .strict()
        .parse(input);
      if (!add.length && !remove.length)
        throw new LabelPolicyError("Nothing to change.");
      return {
        user_id: "me",
        message_id: messageId,
        add_label_ids: add.length ? add : undefined,
        remove_label_ids: remove.length ? remove : undefined,
      };
    }
  } else {
    if (operation === "read_message_labels") {
      const { messageId } = z
        .object({ messageId: providerId })
        .strict()
        .parse(input);
      return { user_id: "me", message_id: messageId, select: ["id", "categories"] };
    }
    if (operation === "set_message_labels") {
      const { messageId, categories } = z
        .object({
          messageId: providerId,
          categories: z.array(outlookCategory).max(50),
        })
        .strict()
        .parse(input);
      // ONLY these three keys: never subject, body, recipients, flag, isRead.
      return { user_id: "me", message_id: messageId, categories };
    }
  }
  throw new LabelPolicyError("Label operation is not allowed.");
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
/** Gmail label list → Orbis label name → id (other labels are ignored). */
export function normalizeGmailLabels(data: unknown) {
  const d = obj(parseData(data));
  const list = Array.isArray(d.labels)
    ? d.labels
    : Array.isArray(obj(d.response_data).labels)
      ? (obj(d.response_data).labels as unknown[])
      : null;
  if (!list) throw new Error("labels_shape");
  const out = new Map<string, string>();
  for (const raw of list) {
    const l = obj(raw);
    const name = typeof l.name === "string" ? l.name : "";
    const id = typeof l.id === "string" ? l.id : "";
    if (isOrbiLabelName(name) && gmailUserLabelId.safeParse(id).success)
      out.set(name, id);
  }
  return out;
}
export function createdGmailLabelId(data: unknown) {
  const d = obj(parseData(data));
  const raw = d.id ?? obj(d.response_data).id ?? obj(d.label).id;
  return typeof raw === "string" && gmailUserLabelId.safeParse(raw).success
    ? raw
    : undefined;
}
export function outlookCategories(data: unknown): string[] {
  const d = obj(parseData(data));
  const message = Array.isArray(d.categories) ? d : obj(d.response_data);
  if (!Array.isArray(message.categories)) throw new Error("categories_shape");
  return message.categories
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.slice(0, 255))
    .slice(0, 50);
}

function configuration(provider: MailboxProvider) {
  return pinnedConfig({
    toolkit: toolkitSlug(provider),
    config: authConfigId(provider),
    version:
      process.env[`COMPOSIO_TOOL_VERSION_${provider.toUpperCase()}`] ||
      process.env.COMPOSIO_TOOL_VERSION,
  });
}

export type LabelClient = {
  provider: MailboxProvider;
  policyHash: string;
  /**
   * Make the message carry exactly `keys` among Orbis labels (adds missing,
   * removes stale Orbis ones). Never touches any other label or category.
   */
  setOrbiLabels(messageId: string, keys: OrbiLabelKey[]): Promise<void>;
};

export function labelClient(
  provider: MailboxProvider,
  identity: { tenantId: string; workspaceId: string; connectedAccountId: string },
  options: { sdk?: Composio } = {},
): LabelClient {
  const cfg = configuration(provider);
  if (!cfg) throw new LabelPolicyError("Mailbox is not configured.");
  const exec = verifiedExecutor(
    cfg,
    {
      userId: integrationUser(identity.tenantId, identity.workspaceId),
      connectedAccountId: identity.connectedAccountId,
    },
    options.sdk,
  );
  async function run(operation: LabelOperation, input: Record<string, unknown>) {
    const slug = LABEL_TOOLS[provider][operation];
    assertLabelPolicy(provider, operation, slug);
    const args = buildLabelArguments(provider, operation, input);
    try {
      const { result } = await exec.execute(slug!, args, {
        write: LABEL_POLICY.externalWrites.includes(operation),
      });
      if (!result.successful) throw new Error("unsuccessful");
      return parseData(result.data);
    } catch (error) {
      if (error instanceof BrokerPolicyError || error instanceof LabelPolicyError)
        throw new LabelPolicyError(error.message);
      throw new Error("Label call failed.");
    }
  }
  let gmailIds: Map<string, string> | null = null;
  async function gmailLabelIds(create: boolean) {
    if (!gmailIds) gmailIds = normalizeGmailLabels(await run("list_labels", {}));
    if (create)
      for (const name of Object.values(ORBI_LABELS))
        if (!gmailIds.has(name)) {
          const id = createdGmailLabelId(await run("create_label", { name }));
          if (!id) throw new Error("Label creation returned no id.");
          gmailIds.set(name, id);
        }
    return gmailIds;
  }
  return {
    provider,
    policyHash: LABEL_POLICY_HASH,
    async setOrbiLabels(messageId, keys) {
      const wanted = new Set<string>(keys.map((k) => ORBI_LABELS[k]));
      if (provider === "gmail") {
        const ids = await gmailLabelIds(wanted.size > 0);
        const add = [...wanted].map((n) => ids.get(n)!).filter(Boolean);
        const remove = [...ids.entries()]
          .filter(([name]) => !wanted.has(name))
          .map(([, id]) => id);
        if (!add.length && !remove.length) return;
        await run("set_message_labels", { messageId, add, remove });
        return;
      }
      const current = outlookCategories(
        await run("read_message_labels", { messageId }),
      );
      const kept = current.filter((c) => !isOrbiLabelName(c));
      const next = [...kept, ...wanted];
      const same =
        next.length === current.length && next.every((c) => current.includes(c));
      if (same) return;
      await run("set_message_labels", { messageId, categories: next });
    },
  };
}
