import { Composio } from "@composio/core";
import { integrations, type IntegrationSlug } from "./catalog";

// Server-only adapter. Never return SDK account objects: they can contain credentials.
function client() {
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
  return process.env[`COMPOSIO_AUTH_CONFIG_${slug.toUpperCase()}`];
}
export function integrationReadiness() {
  return integrations.map((i) => ({
    ...i,
    configured: !!process.env.COMPOSIO_API_KEY && !!authConfigId(i.slug),
  }));
}
export function integrationUser(tenantId: string, workspaceId: string) {
  return `orbis:${encodeURIComponent(tenantId)}:${encodeURIComponent(workspaceId)}`;
}
export async function connectionStatus(userId: string, slug: IntegrationSlug) {
  const config = authConfigId(slug);
  if (!config || !process.env.COMPOSIO_API_KEY)
    return { status: "not_configured" };
  const result = await client().connectedAccounts.list(
    {
      userIds: [userId],
      authConfigIds: [config],
      toolkitSlugs: [slug],
      limit: 100,
    },
    { signal: AbortSignal.timeout(15000) },
  );
  const active = result.items.find(
    (a) => a.status === "ACTIVE" && !a.isDisabled,
  );
  return {
    status: active
      ? "connected"
      : result.items.length
        ? "needs_auth"
        : "not_connected",
  };
}
export async function startConnection(
  userId: string,
  slug: IntegrationSlug,
  callbackUrl: string,
) {
  const config = authConfigId(slug);
  if (!config)
    throw new Error("This tool needs an administrator auth configuration.");
  const sdk = client();
  const auth = await sdk.authConfigs.get(config, {
    signal: AbortSignal.timeout(15000),
  });
  if (auth.toolkit.slug !== slug)
    throw new Error("The configured authentication does not match this tool.");
  const link = await sdk.connectedAccounts.link(
    userId,
    config,
    { callbackUrl },
    { signal: AbortSignal.timeout(15000) },
  );
  if (!link.redirectUrl || new URL(link.redirectUrl).protocol !== "https:")
    throw new Error("Invalid authentication redirect.");
  return { redirectUrl: link.redirectUrl };
}
