import type { Composio } from "@composio/core";
import { canonical, sdkClient, verifyPrivateAccount } from "./action-broker";

/*
 * Shared execution core for the narrow broker paths added after the mailbox
 * path (calendar free/busy, mailbox labels). Same contract as mailbox.ts:
 *   - toolkit, auth config and a PINNED tool version come from server env;
 *   - before the first call (and every 5 min, or on every write) the auth config
 *     must be ENABLED for that toolkit and the connected account must be an
 *     ACTIVE PRIVATE account bound to this workspace's Composio user;
 *   - each slug is checked once against the pinned version;
 *   - arguments are canonical JSON built by the caller from typed inputs.
 * Callers own their closed tool map and policy assertion; this module never
 * chooses a slug.
 */
export class BrokerPolicyError extends Error {}

export type PinnedConfig = { toolkit: string; config: string; version: string };

export function pinnedConfig(input: {
  toolkit: string | undefined;
  config: string | undefined;
  version: string | undefined;
}): PinnedConfig | null {
  if (typeof window !== "undefined") return null;
  const toolkit = input.toolkit?.trim();
  const config = input.config?.trim();
  const version = input.version?.trim();
  if (
    !process.env.COMPOSIO_API_KEY?.trim() ||
    !toolkit ||
    !/^[a-z0-9_]+$/.test(toolkit) ||
    !config ||
    !version ||
    !/^[0-9]{8}_[0-9]+$/.test(version)
  )
    return null;
  return { toolkit, config, version };
}

export function verifiedExecutor(
  cfg: PinnedConfig,
  target: { userId: string; connectedAccountId: string },
  sdk: Composio = sdkClient(),
) {
  const verifiedTools = new Set<string>();
  let accountVerifiedAt = 0;
  async function verify(slug: string, fresh: boolean) {
    const opts = { signal: AbortSignal.timeout(15_000) };
    if (fresh || Date.now() - accountVerifiedAt > 5 * 60_000) {
      const auth = await sdk.authConfigs.get(cfg.config, opts);
      if (auth.status !== "ENABLED" || auth.toolkit.slug !== cfg.toolkit)
        throw new BrokerPolicyError("Authentication configuration is invalid.");
      if (
        !(await verifyPrivateAccount(
          sdk,
          {
            userId: target.userId,
            accountId: target.connectedAccountId,
            config: cfg.config,
            toolkit: cfg.toolkit,
          },
          opts,
        ))
      )
        throw new BrokerPolicyError(
          "An active account owned by this workspace is required.",
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
        throw new BrokerPolicyError("Tool or version could not be verified.");
      verifiedTools.add(slug);
    }
  }
  return {
    /** Executes one already policy-checked slug with code-built arguments. */
    async execute(
      slug: string,
      rawArgs: Record<string, unknown>,
      opts: { write: boolean },
    ) {
      const args = JSON.parse(
        canonical(
          Object.fromEntries(
            Object.entries(rawArgs).filter(([, v]) => v !== undefined),
          ),
        ),
      ) as Record<string, unknown>;
      await verify(slug, opts.write);
      const result = await sdk.tools.execute(
        slug,
        {
          userId: target.userId,
          connectedAccountId: target.connectedAccountId,
          arguments: args,
          version: cfg.version,
          allowTracing: false,
        },
        { signal: AbortSignal.timeout(30_000) },
      );
      return { result, args };
    },
  };
}

/** Active PRIVATE accounts of this workspace user for one auth config; ids only. */
export async function workspaceAccounts(
  cfg: PinnedConfig,
  userId: string,
  sdk: Composio = sdkClient(),
) {
  const accounts = await sdk.connectedAccounts.list(
    {
      userIds: [userId],
      authConfigIds: [cfg.config],
      toolkitSlugs: [cfg.toolkit],
      accountType: "PRIVATE",
      limit: 100,
    },
    { signal: AbortSignal.timeout(15_000) },
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
