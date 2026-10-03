import type { PoolClient } from "pg";
import { z } from "zod";
import { PlatformError } from "@/lib/platform/auth";
import { workspaceContext } from "@/lib/platform/context";
import { transaction } from "@/lib/platform/db";
import { maskEmail } from "@/lib/followups/detect";
import { scoped, type Identity } from "@/lib/operations/worker";
import { composeDigest, isEmptyDigest, normalizeCounts, type DigestCounts, type DigestMessage } from "./compose";
import {
  deliverDigest,
  digestDeliveryMode,
  digestIdempotencyKey,
  digestPolicyHash,
  isDeliverableAddress,
  type DigestDeliveryMode,
  type DigestOutcome,
} from "./delivery";

/*
 * Daily digest (migration 013). Opt-in per user, off by default, behind
 * ORBIS_DIGEST=true. Settings are session-scoped; the daily pass discovers
 * due subscriptions by id only, then reads counts and the recipient under the
 * subscriber's own RLS context (worker `scoped`), like the inbox dispatcher.
 */
export function digestEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ORBIS_DIGEST === "true";
}
export const digestSettingsSchema = z.object({ enabled: z.boolean() }).strict();

/** Roles that can run the worker context (scoped) and so receive a digest. */
const SUBSCRIBER_ROLES = new Set(["owner", "admin", "operator"]);
const DAY_MS = 86_400_000;
/** First digest, or after a long pause: never look back further than this. */
export const MAX_WINDOW_MS = 7 * DAY_MS;

export type DigestSettingsView = {
  enabled: boolean;
  /** Masked address the digest goes to (the account e-mail at opt-in). */
  recipient?: string;
  canSubscribe: boolean;
  /** "simulated": composed and recorded, not sent (no e-mail transport is configured). */
  delivery: DigestDeliveryMode;
  lastDay?: string;
};

function context() {
  const ctx = workspaceContext();
  if (!ctx?.db || ctx.closed) throw new PlatformError("The digest requires an authenticated database workspace", 503);
  return { ...ctx, db: ctx.db };
}

export async function digestSettings(): Promise<DigestSettingsView> {
  const ctx = context();
  const row = (
    await ctx.db.query<{ enabled: boolean; recipient: string | null; last_day: string | null }>(
      "SELECT enabled,recipient,to_char(last_day,'YYYY-MM-DD') AS last_day FROM digest_subscriptions WHERE workspace_id=$1 AND tenant_id=$2 AND user_id=$3",
      [ctx.workspaceId, ctx.tenantId, ctx.userId],
    )
  ).rows[0];
  return {
    enabled: !!row?.enabled,
    recipient: row?.recipient ? maskEmail(row.recipient) : undefined,
    canSubscribe: SUBSCRIBER_ROLES.has(ctx.role),
    delivery: digestDeliveryMode(),
    lastDay: row?.last_day ?? undefined,
  };
}

/**
 * Opt-in / opt-out for the session user only. The recipient is the verified
 * account address passed by the route from the authenticated session (never a
 * request field). Turning off nulls the stored address.
 */
export async function setDigest(enabled: boolean, account: { email?: string | null; emailConfirmedAt?: string | null }) {
  const ctx = context();
  const ids = [ctx.workspaceId, ctx.tenantId, ctx.userId];
  if (!enabled) {
    await ctx.db.query(
      "UPDATE digest_subscriptions SET enabled=false, recipient=NULL, updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2 AND user_id=$3",
      ids,
    );
    return digestSettings();
  }
  if (!SUBSCRIBER_ROLES.has(ctx.role)) throw new PlatformError("Insufficient workspace role", 403);
  const email = account.email?.trim().toLowerCase();
  if (!account.emailConfirmedAt || !isDeliverableAddress(email))
    throw new PlatformError("Confirmez d’abord l’adresse e-mail de votre compte.", 409);
  // Window starts now: the first digest covers what happens after opting in.
  await ctx.db.query(
    `INSERT INTO digest_subscriptions(workspace_id,tenant_id,user_id,enabled,recipient,last_window_end,enabled_at,updated_at)
     VALUES($1,$2,$3,true,$4,now(),now(),now())
     ON CONFLICT(workspace_id,user_id) DO UPDATE SET enabled=true, recipient=EXCLUDED.recipient,
       last_window_end=CASE WHEN digest_subscriptions.enabled THEN digest_subscriptions.last_window_end ELSE now() END,
       enabled_at=CASE WHEN digest_subscriptions.enabled THEN digest_subscriptions.enabled_at ELSE now() END, updated_at=now()`,
    [...ids, email],
  );
  return digestSettings();
}

