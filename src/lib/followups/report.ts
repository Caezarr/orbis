import type { PoolClient } from "pg";
import { formatLocalDate, parisMidnight, parisWeek, type LocalDate } from "./calendar";

/*
 * Level 8: weekly report from MEASURED events only. Every number comes from a
 * row with a timestamp in the week; nothing is extrapolated. The only estimate
 * (time) exists when the owner entered a manual baseline and is labelled so.
 */
export type ReportInput = {
  received: number;
  classified: Record<string, number>;
  draftsInbox: number;
  draftsRegenerated: number;
  followupsPrepared: number;
  outcomes: { sent_as_is: number; sent_edited: number; not_used: number; pending: number };
  questionsAnswered: number;
  factsValidated: number;
  requestsNew: number;
  won: number;
  lost: number;
  /** Requests received this week: first owner reply delay in ms, null when unknown. */
  responseDelaysMs: (number | null)[];
  replyBaselineMinutes: number | null;
};
export type WeeklyReport = {
  week: { start: string; end: string; monday: string };
  emails: { received: number; classified: number; byClass: Record<string, number> };
  drafts: { prepared: number; inbox: number; regenerated: number; followups: number };
  outcomes: ReportInput["outcomes"] & { measured: number; asIsRate: number | null };
  questionsAnswered: number;
  factsValidated: number;
  requests: { new: number; won: number; lost: number };
  responseTime: { medianMinutes: number | null; measured: number; total: number; coverage: number | null };
  estimate: null | { minutes: number; baselineMinutes: number; basis: number; label: string };
  /** Owner's manual baseline (minutes per reply), null when not entered. */
  baselineMinutes: number | null;
};

export function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 1000 : null);

export function computeReport(input: ReportInput, week: { start: Date; end: Date; monday: LocalDate }): WeeklyReport {
  const classified = Object.values(input.classified).reduce((a, b) => a + b, 0);
  const known = input.responseDelaysMs.filter((v): v is number => v !== null && v >= 0);
  const med = median(known);
  const measured = input.outcomes.sent_as_is + input.outcomes.sent_edited + input.outcomes.not_used;
  return {
    week: { start: week.start.toISOString(), end: week.end.toISOString(), monday: formatLocalDate(week.monday) },
    emails: { received: input.received, classified, byClass: input.classified },
    drafts: {
      prepared: input.draftsInbox + input.draftsRegenerated + input.followupsPrepared,
      inbox: input.draftsInbox,
      regenerated: input.draftsRegenerated,
      followups: input.followupsPrepared,
    },
    outcomes: { ...input.outcomes, measured, asIsRate: ratio(input.outcomes.sent_as_is, measured) },
    questionsAnswered: input.questionsAnswered,
    factsValidated: input.factsValidated,
    requests: { new: input.requestsNew, won: input.won, lost: input.lost },
    responseTime: {
      medianMinutes: med === null ? null : Math.round(med / 60_000),
      measured: known.length,
      total: input.responseDelaysMs.length,
      coverage: ratio(known.length, input.responseDelaysMs.length),
    },
    baselineMinutes: input.replyBaselineMinutes,
    // Only drafts measured as sent unchanged count; edited ones are not credited.
    estimate:
      input.replyBaselineMinutes && input.outcomes.sent_as_is > 0
        ? {
            minutes: input.outcomes.sent_as_is * input.replyBaselineMinutes,
            baselineMinutes: input.replyBaselineMinutes,
            basis: input.outcomes.sent_as_is,
            label: `Estimation : ${input.outcomes.sent_as_is} brouillon(s) envoyé(s) tel(s) quel(s) × votre référence de ${input.replyBaselineMinutes} min par réponse.`,
          }
        : null,
  };
}

/** Week containing `at`, or the week starting on a given Monday (Paris). */
export function reportWeek(at: Date, monday?: LocalDate) {
  return parisWeek(monday ? parisMidnight(monday) : at);
}

