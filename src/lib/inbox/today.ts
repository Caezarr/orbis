import { z } from "zod";
import { PlatformError } from "@/lib/platform/auth";
import { workspaceContext } from "@/lib/platform/context";
import { intervalMinutes } from "./schedule";
import { draftsWithNewInfo, openQuestions } from "@/lib/brain/service";
import type { MailboxMode } from "@/lib/integrations/mailbox";
import { inboxMode, publicMessage, type InboxResult } from "./service";
import { effectiveMonthlyCap } from "./store";

/**
 * "Today" decisions and the continuous-drafting toggle for the session
 * workspace. Session-scoped only: tenant/workspace/user come from
 * withWorkspaceRequest, every query also filters on them, RLS enforces it.
 */
function context() {
  const ctx = workspaceContext();
  if (!ctx?.db || ctx.closed)
    throw new PlatformError(
      "Inbox drafts require an authenticated database workspace",
      503,
    );
  return { ...ctx, db: ctx.db };
}
export const settingsSchema = z
  .object({ continuousEnabled: z.boolean() })
  .strict();

type SettingsRow = {
  continuous_enabled: boolean;
  provider: "gmail" | "outlook" | null;
  interval_minutes: number;
  cursor_at: Date | null;
  next_run_at: Date | null;
  monthly_cap_cents: number | null;
};
export type InboxSettingsView = {
  continuousEnabled: boolean;
  /** A first run completed for a connected mailbox: the toggle can be turned on. */
  eligible: boolean;
  provider?: "gmail" | "outlook";
  intervalMinutes: number;
  nextRunAt?: string;
  lastCheckedAt?: string;
  monthlyCapCents: number | null;
  spentCents: number;
};

async function firstRunAccount(ctx: ReturnType<typeof context>) {
  return (
    await ctx.db.query<{
      provider: "gmail" | "outlook";
      connected_account_id: string;
    }>(
      "SELECT provider,connected_account_id FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 AND kind='first_run' AND status='completed' ORDER BY completed_at DESC NULLS LAST LIMIT 1",
      [ctx.workspaceId, ctx.tenantId],
    )
  ).rows[0];
}

export async function inboxSettings(): Promise<InboxSettingsView> {
  const ctx = context();
  const ids = [ctx.workspaceId, ctx.tenantId];
  const row = (
    await ctx.db.query<SettingsRow>(
      "SELECT continuous_enabled,provider,interval_minutes,cursor_at,next_run_at,monthly_cap_cents FROM inbox_settings WHERE workspace_id=$1 AND tenant_id=$2",
      ids,
    )
  ).rows[0];
  const account = await firstRunAccount(ctx);
  const last = (
    await ctx.db.query<{ completed_at: Date | null }>(
      "SELECT completed_at FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 AND kind='incremental' AND status='completed' ORDER BY completed_at DESC NULLS LAST LIMIT 1",
      ids,
    )
  ).rows[0];
  const spent = (
    await ctx.db.query<{ cents: string }>(
      `SELECT ((SELECT COALESCE(sum(est_cost_cents),0) FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 AND created_at>=date_trunc('month',now()))
        + (SELECT COALESCE(sum(est_cost_cents),0) FROM brain_usage WHERE workspace_id=$1 AND tenant_id=$2 AND created_at>=date_trunc('month',now())))::text AS cents`,
      ids,
    )
  ).rows[0];
  return {
    continuousEnabled: !!row?.continuous_enabled,
    eligible: !!account,
    provider: row?.provider ?? account?.provider,
    intervalMinutes: row?.interval_minutes ?? intervalMinutes(),
    nextRunAt: row?.continuous_enabled
      ? row.next_run_at?.toISOString()
      : undefined,
    lastCheckedAt: last?.completed_at?.toISOString(),
    monthlyCapCents: effectiveMonthlyCap(row?.monthly_cap_cents),
    spentCents: Number(spent?.cents ?? 0),
  };
}

/**
 * Explicit opt-in. Turning on requires a completed first run (the user has seen
 * drafts for that mailbox); the cursor starts at the newest message already
 * handled, so continuous mode never re-drafts the past.
 */
