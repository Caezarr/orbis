import { createHash } from "node:crypto";
import { Composio } from "@composio/core";
import { z } from "zod";
import { authConfigId, integrationUser, toolkitSlug } from "./composio";

// Server-only worker API. Never expose execute directly as a client-callable action.
// Tool IDs are operator configuration, not claimed live SDK actions. Every entry
// is conservatively a write; adding read actions needs a reviewed schema contract.
export const actionRegistry = {
  "gmail.send": { provider: "gmail", env: "GMAIL_SEND", effect: "write" },
  "slack.post": { provider: "slack", env: "SLACK_POST", effect: "write" },
  "notion.create-page": {
    provider: "notion",
    env: "NOTION_CREATE_PAGE",
    effect: "write",
  },
  "hubspot.create-contact": {
    provider: "hubspot",
    env: "HUBSPOT_CREATE_CONTACT",
    effect: "write",
  },
} as const;
export type ActionId = keyof typeof actionRegistry;
export type ActionRequest = {
  tenantId: string;
  workspaceId: string;
  userId: string;
  actionId: ActionId;
  connectedAccountId: string;
  arguments: Record<string, unknown>;
  policyHash: string;
  idempotencyKey: string;
};
// Must be backed by an atomic, durable worker store in production. A claimed key
// remains consumed on timeout/failure: reconcile before retrying an uncertain write.
export type ActionLedger = {
  claim(key: string, payloadHash: string): Promise<boolean>;
};
class BrokerError extends Error {}
function refuse(message: string): never {
  throw new BrokerError(message);
}
function server() {
  if (typeof window !== "undefined") refuse("Action broker is server-only.");
}
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return refuse("Action arguments must be plain JSON.");
}
function hash(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
// Deliberately finite JSON Schema boundary. Unknown validation keywords, refs,
// unions, tuple items and vendor extensions fail closed instead of being ignored
// by a permissive converter. Defaults are annotations, never substituted for data.
const schemaShape = z
  .object({
    type: z.enum([
      "object",
      "array",
      "string",
      "number",
      "integer",
      "boolean",
      "null",
    ]),
    title: z.string().optional(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    nullable: z.boolean().optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
    required: z.array(z.string()).optional(),
    items: z.unknown().optional(),
    additionalProperties: z.unknown().optional(),
    enum: z
      .array(z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))
      .min(1)
      .optional(),
    minimum: z.number().finite().optional(),
    maximum: z.number().finite().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    minItems: z.number().int().nonnegative().optional(),
    maxItems: z.number().int().nonnegative().optional(),
    format: z
      .enum([
        "email",
        "uri",
        "uuid",
        "date-time",
        "date",
        "time",
        "ipv4",
        "ipv6",
      ])
      .optional(),
  })
  .strict();
type AcceptedSchema = Exclude<Parameters<typeof z.fromJSONSchema>[0], boolean>;
function validateSchemaShape(raw: unknown, depth = 0): AcceptedSchema {
  if (depth > 32) refuse("Configured action schema is too deeply nested.");
  const parsed = schemaShape.safeParse(raw);
  if (!parsed.success)
    refuse("Configured action schema is unsupported or malformed.");
  const {
    properties,
    items,
    additionalProperties,
    default: annotation,
    ...base
  } = parsed.data;
  void annotation;
  if (base.type === "array" && items === undefined)
    refuse("Configured array schema requires explicit items.");
  if (
    base.required?.some((key) => !properties || !Object.hasOwn(properties, key))
  )
    refuse("Configured required properties must have explicit schemas.");
  const validated: AcceptedSchema = {
    ...base,
    ...(properties === undefined
      ? {}
      : {
          properties: Object.fromEntries(
            Object.entries(properties).map(([key, value]) => [
              key,
              validateSchemaShape(value, depth + 1),
            ]),
          ),
        }),
    ...(items === undefined
      ? {}
      : { items: validateSchemaShape(items, depth + 1) }),
    ...(additionalProperties === undefined
      ? {}
      : {
          additionalProperties:
            typeof additionalProperties === "boolean"
              ? additionalProperties
              : validateSchemaShape(additionalProperties, depth + 1),
        }),
  };
  // Zod's converter handles enum before sibling constraints. Ensure every enum
  // member satisfies those constraints so conversion cannot silently widen access.
  if (base.enum) {
    const constraints = z.fromJSONSchema({ ...validated, enum: undefined });
    if (base.enum.some((value) => !constraints.safeParse(value).success))
      refuse("Configured enum conflicts with its schema constraints.");
  }
  return validated;
}
function configuration(request: ActionRequest) {
  server();
  if (!request || !Object.hasOwn(actionRegistry, request.actionId))
    refuse("Unsupported action.");
  if (
    ![
      request.tenantId,
      request.workspaceId,
      request.userId,
      request.connectedAccountId,
      request.policyHash,
      request.idempotencyKey,
    ].every((v) => typeof v === "string" && v.trim().length > 0)
  )
    refuse("Action context is incomplete.");
  if (request.userId !== integrationUser(request.tenantId, request.workspaceId))
    refuse("Action identity does not match this workspace.");
  if (
    !request.arguments ||
    Array.isArray(request.arguments) ||
    Object.getPrototypeOf(request.arguments) !== Object.prototype
  )
    refuse("Action arguments must be a JSON object.");
  const action = actionRegistry[request.actionId];
  const toolkit = toolkitSlug(action.provider);
  const config = authConfigId(action.provider);
  const tool = process.env[`COMPOSIO_ACTION_${action.env}`]?.trim();
  const version =
    process.env[`COMPOSIO_TOOL_VERSION_${action.env}`]?.trim() ||
    process.env.COMPOSIO_TOOL_VERSION?.trim();
  if (
    !toolkit ||
    !config ||
    !tool ||
    !/^[A-Z0-9_]+$/.test(tool) ||
    !version ||
    !/^[0-9]{8}_[0-9]+$/.test(version) ||
    !process.env.COMPOSIO_API_KEY?.trim()
  )
    refuse(
      "Action requires a configured toolkit, action and pinned tool version.",
    );
  return { toolkit, config, tool, version };
}
function sdkClient() {
  return new Composio({
    apiKey: process.env.COMPOSIO_API_KEY!,
    allowTracking: false,
    fileUploadDirs: false,
    dangerouslyAllowAutoUploadDownloadFiles: false,
  });
}
async function prepare(request: ActionRequest) {
  const config = configuration(request);
  // Snapshot before any await so callers cannot mutate arguments during approval.
  const snapshot = JSON.parse(canonical(request)) as ActionRequest;
  if (canonical(snapshot).length > 256_000)
    refuse("Action payload is too large.");
  const sdk = sdkClient();
  const options = { signal: AbortSignal.timeout(15_000) };
  const auth = await sdk.authConfigs.get(config.config, options);
  if (auth.status !== "ENABLED" || auth.toolkit.slug !== config.toolkit)
    refuse("Action authentication configuration is invalid.");
  let cursor: string | undefined;
  let matched = false;
  const cursors = new Set<string>();
  for (let page = 0; page < 10; page++) {
    const accounts = await sdk.connectedAccounts.list(
      {
        userIds: [snapshot.userId],
        authConfigIds: [config.config],
        toolkitSlugs: [config.toolkit],
        accountType: "PRIVATE",
        limit: 100,
        cursor,
      },
      options,
    );
    matched = accounts.items.some(
      (a) =>
        a.id === snapshot.connectedAccountId &&
        a.status === "ACTIVE" &&
        !a.isDisabled &&
        a.authConfig.id === config.config &&
        !a.authConfig.isDisabled &&
        a.toolkit.slug === config.toolkit,
    );
    if (matched || !accounts.nextCursor || cursors.has(accounts.nextCursor))
      break;
    cursor = accounts.nextCursor;
    cursors.add(cursor);
  }
  if (!matched)
    refuse("An active account owned by this workspace is required.");
  const tool = await sdk.tools.getRawComposioToolBySlug(
    config.tool,
    { version: config.version },
    options,
  );
  if (
    tool.slug !== config.tool ||
    tool.toolkit?.slug !== config.toolkit ||
    tool.version !== config.version ||
    !tool.inputParameters
  )
    refuse("Configured action schema or version could not be verified.");
  // Validate without replacing the exact approved arguments with defaults/coercions.
  const schema = validateSchemaShape(tool.inputParameters);
  if (!z.fromJSONSchema(schema).safeParse(snapshot.arguments).success)
    refuse("Action arguments do not match the configured schema.");
  const payloadHash = hash({
    request: snapshot,
    configuration: config,
    inputSchema: tool.inputParameters,
  });
  return { snapshot, config, payloadHash, inputSchema: tool.inputParameters };
}
async function sanitized<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BrokerError) throw error;
    throw new BrokerError(
      "Integration action failed. Check configuration and reconcile any attempted write before retrying.",
    );
  }
}
export async function prepareAction(request: ActionRequest) {
  return sanitized(async () => {
    const prepared = await prepare(request);
    return {
      payloadHash: prepared.payloadHash,
      actionId: prepared.snapshot.actionId,
      arguments: prepared.snapshot.arguments,
      inputSchema: prepared.inputSchema,
      effect: "write" as const,
      toolVersion: prepared.config.version,
    };
  });
}
export async function executeAction(
  request: ActionRequest,
  authorization: {
    // Load this from the authenticated approval store, never from untrusted arguments.
    approvedHash: string;
    dryRun: boolean;
    ledger: ActionLedger;
  },
) {
  return sanitized(async () => {
    server();
    if (authorization.dryRun !== false)
      refuse("Dry run refuses external writes.");
    if (!authorization.approvedHash)
      refuse("Exact payload approval is required.");
    const prepared = await prepare(request);
    if (authorization.approvedHash !== prepared.payloadHash)
      refuse("Approval does not match this action payload.");
    const key = hash({
      tenantId: prepared.snapshot.tenantId,
      workspaceId: prepared.snapshot.workspaceId,
      idempotencyKey: prepared.snapshot.idempotencyKey,
    });
    if (!(await authorization.ledger.claim(key, prepared.payloadHash)))
      refuse("This action has already been claimed; reconcile its outcome.");
    const result = await sdkClient().tools.execute(
      prepared.config.tool,
      {
        userId: prepared.snapshot.userId,
        connectedAccountId: prepared.snapshot.connectedAccountId,
        arguments: prepared.snapshot.arguments,
        version: prepared.config.version,
        allowTracing: false,
      },
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!result.successful)
      refuse(
        "The provider did not confirm action success. Reconcile before retrying.",
      );
    return {
      successful: true,
      payloadHash: prepared.payloadHash,
      data: result.data,
    };
  });
}
