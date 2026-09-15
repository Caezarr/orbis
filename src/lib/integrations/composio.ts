import { Composio } from "@composio/core";
import { integrations, type IntegrationSlug } from "./catalog";

// Server-only adapter. Never return SDK account objects: they can contain credentials.
function client() {
  if (typeof window !== "undefined")
    throw new Error("Integration adapter is server-only.");
  if (!process.env.COMPOSIO_API_KEY)
    throw new Error("Integration service is not configured.");
  return new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    allowTracking: false,
    fileUploadDirs: false,
    dangerouslyAllowAutoUploadDownloadFiles: false,
  });
}
export function authConfigId(slug: IntegrationSlug) {
  return process.env[`COMPOSIO_AUTH_CONFIG_${slug.toUpperCase()}`]?.trim();
}
// Preserve existing six provider mappings. Catalogue IDs are otherwise NOT SDK slugs.
const legacyToolkits: Partial<Record<IntegrationSlug, string>> = {
  gmail: "gmail",
  outlook: "outlook",
  googlecalendar: "googlecalendar",
  googledrive: "googledrive",
  notion: "notion",
  slack: "slack",
};
export function toolkitSlug(slug: IntegrationSlug) {
  const value =
    process.env[`COMPOSIO_TOOLKIT_${slug.toUpperCase()}`]?.trim() ??
    legacyToolkits[slug];
  return value && /^[a-z0-9_]+$/.test(value) ? value : undefined;
}
// This is presence of server configuration, never verified provider availability.
export function integrationReadiness() {
  return integrations.map((i) => ({
    ...i,
    configured:
      !!process.env.COMPOSIO_API_KEY?.trim() &&
      !!authConfigId(i.slug) &&
      !!toolkitSlug(i.slug),
    discoverable: true,
    scopesVerified: false,
  }));
}
export function integrationUser(tenantId: string, workspaceId: string) {
  return `orbis:${encodeURIComponent(tenantId)}:${encodeURIComponent(workspaceId)}`;
}
export async function connectionStatus(userId: string, slug: IntegrationSlug) {
  const config = authConfigId(slug);
  const toolkit = toolkitSlug(slug);
  if (!config || !toolkit || !process.env.COMPOSIO_API_KEY?.trim())
    return { status: "not_configured" };
  const sdk = client();
  await validateAuthConfig(sdk, config, toolkit);
  // One deadline across pagination; bound upstream requests on large accounts.
  const signal = AbortSignal.timeout(15000);
  let cursor: string | undefined;
  const seen = new Set<string>();
  let hasAccounts = false;
  for (let page = 0; page < 10; page++) {
    const result = await sdk.connectedAccounts
      .list(
        {
          userIds: [userId],
          authConfigIds: [config],
          toolkitSlugs: [toolkit],
          cursor,
          limit: 100,
        },
        { signal },
      )
      .catch(() => {
        throw new Error("Account verification failed.");
      });
    const matching = result.items.filter(
      (a) => a.toolkit.slug === toolkit && a.authConfig.id === config,
    );
    hasAccounts ||= matching.length > 0;
    if (
      matching.some(
        (a) =>
          a.status === "ACTIVE" && !a.isDisabled && !a.authConfig.isDisabled,
      )
    )
      return {
        status: "connected",
        verification: "provider_account_status",
        scopesVerified: false,
      };
    if (!result.nextCursor)
      return { status: hasAccounts ? "needs_auth" : "not_connected" };
    if (seen.has(result.nextCursor)) break;
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  // Incomplete pagination cannot prove disconnection.
  return { status: "unverified" };
}
async function validateAuthConfig(
  sdk: Composio,
  config: string,
  toolkit: string,
) {
  const auth = await sdk.authConfigs
    .get(config, { signal: AbortSignal.timeout(15000) })
    .catch(() => {
      throw new Error("Authentication configuration verification failed.");
    });
  if (auth.toolkit.slug !== toolkit)
    throw new Error("The configured authentication does not match this tool.");
  if (auth.status !== "ENABLED")
    throw new Error("The configured authentication is disabled.");
}
export async function startConnection(
  userId: string,
  slug: IntegrationSlug,
  callbackUrl: string,
) {
  const config = authConfigId(slug);
  const toolkit = toolkitSlug(slug);
  if (!config || !toolkit)
    throw new Error("This tool needs an administrator auth configuration.");
  const sdk = client();
  await validateAuthConfig(sdk, config, toolkit);
  const link = await sdk.connectedAccounts
    .link(
      userId,
      config,
      { callbackUrl },
      { signal: AbortSignal.timeout(15000) },
    )
    .catch(() => {
      throw new Error("Account authorization failed.");
    });
  let redirect: URL;
  try {
    redirect = new URL(link.redirectUrl ?? "");
  } catch {
    throw new Error("Invalid authentication redirect.");
  }
  if (redirect.protocol !== "https:" || redirect.username || redirect.password)
    throw new Error("Invalid authentication redirect.");
  return { redirectUrl: link.redirectUrl };
}