type Db = Pick<PoolClient, "query">;
const n = (v: unknown) => Number(v ?? 0);
/** Loads the measured counts of one week for the session workspace (RLS context required). */
export async function loadReportInput(
  db: Db,
  ids: { workspaceId: string; tenantId: string },
  week: { start: Date; end: Date },
  baseline: number | null,
): Promise<ReportInput> {
  const args = [ids.workspaceId, ids.tenantId, week.start, week.end];
  const inbox = (
    await db.query<Record<string, string>>(
      `SELECT
        count(*) FILTER (WHERE received_at>=$3 AND received_at<$4)::text AS received,
        count(*) FILTER (WHERE received_at>=$3 AND received_at<$4 AND classification='customer_request')::text AS customer_request,
        count(*) FILTER (WHERE received_at>=$3 AND received_at<$4 AND classification='quote_request')::text AS quote_request,
        count(*) FILTER (WHERE received_at>=$3 AND received_at<$4 AND classification='supplier')::text AS supplier,
        count(*) FILTER (WHERE received_at>=$3 AND received_at<$4 AND classification='admin')::text AS admin,
        count(*) FILTER (WHERE received_at>=$3 AND received_at<$4 AND classification='noise')::text AS noise,
        count(*) FILTER (WHERE draft_state IN ('created','simulated') AND drafted_at>=$3 AND drafted_at<$4)::text AS drafts
       FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 AND (received_at>=$3 OR drafted_at>=$3)`,
      args,
    )
  ).rows[0] ?? {};
  const one = async (sql: string) => n((await db.query<{ n: string }>(sql, args)).rows[0]?.n);
  const regenerated = await one(
    "SELECT count(*)::text AS n FROM brain_jobs WHERE workspace_id=$1 AND tenant_id=$2 AND kind='regenerate_draft' AND draft_state IN ('created','simulated') AND drafted_at>=$3 AND drafted_at<$4",
  );
  const followups = await one(
    "SELECT count(*)::text AS n FROM followups WHERE workspace_id=$1 AND tenant_id=$2 AND draft_state IN ('created','simulated') AND drafted_at>=$3 AND drafted_at<$4",
  );
  const outcomes = (
    await db.query<Record<string, string>>(
      `SELECT count(*) FILTER (WHERE outcome='sent_as_is')::text AS sent_as_is, count(*) FILTER (WHERE outcome='sent_edited')::text AS sent_edited,
        count(*) FILTER (WHERE outcome='not_used')::text AS not_used,
        count(*) FILTER (WHERE outcome='pending')::text AS pending
       FROM brain_draft_outcomes WHERE workspace_id=$1 AND tenant_id=$2 AND ((decided_at>=$3 AND decided_at<$4) OR (outcome='pending' AND checked_at>=$3 AND checked_at<$4))`,
      args,
    )
  ).rows[0] ?? {};
  const questionsAnswered = await one(
    "SELECT count(*)::text AS n FROM brain_questions WHERE workspace_id=$1 AND tenant_id=$2 AND answered_at>=$3 AND answered_at<$4",
  );
  // Facts the owner reviewed and approved this week (answers to questions are counted above).
  const factsValidated = await one(
    "SELECT count(*)::text AS n FROM brain_facts WHERE workspace_id=$1 AND tenant_id=$2 AND reviewed_at>=$3 AND reviewed_at<$4 AND status IN ('approved','superseded') AND reviewed_by IS NOT NULL AND origin<>'question_answer'",
  );
  const items = (
    await db.query<{ first_customer_at: Date | null; first_replied_at: Date | null }>(
      "SELECT first_customer_at,first_replied_at FROM pipeline_items WHERE workspace_id=$1 AND tenant_id=$2 AND first_customer_at>=$3 AND first_customer_at<$4",
      args,
    )
  ).rows;
  const closed = (
    await db.query<{ won: string; lost: string }>(
      "SELECT count(*) FILTER (WHERE status='gagne')::text AS won, count(*) FILTER (WHERE status='perdu')::text AS lost FROM pipeline_items WHERE workspace_id=$1 AND tenant_id=$2 AND closed_at>=$3 AND closed_at<$4",
      args,
    )
  ).rows[0];
  return {
    received: n(inbox.received),
    classified: {
      customer_request: n(inbox.customer_request),
      quote_request: n(inbox.quote_request),
      supplier: n(inbox.supplier),
      admin: n(inbox.admin),
      noise: n(inbox.noise),
    },
    draftsInbox: n(inbox.drafts),
    draftsRegenerated: regenerated,
    followupsPrepared: followups,
    outcomes: {
      sent_as_is: n(outcomes.sent_as_is),
      sent_edited: n(outcomes.sent_edited),
      not_used: n(outcomes.not_used),
      pending: n(outcomes.pending),
    },
    questionsAnswered,
    factsValidated,
    requestsNew: items.length,
    won: n(closed?.won),
    lost: n(closed?.lost),
    responseDelaysMs: items.map((i) =>
      i.first_customer_at && i.first_replied_at
        ? new Date(i.first_replied_at).getTime() - new Date(i.first_customer_at).getTime()
        : null,
    ),
    replyBaselineMinutes: baseline,
  };
}
