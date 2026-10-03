import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Composio } from "@composio/core";
import {
  assertLabelPolicy,
  buildLabelArguments,
  labelClient,
  LABEL_POLICY_HASH,
  LabelPolicyError,
  ORBI_LABELS,
} from "./mailbox-labels";
import { MAILBOX_POLICY_HASH, assertMailboxPolicy, MailboxPolicyError } from "./mailbox";

describe("label policy", () => {
  it("is a separate, separately hashed policy; the draft path still refuses label/update slugs", () => {
    expect(LABEL_POLICY_HASH).not.toBe(MAILBOX_POLICY_HASH);
    expect(() => assertMailboxPolicy("gmail", "create_reply_draft", "GMAIL_ADD_LABEL_TO_EMAIL")).toThrow(MailboxPolicyError);
    expect(() => assertMailboxPolicy("outlook", "create_reply_draft", "OUTLOOK_UPDATE_EMAIL")).toThrow(MailboxPolicyError);
  });
  it.each([
    "GMAIL_SEND_EMAIL",
    "GMAIL_DELETE_LABEL",
    "GMAIL_MOVE_TO_TRASH",
    "GMAIL_BATCH_MODIFY_MESSAGES",
    "GMAIL_MODIFY_THREAD_LABELS",
    "OUTLOOK_CREATE_MASTER_CATEGORY",
  ])("refuses %s", (slug) => {
    expect(() => assertLabelPolicy("gmail", "set_message_labels", slug)).toThrow(LabelPolicyError);
  });
  it("only creates the five Orbis label names", () => {
    expect(buildLabelArguments("gmail", "create_label", { name: ORBI_LABELS.quote })).toMatchObject({ label_name: "Orbi · Devis" });
    expect(() => buildLabelArguments("gmail", "create_label", { name: "SPAM" })).toThrow();
    expect(() => buildLabelArguments("gmail", "create_label", { name: "Orbi · Spam" })).toThrow();
  });
  it("never adds or removes Gmail system labels", () => {
    for (const id of ["SPAM", "TRASH", "INBOX", "UNREAD", "IMPORTANT", "CATEGORY_PROMOTIONS"])
      expect(() =>
        buildLabelArguments("gmail", "set_message_labels", { messageId: "m1", add: [id], remove: [] }),
      ).toThrow();
    expect(() =>
      buildLabelArguments("gmail", "set_message_labels", { messageId: "m1", add: [], remove: ["INBOX"] }),
    ).toThrow();
  });
  it("Outlook update carries only message id and categories", () => {
    const args = buildLabelArguments("outlook", "set_message_labels", { messageId: "AAMk=", categories: ["Orbi · Client"] });
    expect(Object.keys(args).sort()).toEqual(["categories", "message_id", "user_id"]);
    expect(() =>
      buildLabelArguments("outlook", "set_message_labels", { messageId: "AAMk=", categories: [], subject: "x" }),
    ).toThrow();
    expect(() =>
      buildLabelArguments("outlook", "set_message_labels", { messageId: "AAMk=", categories: [], to_recipients: [] }),
    ).toThrow();
  });
});

