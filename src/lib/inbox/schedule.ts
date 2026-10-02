import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Identity } from "@/lib/operations/worker";
import { INBOX_CONTRACT } from "@/lib/runtime/inbox-replies";
import { inboxMode } from "./service";

/**
 * Continuous drafting: incremental batches over mail received after the
 * per-account cursor. Every function here runs inside the workspace's own RLS
 * context (worker `scoped`); nothing reads across tenants.
 */
export const DEFAULT_INTERVAL_MINUTES = 15;
/** Re-list a small overlap before the cursor: delivery delays and clock skew. Dedup is by row. */
export const CURSOR_OVERLAP_MS = 5 * 60_000;
const DAY_MS = 86_400_000;
/** Flags/statuses that must be revisited by the next incremental batch. */
const PINNED_FLAG = "awaiting_draft_quota";
const PINNED_STATUS = new Set(["uncertain"]);

export function continuousMaxDrafts() {
  const n = Number(process.env.ORBIS_INBOX_CONTINUOUS_MAX_DRAFTS);
  return Number.isSafeInteger(n) && n >= 0 && n <= 50 ? n : 10;
}
export function intervalMinutes() {
  const n = Number(process.env.ORBIS_INBOX_POLL_MINUTES);
  return Number.isSafeInteger(n) && n >= 5 && n <= 1440
    ? n
    : DEFAULT_INTERVAL_MINUTES;
}
/** Lower bound of the next incremental batch. */
export function incrementalSince(cursor: Date | null, now: Date) {
  // No cursor yet (should not happen once enabled): look back one interval.
  const base = cursor ?? new Date(now.getTime() - intervalMinutes() * 60_000);
  return new Date(base.getTime() - CURSOR_OVERLAP_MS);
}
/** window_days is informational for incremental batches (the list uses since_at), kept within 1..31. */
export function windowDaysFor(since: Date, now: Date) {
  return Math.min(
    31,
    Math.max(1, Math.ceil((now.getTime() - since.getTime()) / DAY_MS)),
  );
}
/** One request key per account and schedule slot: concurrent dispatchers insert at most one batch. */
export function slotRequestKey(
  connectedAccountId: string,
  now: Date,
  minutes: number,
) {
  return `continuous:${connectedAccountId}:${Math.floor(now.getTime() / (minutes * 60_000))}`;
}
/**
 * Cursor after a completed batch: the newest received_at seen, unless some
 * message still needs a later pass (draft quota reached, uncertain draft) — then
 * just before the oldest such message so it is listed again (dedup keeps
 * already-terminal rows free of model cost).
 */
export function nextCursor(
  rows: { received_at: Date | null; status: string; flags: string[] }[],
  current: Date | null,
) {
  const dated = rows.filter(
    (r): r is typeof r & { received_at: Date } => r.received_at instanceof Date,
  );
  if (!dated.length) return current;
  const pinned = dated.filter(
    (r) => PINNED_STATUS.has(r.status) || r.flags.includes(PINNED_FLAG),
  );
  if (pinned.length)
    return new Date(
      Math.min(...pinned.map((r) => r.received_at.getTime())) - 1,
    );
  const newest = new Date(
    Math.max(...dated.map((r) => r.received_at.getTime())),
  );
  return current && current > newest ? current : newest;
}

type SettingsRow = {
  continuous_enabled: boolean;
  provider: "gmail" | "outlook" | null;
  connected_account_id: string | null;
  interval_minutes: number;
  cursor_at: Date | null;
  next_run_at: Date | null;
};

/**
 * If this workspace's poll is due, queue one incremental batch (unless one is
 * already pending) and move next_run_at forward. Row-locked + slot request key:
 * safe under concurrent dispatchers.
 */
export async function enqueueDueIncremental(
  db: PoolClient,
  identity: Identity,
  now = new Date(),
) {
  const ids = [identity.workspaceId, identity.tenantId];
  const settings = (
    await db.query<SettingsRow>(
      "SELECT continuous_enabled,provider,connected_account_id,interval_minutes,cursor_at,next_run_at FROM inbox_settings WHERE workspace_id=$1 AND tenant_id=$2 AND continuous_enabled AND next_run_at<=$3 FOR UPDATE SKIP LOCKED",
      [...ids, now],
    )
  ).rows[0];
  if (!settings?.provider || !settings.connected_account_id) return null;
  const minutes = settings.interval_minutes || intervalMinutes();
  await db.query(
    "UPDATE inbox_settings SET next_run_at=$3::timestamptz + make_interval(mins => $4), updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2",
    [...ids, now, minutes],
  );
  const pending = await db.query(
    "SELECT 1 FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 AND kind='incremental' AND status IN ('queued','running') LIMIT 1",
    ids,
  );
  if (pending.rowCount) return null;
  const since = incrementalSince(settings.cursor_at, now);
  const requestKey = slotRequestKey(
    settings.connected_account_id,
    now,
    minutes,
  );
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO inbox_batches(id,workspace_id,tenant_id,created_by,request_key,request_hash,kind,provider,connected_account_id,mission_version,mode,window_days,max_messages,max_drafts,since_at)
     VALUES($1,$2,$3,$4,$5,$6,'incremental',$7,$8,$9,$10,$11,50,$12,$13)
     ON CONFLICT(workspace_id,request_key) DO NOTHING RETURNING id`,
    [
      randomUUID(),
      ...ids,
      identity.userId,
      requestKey,
      "continuous",
      settings.provider,
      settings.connected_account_id,
      INBOX_CONTRACT.version,
      inboxMode(),
      windowDaysFor(since, now),
      continuousMaxDrafts(),
      since,
    ],
  );
  return inserted.rows[0]?.id ?? null;
}

/** After a completed batch, move the account cursor (see nextCursor). */
export async function advanceCursor(
  db: PoolClient,
  identity: Identity,
  batch: { id: string; connectedAccountId: string },
) {
  const ids = [identity.workspaceId, identity.tenantId];
  const settings = (
    await db.query<{ cursor_at: Date | null }>(
      "SELECT cursor_at FROM inbox_settings WHERE workspace_id=$1 AND tenant_id=$2 AND connected_account_id=$3 FOR UPDATE",
      [...ids, batch.connectedAccountId],
    )
  ).rows[0];
  if (!settings) return null;
  const rows = (
    await db.query<{
      received_at: Date | null;
      status: string;
      flags: string[];
    }>(
      "SELECT received_at,status,flags FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 AND batch_id=$3",
      [...ids, batch.id],
    )
  ).rows;
  const cursor = nextCursor(rows, settings.cursor_at);
  if (cursor && cursor.getTime() !== settings.cursor_at?.getTime())
    await db.query(
      "UPDATE inbox_settings SET cursor_at=$4, updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2 AND connected_account_id=$3",
      [...ids, batch.connectedAccountId, cursor],
    );
  return cursor;
}

/** A revoked or policy-failing mailbox stops continuous polling (the user re-enables it). */
export async function pauseContinuous(
  db: PoolClient,
  identity: Identity,
  connectedAccountId: string,
) {
  await db.query(
    "UPDATE inbox_settings SET continuous_enabled=false, next_run_at=NULL, updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2 AND connected_account_id=$3",
    [identity.workspaceId, identity.tenantId, connectedAccountId],
  );
}
