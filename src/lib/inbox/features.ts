import type { PoolClient } from "pg";
import { z } from "zod";
import { PlatformError } from "@/lib/platform/auth";
import { workspaceContext } from "@/lib/platform/context";
import {
  calendarAuth,
  calendarConfigured,
  calendarFor,
  workspaceCalendarAccounts,
  type CalendarProvider,
} from "@/lib/integrations/calendar";
import {
  integrationUser,
  startConnectionWith,
} from "@/lib/integrations/composio";
import { labelClient } from "@/lib/integrations/mailbox-labels";
import { cleanupLabels, sessionCleanupStore } from "./labels";
import {
  DEFAULT_TIMEZONE,
  supportedTimezones,
  type SupportedTimezone,
} from "@/lib/calendar/slots";
import type { MailboxMode, MailboxProvider } from "@/lib/integrations/mailbox";

/*
 * Per-workspace opt-ins for calendar-aware drafts and visible triage
 * (migration 014, table inbox_features). Both default OFF, and both also need
 * a deployment flag:
 *   ORBIS_INBOX_CALENDAR=true        calendar-aware meeting drafts
 *   ORBIS_INBOX_LABELS=true          Orbis categories (Outlook)
 *   ORBIS_INBOX_LABELS_GMAIL=true    Orbis labels on Gmail too (needs gmail.modify)
 */
export function calendarFeatureEnabled() {
  return process.env.ORBIS_INBOX_CALENDAR === "true";
}
export function labelsFeatureEnabled(provider?: MailboxProvider) {
  if (process.env.ORBIS_INBOX_LABELS !== "true") return false;
  return provider !== "gmail" || process.env.ORBIS_INBOX_LABELS_GMAIL === "true";
}

export type InboxFeatures = {
  calendarEnabled: boolean;
  labelsEnabled: boolean;
  timezone: SupportedTimezone;
};
export const DEFAULT_FEATURES: InboxFeatures = {
  calendarEnabled: false,
  labelsEnabled: false,
  timezone: DEFAULT_TIMEZONE,
};
type Row = {
  calendar_enabled: boolean;
  labels_enabled: boolean;
  timezone: string;
};
const toFeatures = (row: Row | undefined): InboxFeatures => ({
  calendarEnabled: !!row?.calendar_enabled,
  labelsEnabled: !!row?.labels_enabled,
  timezone: supportedTimezones.includes(row?.timezone as SupportedTimezone)
    ? (row!.timezone as SupportedTimezone)
    : DEFAULT_TIMEZONE,
});

/** Worker/request: features of one workspace (caller provides the scoped db). */
export async function loadFeatures(
  db: PoolClient,
  ids: { workspaceId: string; tenantId: string },
) {
  const row = (
    await db.query<Row>(
      "SELECT calendar_enabled,labels_enabled,timezone FROM inbox_features WHERE workspace_id=$1 AND tenant_id=$2",
      [ids.workspaceId, ids.tenantId],
    )
  ).rows[0];
  return toFeatures(row);
}

