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
  prepareAction,
  executeAction,
  type ActionRequest,
} from "./action-broker";
import { integrationUser } from "./composio";
const request = (): ActionRequest => ({
  tenantId: "tenant",
  workspaceId: "workspace",
  userId: integrationUser("tenant", "workspace"),
  actionId: "gmail.send",
  connectedAccountId: "account",
  arguments: { body: "Approved message", to: "recipient@example.com" },
  policyHash: "policy-v1",
  idempotencyKey: "operation-1",
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("COMPOSIO_API_KEY", "fixture-key");
  vi.stubEnv("COMPOSIO_AUTH_CONFIG_GMAIL", "config");
  vi.stubEnv("COMPOSIO_TOOLKIT_GMAIL", "gmail");
  // Fixture action names do not claim to be real provider actions.
  vi.stubEnv("COMPOSIO_ACTION_GMAIL_SEND", "FIXTURE_SEND");
  vi.stubEnv("COMPOSIO_TOOL_VERSION_GMAIL_SEND", "20260901_00");
  sdk.auth.mockResolvedValue({ status: "ENABLED", toolkit: { slug: "gmail" } });
  sdk.list.mockResolvedValue({
    items: [
      {
        id: "account",
        status: "ACTIVE",
        isDisabled: false,
        authConfig: { id: "config", isDisabled: false },
        toolkit: { slug: "gmail" },
      },
    ],
  });
  sdk.schema.mockResolvedValue({
    slug: "FIXTURE_SEND",
    toolkit: { slug: "gmail" },
    version: "20260901_00",
    inputParameters: {
      type: "object",
      properties: { to: { type: "string" }, body: { type: "string" } },
      required: ["to", "body"],
    },
  });
  sdk.execute.mockResolvedValue({
    successful: true,
    data: { messageId: "sent-1" },
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("configured action broker", () => {
  it("prepares a stable hash and only executes the exact approved payload with a private tenant-bound account", async () => {
    const input = request();
    const prepared = await prepareAction(input);
    const reordered = {
      ...input,
      arguments: { to: "recipient@example.com", body: "Approved message" },
    };
    expect((await prepareAction(reordered)).payloadHash).toBe(
      prepared.payloadHash,
    );
    const claim = vi.fn().mockResolvedValue(true);
    expect(
      await executeAction(input, {
        approvedHash: prepared.payloadHash,
        dryRun: false,
        ledger: { claim },
      }),
    ).toMatchObject({ successful: true });
    expect(sdk.list.mock.calls[0][0]).toMatchObject({
      userIds: [input.userId],
      accountType: "PRIVATE",
      authConfigIds: ["config"],
    });
    expect(sdk.schema.mock.calls[0].slice(0, 2)).toEqual([
      "FIXTURE_SEND",
      { version: "20260901_00" },
    ]);
    expect(sdk.execute.mock.calls[0].slice(0, 2)).toEqual([
      "FIXTURE_SEND",
      {
        userId: input.userId,
        connectedAccountId: "account",
        arguments: input.arguments,
        version: "20260901_00",
        allowTracing: false,
      },
    ]);
    expect(claim).toHaveBeenCalledTimes(1);
  });
  it("refuses dry-run writes before contacting Composio", async () => {
    await expect(
      executeAction(request(), {
        approvedHash: "anything",
        dryRun: true,
        ledger: { claim: vi.fn() },
      }),
    ).rejects.toThrow("Dry run");
    expect(sdk.auth).not.toHaveBeenCalled();
    expect(sdk.execute).not.toHaveBeenCalled();
  });
  it.each(["arguments", "policyHash", "idempotencyKey"])(
    "invalidates approval when %s changes",
    async (field) => {
      const input = request();
      const prepared = await prepareAction(input);
      const changed = {
        ...input,
        [field]:
          field === "arguments"
            ? { ...input.arguments, to: "other@example.com" }
            : "changed",
      };
      await expect(
        executeAction(changed, {
          approvedHash: prepared.payloadHash,
          dryRun: false,
          ledger: { claim: vi.fn() },
        }),
      ).rejects.toThrow("does not match");
      expect(sdk.execute).not.toHaveBeenCalled();
    },
  );
  it("requires a pinned source version and a registered action", async () => {
    vi.stubEnv("COMPOSIO_TOOL_VERSION_GMAIL_SEND", "latest");
    await expect(prepareAction(request())).rejects.toThrow(
      "pinned tool version",
    );
    await expect(
      prepareAction({
        ...request(),
        actionId: "arbitrary" as ActionRequest["actionId"],
      }),
    ).rejects.toThrow("Unsupported action");
    expect(sdk.schema).not.toHaveBeenCalled();
  });
  it("rejects malformed arguments before execution", async () => {
    await expect(
      prepareAction({ ...request(), arguments: { to: 42 } }),
    ).rejects.toThrow("configured schema");
    expect(sdk.execute).not.toHaveBeenCalled();
  });
  it.each([
    { type: "array", items: [{ type: "string" }] },
    { type: "string", format: "unverified-custom-format" },
    { type: "string", minLength: "2" },
    {
      type: "object",
      properties: { nested: { $ref: "https://external.example/schema" } },
    },
    { type: "object", patternProperties: { ".*": { type: "string" } } },
    { type: "object", required: ["unspecified"] },
    { type: "array" },
    { type: "string", unknownValidation: true },
    { type: "string", enum: [42] },
    { type: "string", enum: ["short"], minLength: 20 },
  ])("fails closed on unsupported schema %j", async (inputParameters) => {
    sdk.schema.mockResolvedValue({
      slug: "FIXTURE_SEND",
      toolkit: { slug: "gmail" },
      version: "20260901_00",
      inputParameters,
    });
    await expect(prepareAction(request())).rejects.toThrow(/schema|properties/);
    expect(sdk.execute).not.toHaveBeenCalled();
  });
  it("validates nested homogeneous arrays, required fields and additional properties without applying defaults", async () => {
    sdk.schema.mockResolvedValue({
      slug: "FIXTURE_SEND",
      toolkit: { slug: "gmail" },
      version: "20260901_00",
      inputParameters: {
        type: "object",
        additionalProperties: false,
        required: ["recipients"],
        properties: {
          recipients: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["email"],
              properties: {
                email: {
                  type: "string",
                  format: "email",
                  default: "default@example.com",
                },
              },
            },
          },
        },
      },
    });
    await expect(
      prepareAction({
        ...request(),
        arguments: { recipients: [{ email: "valid@example.com" }] },
      }),
    ).resolves.toHaveProperty("payloadHash");
    for (const args of [
      { recipients: [{}] },
      { recipients: [{ email: 42 }] },
      { recipients: [] },
      { recipients: [{ email: "valid@example.com", extra: true }] },
    ]) {
      await expect(
        prepareAction({ ...request(), arguments: args }),
      ).rejects.toThrow("configured schema");
    }
  });
  it("rejects foreign identities, missing accounts, disabled accounts and wrong toolkit schemas", async () => {
    await expect(
      prepareAction({ ...request(), tenantId: "other" }),
    ).rejects.toThrow("identity");
    sdk.list.mockResolvedValue({ items: [] });
    await expect(prepareAction(request())).rejects.toThrow(
      "owned by this workspace",
    );
    sdk.list.mockResolvedValue({
      items: [{ id: "account", status: "ACTIVE", isDisabled: true }],
    });
    await expect(prepareAction(request())).rejects.toThrow(
      "owned by this workspace",
    );
  });
  it("rejects schema mismatches and a replay claimed by another worker", async () => {
    const input = request();
    const prepared = await prepareAction(input);
    await expect(
      executeAction(input, {
        approvedHash: prepared.payloadHash,
        dryRun: false,
        ledger: { claim: async () => false },
      }),
    ).rejects.toThrow("already been claimed");
    sdk.schema.mockResolvedValue({
      slug: "FIXTURE_SEND",
      toolkit: { slug: "slack" },
      version: "20260901_00",
      inputParameters: {},
    });
    await expect(prepareAction(input)).rejects.toThrow("schema or version");
    expect(sdk.execute).not.toHaveBeenCalled();
  });
  it("sanitizes provider exceptions and does not retry uncertain writes", async () => {
    const input = request();
    const prepared = await prepareAction(input);
    sdk.execute.mockRejectedValue(new Error("SECRET token from provider"));
    await expect(
      executeAction(input, {
        approvedHash: prepared.payloadHash,
        dryRun: false,
        ledger: { claim: async () => true },
      }),
    ).rejects.toThrow("Integration action failed");
    expect(sdk.execute).toHaveBeenCalledTimes(1);
  });
});
