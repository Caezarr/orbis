import type { PoolClient } from "pg";
import { transaction } from "@/lib/platform/db";

/*
 * Cross-tenant retention purge (migration 012, `orbis_retention_purge` +
 * `orbis_rate_limit_purge`). The definer roles only see rows already past
 * `purge_after` and only null the short-lived columns:
 *  - inbox subject/draft previews (30 days), brain regeneration previews (30 days),
 *    follow-up previews/questions (30 days);
 *  - request contacts (name, email, domain, need, budget, deadline): 24 months
 *    after the last activity;
 *  - rate-limit windows expired for more than a day.
 * The workers already purge their own workspace on each run; this job covers
 * workspaces that no longer run anything.
 */
export type RetentionResult = {
  inbox_previews: number;
  brain_previews: number;
  followup_previews: number;
  request_contacts: number;
  rate_limit_windows: number;
};

export async function runRetentionPurge(run: <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T> = transaction) {
  return run(async (db) => {
    const purge = (await db.query<{ result: Omit<RetentionResult, "rate_limit_windows"> }>("SELECT orbis_retention_purge() AS result"))
      .rows[0]?.result;
    const windows = Number((await db.query<{ n: number }>("SELECT orbis_rate_limit_purge() AS n")).rows[0]?.n ?? 0);
    return {
      inbox_previews: Number(purge?.inbox_previews ?? 0),
      brain_previews: Number(purge?.brain_previews ?? 0),
      followup_previews: Number(purge?.followup_previews ?? 0),
      request_contacts: Number(purge?.request_contacts ?? 0),
      rate_limit_windows: windows,
    } satisfies RetentionResult;
  });
}
