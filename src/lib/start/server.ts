import { z } from "zod";
import { trackOnce } from "@/lib/analytics/events";
import type { StoreState } from "@/lib/domain/types";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import { inboxMode } from "@/lib/inbox/service";
import { monthlyCapCents } from "@/lib/inbox/store";
import { integrationUser, startConnection } from "@/lib/integrations/composio";
import {
  mailboxConfigured,
  mailboxProviders,
  workspaceMailboxAccounts,
  type MailboxProvider,
} from "@/lib/integrations/mailbox";
import { isOfflineMode } from "@/lib/platform/context";
import { demoModelActive } from "@/lib/runtime/demo-model";
import { providerStatus } from "@/lib/runtime/provider";
import type { MailboxStatus } from "./flow";

/** What /start may show for the session workspace. Configuration presence only, no network. */
export function startReadiness(state: StoreState) {
  const offline = isOfflineMode();
  return {
    session: offline ? ("offline" as const) : ("authenticated" as const),
    profile: state.profile
      ? { name: state.profile.name, summary: state.profile.summary, website: state.profile.website }
      : null,
    inbox: {
      enabled: inboxDraftsEnabled(),
      mode: inboxMode(),
      aiConfigured: providerStatus().configured || demoModelActive(),
      demoModel: demoModelActive(),
      budgetConfigured: !!monthlyCapCents(),
    },
    providers: Object.fromEntries(
      mailboxProviders.map((p) => [p, { configured: !offline && mailboxConfigured(p) }]),
    ) as Record<MailboxProvider, { configured: boolean }>,
  };
}
export type StartReadiness = ReturnType<typeof startReadiness>;

export const mailboxActionSchema = z
  .object({ provider: z.enum(mailboxProviders), action: z.enum(["connect", "verify"]) })
  .strict();

export type MailboxDeps = {
  accounts?: typeof workspaceMailboxAccounts;
  link?: typeof startConnection;
  configured?: (p: MailboxProvider) => boolean;
  record?: typeof trackOnce;
};

/**
 * Server-side verification: the same check POST /api/v1/inbox applies (ACTIVE,
 * PRIVATE account bound to this workspace's Composio user). The OAuth browser
 * callback is never trusted as proof of connection.
 */
export async function verifyMailbox(
  provider: MailboxProvider,
  identity: { tenantId: string; workspaceId: string },
  deps: MailboxDeps = {},
): Promise<{ status: MailboxStatus; accounts: number }> {
  if (isOfflineMode() || !(deps.configured ?? mailboxConfigured)(provider))
    return { status: "not_configured", accounts: 0 };
  let ids: string[];
  try {
    ids = await (deps.accounts ?? workspaceMailboxAccounts)(provider, identity.tenantId, identity.workspaceId);
  } catch {
    return { status: "error", accounts: 0 };
  }
  if (ids.length) await (deps.record ?? trackOnce)("mailbox_connected");
  return { status: ids.length ? "connected" : "not_connected", accounts: ids.length };
}

export async function connectMailbox(
  provider: MailboxProvider,
  identity: { tenantId: string; workspaceId: string },
  origin: string,
  deps: MailboxDeps = {},
) {
  if (isOfflineMode() || !(deps.configured ?? mailboxConfigured)(provider))
    return { error: "provider_not_configured" as const };
  // Return path carries only the provider name; the result is re-verified server-side.
  const callback = new URL("/start", origin);
  callback.searchParams.set("connected", provider);
  const { redirectUrl } = await (deps.link ?? startConnection)(
    integrationUser(identity.tenantId, identity.workspaceId),
    provider,
    callback.href,
  );
  return { redirectUrl };
}