export async function setContinuous(enabled: boolean) {
  const ctx = context();
  const ids = [ctx.workspaceId, ctx.tenantId];
  if (!enabled) {
    await ctx.db.query(
      "UPDATE inbox_settings SET continuous_enabled=false, next_run_at=NULL, updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2",
      ids,
    );
    return inboxSettings();
  }
  const account = await firstRunAccount(ctx);
  if (!account)
    throw new PlatformError(
      "Lancez d’abord un premier passage sur votre boîte mail.",
      409,
    );
  const cursor = (
    await ctx.db.query<{ cursor: Date | null }>(
      "SELECT max(received_at) AS cursor FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 AND connected_account_id=$3",
      [...ids, account.connected_account_id],
    )
  ).rows[0]?.cursor;
  await ctx.db.query(
    `INSERT INTO inbox_settings(workspace_id,tenant_id,continuous_enabled,provider,connected_account_id,interval_minutes,cursor_at,next_run_at,enabled_by,enabled_at,updated_at)
     VALUES($1,$2,true,$3,$4,$5,COALESCE($6,now()),now(),$7,now(),now())
     ON CONFLICT(workspace_id) DO UPDATE SET continuous_enabled=true, provider=EXCLUDED.provider,
       connected_account_id=EXCLUDED.connected_account_id,
       cursor_at=CASE WHEN inbox_settings.connected_account_id=EXCLUDED.connected_account_id AND inbox_settings.cursor_at IS NOT NULL THEN inbox_settings.cursor_at ELSE EXCLUDED.cursor_at END,
       next_run_at=now(), enabled_by=EXCLUDED.enabled_by, enabled_at=now(), updated_at=now()`,
    [
      ...ids,
      account.provider,
      account.connected_account_id,
      intervalMinutes(),
      cursor ?? null,
      ctx.userId,
    ],
  );
  return inboxSettings();
}

type DigestRow = Parameters<typeof publicMessage>[0];
export type TodayDigest = {
  since: string;
  counts: {
    draftsReady: number;
    questionsPending: number;
    needsReview: number;
    skipped: number;
  };
  drafts: InboxResult[];
  settings: InboxSettingsView;
  /** ORBIS_INBOX_MODE: "test" = drafts are simulated, nothing written to the mailbox. */
  mode: MailboxMode;
  /** « Questions d’Orbi » — asked once, answered once (company brain). */
  questions: Awaited<ReturnType<typeof openQuestions>>;
  /** Unsent drafts that asked a question answered since: new info available. */
  newInfo: Awaited<ReturnType<typeof draftsWithNewInfo>>;
  canAnswer: boolean;
};
const DEFAULT_LOOKBACK_MS = 7 * 86_400_000;

/** Decisions since the user's last "seen" mark (default: last 7 days). */
export async function todayDigest(now = new Date()): Promise<TodayDigest> {
  const ctx = context();
  const ids = [ctx.workspaceId, ctx.tenantId];
  const visit = (
    await ctx.db.query<{ seen_at: Date }>(
      "SELECT seen_at FROM inbox_visits WHERE workspace_id=$1 AND tenant_id=$2 AND user_id=$3",
      [...ids, ctx.userId],
    )
  ).rows[0];
  const since = visit?.seen_at ?? new Date(now.getTime() - DEFAULT_LOOKBACK_MS);
  const counts = (
    await ctx.db.query<{
      drafts: string;
      questions: string;
      review: string;
      skipped: string;
    }>(
      `SELECT
        count(*) FILTER (WHERE status='drafted' AND drafted_at>$3)::text AS drafts,
        count(*) FILTER (WHERE status='drafted' AND drafted_at>$3 AND jsonb_array_length(questions)>0)::text AS questions,
        count(*) FILTER (WHERE status IN ('needs_review','uncertain') AND updated_at>$3)::text AS review,
        count(*) FILTER (WHERE status='skipped' AND updated_at>$3)::text AS skipped
       FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 AND updated_at>$3`,
      [...ids, since],
    )
  ).rows[0];
  const drafts = (
    await ctx.db.query<DigestRow>(
      `SELECT id,batch_id,provider,message_id,thread_id,status,classification,skip_reason,flags,subject_preview,draft_preview,
       questions,citations,draft_state,draft_id,received_at,drafted_at,proposed_slots FROM inbox_messages
       WHERE workspace_id=$1 AND tenant_id=$2 AND status='drafted' AND drafted_at>$3 ORDER BY drafted_at DESC LIMIT 10`,
      [...ids, since],
    )
  ).rows;
  return {
    since: since.toISOString(),
    counts: {
      draftsReady: Number(counts?.drafts ?? 0),
      questionsPending: Number(counts?.questions ?? 0),
      needsReview: Number(counts?.review ?? 0),
      skipped: Number(counts?.skipped ?? 0),
    },
    drafts: drafts.map(publicMessage),
    settings: await inboxSettings(),
    mode: inboxMode(),
    questions: await openQuestions(ctx),
    newInfo: await draftsWithNewInfo(ctx),
    canAnswer: ctx.role === "owner" || ctx.role === "admin",
  };
}

export async function markTodaySeen() {
  const ctx = context();
  await ctx.db.query(
    `INSERT INTO inbox_visits(workspace_id,tenant_id,user_id,seen_at) VALUES($1,$2,$3,now())
     ON CONFLICT(workspace_id,user_id) DO UPDATE SET seen_at=now()`,
    [ctx.workspaceId, ctx.tenantId, ctx.userId],
  );
}