export const featuresSchema = z
  .object({
    calendarEnabled: z.boolean().optional(),
    labelsEnabled: z.boolean().optional(),
    timezone: z.enum(supportedTimezones).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

function context() {
  const ctx = workspaceContext();
  if (!ctx?.db || ctx.closed)
    throw new PlatformError(
      "Inbox drafts require an authenticated database workspace",
      503,
    );
  return { ...ctx, db: ctx.db };
}

export type InboxFeaturesView = InboxFeatures & {
  /** Mailbox of the latest batch; decides which calendar/label system applies. */
  provider?: MailboxProvider;
  calendar: {
    available: boolean;
    provider?: CalendarProvider;
  };
  labels: { available: boolean; applied: number };
  canEdit: boolean;
};

async function latestProvider(ctx: ReturnType<typeof context>) {
  return (
    await ctx.db.query<{ provider: MailboxProvider }>(
      "SELECT provider FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1",
      [ctx.workspaceId, ctx.tenantId],
    )
  ).rows[0]?.provider;
}

export async function featuresView(): Promise<InboxFeaturesView> {
  const ctx = context();
  const ids = { workspaceId: ctx.workspaceId, tenantId: ctx.tenantId };
  const features = await loadFeatures(ctx.db, ids);
  const provider = await latestProvider(ctx);
  const applied = (
    await ctx.db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM inbox_labels WHERE workspace_id=$1 AND tenant_id=$2 AND state IN ('applied','simulated','uncertain')",
      [ctx.workspaceId, ctx.tenantId],
    )
  ).rows[0];
  const calendarProvider = provider ? calendarFor(provider) : undefined;
  return {
    ...features,
    provider,
    calendar: {
      available:
        calendarFeatureEnabled() &&
        (!calendarProvider || calendarConfigured(calendarProvider)),
      provider: calendarProvider,
    },
    labels: {
      available: labelsFeatureEnabled(provider),
      applied: Number(applied?.n ?? 0),
    },
    canEdit: ctx.role === "owner" || ctx.role === "admin",
  };
}

export const calendarActionSchema = z
  .object({ action: z.enum(["connect", "verify"]) })
  .strict();
/**
 * Calendar connection for the session workspace. The calendar provider is
 * derived server-side from the workspace mailbox (Gmail → Google Calendar,
 * Outlook → Outlook calendar auth config); the client never chooses it. The
 * OAuth callback is never trusted: `verify` checks the account server-side.
 */
export async function calendarAction(
  action: "connect" | "verify",
  origin: string,
  deps: {
    accounts?: typeof workspaceCalendarAccounts;
    link?: typeof startConnectionWith;
  } = {},
) {
  const ctx = context();
  if (!calendarFeatureEnabled())
    throw new PlatformError("Les créneaux d’agenda ne sont pas disponibles sur ce déploiement.", 503);
  const mailbox = await latestProvider(ctx);
  if (!mailbox)
    throw new PlatformError("Connectez d’abord votre boîte mail.", 409);
  const provider = calendarFor(mailbox);
  const auth = calendarAuth(provider);
  if (!auth)
    throw new PlatformError("Cet agenda n’est pas configuré sur ce déploiement.", 503);
  if (action === "verify") {
    try {
      const ids = await (deps.accounts ?? workspaceCalendarAccounts)(
        provider,
        ctx.tenantId,
        ctx.workspaceId,
      );
      return { provider, status: ids.length ? "connected" : "not_connected" };
    } catch {
      return { provider, status: "error" };
    }
  }
  const callback = new URL("/settings", origin);
  callback.searchParams.set("calendar", "connected");
  const { redirectUrl } = await (deps.link ?? startConnectionWith)(
    integrationUser(ctx.tenantId, ctx.workspaceId),
    auth,
    callback.href,
  );
  return { provider, redirectUrl };
}

/**
 * « Retirer les libellés Orbi »: turns labels off, then removes (bounded per
 * call) every Orbis label Orbis applied, from the ledger only. Real labels are
 * removed through the label broker in scoped_autonomy; test mode closes
 * simulated rows only. The UI calls again while `remaining` > 0.
 */
export async function cleanupWorkspaceLabels(
  mode: MailboxMode,
  deps: { client?: typeof labelClient; deadlineMs?: number } = {},
) {
  const ctx = context();
  const ids = { workspaceId: ctx.workspaceId, tenantId: ctx.tenantId };
  await ctx.db.query(
    "UPDATE inbox_features SET labels_enabled=false, updated_by=$3, updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2",
    [ids.workspaceId, ids.tenantId, ctx.userId],
  );
  return cleanupLabels({
    mode,
    store: sessionCleanupStore(ctx.db, ids),
    client: (row) =>
      (deps.client ?? labelClient)(row.provider, {
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        connectedAccountId: row.connectedAccountId,
      }),
    limit: 10,
    deadline: Date.now() + (deps.deadlineMs ?? 25_000),
  });
}

/** Owner/admin (route-enforced). Only the three opt-in fields are writable. */
export async function setFeatures(input: z.infer<typeof featuresSchema>) {
  const ctx = context();
  if (input.calendarEnabled && !calendarFeatureEnabled())
    throw new PlatformError("Les créneaux d’agenda ne sont pas disponibles sur ce déploiement.", 409);
  if (input.labelsEnabled && !labelsFeatureEnabled(await latestProvider(ctx)))
    throw new PlatformError("Les libellés Orbi ne sont pas disponibles pour cette messagerie.", 409);
  await ctx.db.query(
    `INSERT INTO inbox_features(workspace_id,tenant_id,calendar_enabled,labels_enabled,timezone,updated_by,updated_at)
     VALUES($1,$2,COALESCE($3,false),COALESCE($4,false),COALESCE($5,'${DEFAULT_TIMEZONE}'),$6,now())
     ON CONFLICT(workspace_id) DO UPDATE SET
       calendar_enabled=COALESCE($3,inbox_features.calendar_enabled),
       labels_enabled=COALESCE($4,inbox_features.labels_enabled),
       timezone=COALESCE($5,inbox_features.timezone),
       updated_by=$6, updated_at=now()
     WHERE inbox_features.tenant_id=$2`,
    [
      ctx.workspaceId,
      ctx.tenantId,
      input.calendarEnabled ?? null,
      input.labelsEnabled ?? null,
      input.timezone ?? null,
      ctx.userId,
    ],
  );
  return featuresView();
}