function fakeSdk(toolkit: "gmail" | "outlook", responses: Record<string, unknown>) {
  const execute = vi.fn(async (slug: string) => {
    const r = responses[slug];
    return { successful: true, data: typeof r === "function" ? r() : r };
  });
  return {
    execute,
    sdk: {
      authConfigs: { get: vi.fn(async () => ({ status: "ENABLED", toolkit: { slug: toolkit } })) },
      connectedAccounts: {
        list: vi.fn(async () => ({
          items: [{ id: "ca_1", status: "ACTIVE", isDisabled: false, authConfig: { id: "ac", isDisabled: false }, toolkit: { slug: toolkit } }],
        })),
      },
      tools: {
        getRawComposioToolBySlug: vi.fn(async (slug: string) => ({ slug, toolkit: { slug: toolkit }, version: "20260915_00" })),
        execute,
      },
    } as unknown as Composio,
  };
}
const ids = { tenantId: "t", workspaceId: "w", connectedAccountId: "ca_1" };
describe("labelClient", () => {
  beforeEach(() => {
    vi.stubEnv("COMPOSIO_API_KEY", "key");
    vi.stubEnv("COMPOSIO_AUTH_CONFIG_GMAIL", "ac");
    vi.stubEnv("COMPOSIO_AUTH_CONFIG_OUTLOOK", "ac");
    vi.stubEnv("COMPOSIO_TOOL_VERSION_GMAIL", "20260915_00");
    vi.stubEnv("COMPOSIO_TOOL_VERSION_OUTLOOK", "20260915_00");
  });
  afterEach(() => vi.unstubAllEnvs());
  it("Gmail: creates missing Orbis labels, adds wanted, removes stale Orbis labels only", async () => {
    const { sdk, execute } = fakeSdk("gmail", {
      GMAIL_LIST_LABELS: {
        labels: [
          { id: "INBOX", name: "INBOX" },
          { id: "Label_1", name: "Orbi · Client" },
          { id: "Label_9", name: "Clients VIP" },
        ],
      },
      GMAIL_CREATE_LABEL: (() => {
        let n = 10;
        return () => ({ id: `Label_${n++}` });
      })(),
      GMAIL_ADD_LABEL_TO_EMAIL: {},
    });
    await labelClient("gmail", ids, { sdk }).setOrbiLabels("abc123", ["quote"]);
    const set = execute.mock.calls.find((c) => c[0] === "GMAIL_ADD_LABEL_TO_EMAIL") as unknown as [string, { arguments: Record<string, unknown> }];
    expect(set[1].arguments).toMatchObject({ user_id: "me", message_id: "abc123" });
    const args = set[1].arguments as { add_label_ids: string[]; remove_label_ids: string[] };
    expect(args.add_label_ids).toHaveLength(1);
    expect(args.remove_label_ids).toContain("Label_1");
    expect(args.remove_label_ids).not.toContain("Label_9");
    expect(args.remove_label_ids).not.toContain("INBOX");
    expect(args.remove_label_ids).not.toContain(args.add_label_ids[0]);
    for (const call of execute.mock.calls) expect(String(call[0])).not.toMatch(/SEND|DELETE|TRASH|DRAFT/);
  });
  it("Outlook: preserves the user's own categories", async () => {
    const { sdk, execute } = fakeSdk("outlook", {
      OUTLOOK_GET_MESSAGE: { categories: ["Rouge", "Orbi · Admin"] },
      OUTLOOK_UPDATE_EMAIL: {},
    });
    await labelClient("outlook", ids, { sdk }).setOrbiLabels("AAMk=", ["client", "draft_ready"]);
    const update = execute.mock.calls.find((c) => c[0] === "OUTLOOK_UPDATE_EMAIL") as unknown as [string, { arguments: Record<string, unknown> }];
    expect(update[1].arguments).toEqual({
      user_id: "me",
      message_id: "AAMk=",
      categories: ["Rouge", "Orbi · Client", "Orbi · Brouillon prêt"],
    });
  });
  it("Outlook cleanup removes only Orbis categories", async () => {
    const { sdk, execute } = fakeSdk("outlook", {
      OUTLOOK_GET_MESSAGE: { categories: ["Rouge", "Orbi · Client"] },
      OUTLOOK_UPDATE_EMAIL: {},
    });
    await labelClient("outlook", ids, { sdk }).setOrbiLabels("AAMk=", []);
    const update = execute.mock.calls.find((c) => c[0] === "OUTLOOK_UPDATE_EMAIL") as unknown as [string, { arguments: Record<string, unknown> }];
    expect(update[1].arguments.categories).toEqual(["Rouge"]);
  });
});