type Ids = { workspaceId: string; tenantId: string };
/** Counts only, inside the caller's RLS context. */
export async function digestCounts(db: PoolClient, ids: Ids, since: Date, until: Date): Promise<DigestCounts> {
  const p = [ids.workspaceId, ids.tenantId];
  const inbox = (
    await db.query<{ drafts: string; questions: string; review: string }>(
      `SELECT
        count(*) FILTER (WHERE status='drafted' AND drafted_at>$3 AND drafted_at<=$4)::text AS drafts,
        count(*) FILTER (WHERE status='drafted' AND drafted_at>$3 AND drafted_at<=$4 AND jsonb_array_length(questions)>0)::text AS questions,
        count(*) FILTER (WHERE status IN ('needs_review','uncertain') AND updated_at>$3 AND updated_at<=$4)::text AS review
       FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 AND updated_at>$3`,
      [...p, since, until],
    )
  ).rows[0];
  const questions = (
    await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM brain_questions WHERE workspace_id=$1 AND tenant_id=$2 AND status='open'",
      p,
    )
  ).rows[0];
  // Same definition as the Today card (followups/service.ts todaySummary).
  const followups = (
    await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM followups f JOIN pipeline_items i ON i.id=f.pipeline_item_id AND i.workspace_id=f.workspace_id AND i.tenant_id=f.tenant_id
       WHERE f.workspace_id=$1 AND f.tenant_id=$2 AND f.status IN ('drafted','needs_review') AND i.status NOT IN ('gagne','perdu')
         AND (i.last_owner_at IS NULL OR f.drafted_at IS NULL OR i.last_owner_at<f.drafted_at)`,
      p,
    )
  ).rows[0];
  return normalizeCounts({
    draftsReady: Number(inbox?.drafts ?? 0),
    draftsWithQuestions: Number(inbox?.questions ?? 0),
    needsReview: Number(inbox?.review ?? 0),
    orbiQuestions: Number(questions?.n ?? 0),
    followupsReady: Number(followups?.n ?? 0),
  });
}

export type SubscriberOutcome = "not_due" | "skipped_empty" | DigestOutcome;
export type DigestDeps = {
  mode?: DigestDeliveryMode;
  counts?: typeof digestCounts;
  compose?: (counts: DigestCounts) => DigestMessage;
  deliver?: typeof deliverDigest;
};

/**
 * One subscriber, inside their own RLS context. The ledger row is the claim:
 * it is inserted before delivery, and a second pass the same day finds it and
 * does nothing. A delivery that fails is recorded as failed and not retried
 * that day (a later real transport must reconcile with its provider key).
 */
export async function runDigestForSubscriber(db: PoolClient, identity: Identity, now: Date, deps: DigestDeps = {}): Promise<SubscriberOutcome> {
  const mode = deps.mode ?? digestDeliveryMode();
  const ids = [identity.workspaceId, identity.tenantId, identity.userId];
  const sub = (
    await db.query<{ recipient: string | null; last_window_end: Date | null; day: string; due: boolean }>(
      `SELECT recipient,last_window_end,to_char((now() AT TIME ZONE 'Europe/Paris')::date,'YYYY-MM-DD') AS day,
         (last_day IS NULL OR last_day<(now() AT TIME ZONE 'Europe/Paris')::date) AS due
       FROM digest_subscriptions WHERE workspace_id=$1 AND tenant_id=$2 AND user_id=$3 AND enabled FOR UPDATE`,
      ids,
    )
  ).rows[0];
  if (!sub?.due || !sub.recipient) return "not_due";
  const floor = new Date(now.getTime() - MAX_WINDOW_MS);
  const since = sub.last_window_end && sub.last_window_end > floor ? sub.last_window_end : floor;
  const counts = await (deps.counts ?? digestCounts)(db, identity, since, now);
  const policyHash = digestPolicyHash(mode);
  const key = digestIdempotencyKey(identity, sub.day);
  const claimed = await db.query(
    `INSERT INTO digest_deliveries(workspace_id,tenant_id,user_id,day,idempotency_key,policy_hash,window_start,window_end,counts)
     VALUES($1,$2,$3,$4::date,$5,$6,$7,$8,$9::jsonb) ON CONFLICT DO NOTHING`,
    [...ids, sub.day, key, policyHash, since, now, JSON.stringify(counts)],
  );
  let outcome: SubscriberOutcome;
  let payloadHash: string | null = null;
  if (!claimed.rowCount) outcome = "not_due";
  else if (isEmptyDigest(counts)) outcome = "skipped_empty";
  else {
    const message = (deps.compose ?? composeDigest)(counts);
    try {
      const result = await (deps.deliver ?? deliverDigest)(message, { recipient: sub.recipient, mode, idempotencyKey: key, policyHash });
      outcome = result.outcome;
      payloadHash = result.payloadHash;
    } catch {
      outcome = "failed";
    }
  }
  if (claimed.rowCount)
    await db.query(
      "UPDATE digest_deliveries SET outcome=$5, payload_hash=$6, updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2 AND user_id=$3 AND day=$4::date",
      [...ids, sub.day, outcome, payloadHash],
    );
  await db.query(
    "UPDATE digest_subscriptions SET last_day=$4::date, last_window_end=$5, updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2 AND user_id=$3",
    [...ids, sub.day, now],
  );
  return outcome;
}

export type DigestPassResult = {
  due: number;
  simulated: number;
  sent: number;
  skippedEmpty: number;
  refused: number;
  failed: number;
  errors: number;
};
export type DigestPassDeps = DigestDeps & {
  discover?: (limit: number) => Promise<Identity[]>;
  run?: (identity: Identity, fn: (db: PoolClient) => Promise<SubscriberOutcome>) => Promise<SubscriberOutcome>;
  clock?: () => Date;
  limit?: number;
};

/** Ids only. Runs as the runtime role with no tenant context. */
export async function discoverDueDigests(limit: number): Promise<Identity[]> {
  return transaction(async (db) =>
    (
      await db.query<{ tenant_id: string; workspace_id: string; user_id: string }>(
        "SELECT tenant_id,workspace_id,user_id FROM orbis_digest_due_subscriptions($1)",
        [limit],
      )
    ).rows.map((r) => ({ tenantId: r.tenant_id, workspaceId: r.workspace_id, userId: r.user_id })),
  );
}

/** One daily pass over every due subscription. Counts only in the result. */
export async function runDigestPass(deps: DigestPassDeps = {}): Promise<DigestPassResult> {
  const result: DigestPassResult = { due: 0, simulated: 0, sent: 0, skippedEmpty: 0, refused: 0, failed: 0, errors: 0 };
  const due = await (deps.discover ?? discoverDueDigests)(deps.limit ?? 200);
  result.due = due.length;
  const run = deps.run ?? scoped;
  for (const identity of due) {
    try {
      const outcome = await run(identity, (db) => runDigestForSubscriber(db, identity, (deps.clock ?? (() => new Date()))(), deps));
      if (outcome === "simulated") result.simulated++;
      else if (outcome === "sent") result.sent++;
      else if (outcome === "skipped_empty") result.skippedEmpty++;
      else if (outcome === "refused") result.refused++;
      else if (outcome === "failed") result.failed++;
    } catch {
      result.errors++;
    }
  }
  return result;
}
