import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { workspaceBudgetAllows } from "@/lib/inbox/store";
import type { ModelUsage } from "@/lib/runtime/inbox-replies";
import { planCandidate, type CandidateFact } from "./candidates";
import { FACT_COLUMNS, factFromRow, type Fact, type FactRow } from "./facts";
import { matchQuestion } from "./questions";

/*
 * PostgreSQL helpers of the company brain. Every function runs inside a
 * tenant-scoped transaction (worker `scoped()` or `withWorkspaceRequest`), and
 * every query also filters on workspace_id/tenant_id on top of FORCE RLS.
 */
export type Ids = { workspaceId: string; tenantId: string };
const p = (ids: Ids) => [ids.workspaceId, ids.tenantId];

/** Same monthly cap as tasks/inbox; records the reservation in brain_usage. */
export async function reserveBrainBudget(
  db: PoolClient,
  ids: Ids,
  kind: "extract" | "explain_edit" | "regenerate",
  refId: string,
  cents: number,
) {
  if (!(await workspaceBudgetAllows(db, ids, cents))) return null;
  const id = randomUUID();
  await db.query(
    "INSERT INTO brain_usage(id,workspace_id,tenant_id,kind,ref_id,est_cost_cents) VALUES($1,$2,$3,$4,$5,$6)",
    [id, ...p(ids), kind, refId, cents],
  );
  return id;
}
export async function addBrainUsage(db: PoolClient, ids: Ids, usageId: string, usage: ModelUsage) {
  await db.query(
    "UPDATE brain_usage SET input_tokens=input_tokens+$4, output_tokens=output_tokens+$5 WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
    [usageId, ...p(ids), usage.inputTokens, usage.outputTokens],
  );
}

export async function loadFacts(db: PoolClient, ids: Ids, where = "") {
  const { rows } = await db.query<FactRow>(
    `SELECT ${FACT_COLUMNS} FROM brain_facts WHERE workspace_id=$1 AND tenant_id=$2 ${where} ORDER BY evidence_at DESC NULLS LAST, created_at DESC LIMIT 500`,
    p(ids),
  );
  return rows.map(factFromRow);
}
/** Approved, unexpired facts: the only brain facts that reach reply drafting. */
export const loadActiveFacts = (db: PoolClient, ids: Ids) =>
  loadFacts(db, ids, "AND status='approved' AND (valid_until IS NULL OR valid_until>now())");

/** Insert/merge validated candidates. Never sets status 'approved'. */
export async function saveCandidates(
  db: PoolClient,
  ids: Ids,
  candidates: CandidateFact[],
  meta: { jobId?: string; actor: string },
) {
  const counts = { inserted: 0, merged: 0, skipped: 0 };
  if (!candidates.length) return counts;
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `orbis-brain-facts:${ids.workspaceId}`,
  ]);
  const existing: Fact[] = await loadFacts(db, ids);
  const now = new Date().toISOString();
  for (const c of candidates) {
    const plan = planCandidate(c, existing);
    if (plan.action === "skip") {
      counts.skipped++;
      continue;
    }
    if (plan.action === "merge") {
      await db.query(
        "UPDATE brain_facts SET quotes=$4::jsonb, evidence_at=$5, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
        [plan.factId, ...p(ids), JSON.stringify(plan.quotes), plan.evidenceAt],
      );
      const target = existing.find((f) => f.id === plan.factId);
      if (target) Object.assign(target, { quotes: plan.quotes, evidenceAt: plan.evidenceAt });
      counts.merged++;
      continue;
    }
    const id = randomUUID();
    await db.query(
      `INSERT INTO brain_facts(id,workspace_id,tenant_id,category,topic_key,statement,status,origin,quotes,evidence_at,confidence,job_id,inbox_message_id,history,created_by)
       VALUES($1,$2,$3,$4,$5,$6,'candidate',$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb,$14)`,
      [
        id,
        ...p(ids),
        c.category,
        c.topicKey,
        c.statement,
        c.origin,
        JSON.stringify(c.quotes),
        c.evidenceAt,
        c.confidence,
        meta.jobId ?? null,
        c.inboxMessageId ?? null,
        JSON.stringify([{ at: now, actor: meta.actor, status: "candidate", statement: c.statement }]),
        meta.actor,
      ],
    );
    existing.push({
      id,
      category: c.category,
      topicKey: c.topicKey,
      statement: c.statement,
      condition: null,
      status: "candidate",
      origin: c.origin,
      quotes: c.quotes,
      evidenceAt: c.evidenceAt,
      confidence: c.confidence,
      validUntil: null,
      questionId: null,
      version: 1,
      reviewedAt: null,
      createdAt: now,
    });
    counts.inserted++;
  }
  return counts;
}

/**
 * Answered questions whose fact is no longer active (rejected, superseded
 * without replacement, expired) are open again.
 */
export async function reopenOrphanedQuestions(db: PoolClient, ids: Ids) {
  const r = await db.query(
    `UPDATE brain_questions q SET status='open', updated_at=now()
     WHERE q.workspace_id=$1 AND q.tenant_id=$2 AND q.status='answered' AND NOT EXISTS (
       SELECT 1 FROM brain_facts f WHERE f.id=q.answered_fact_id AND f.workspace_id=q.workspace_id AND f.tenant_id=q.tenant_id
       AND f.status='approved' AND (f.valid_until IS NULL OR f.valid_until>now()))`,
    p(ids),
  );
  return r.rowCount ?? 0;
}

type QuestionRow = { id: string; canonical_key: string; status: string };
/**
 * Register the questions raised by one draft. A question matching an existing
 * one (same or similar canonical key) is the SAME question: occurrence counted,
 * draft linked, status unchanged — an answered question is never asked again.
 */
export async function recordDraftQuestions(
  db: PoolClient,
  ids: Ids,
  inboxMessageId: string,
  questions: { canonicalKey: string; label: string }[],
) {
  const result = { created: 0, matched: 0, alreadyAnswered: 0 };
  if (!questions.length) return result;
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `orbis-brain-questions:${ids.workspaceId}`,
  ]);
  await reopenOrphanedQuestions(db, ids);
  const existing = (
    await db.query<QuestionRow>(
      "SELECT id,canonical_key,status FROM brain_questions WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY last_seen_at DESC LIMIT 1000",
      p(ids),
    )
  ).rows.map((r) => ({ ...r, canonicalKey: r.canonical_key }));
  for (const q of questions) {
    const match = matchQuestion(q.canonicalKey, existing);
    let questionId: string;
    if (match) {
      questionId = match.id;
      await db.query(
        "UPDATE brain_questions SET occurrences=occurrences+1, last_seen_at=now(), updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
        [match.id, ...p(ids)],
      );
      if (match.status === "answered") result.alreadyAnswered++;
      else result.matched++;
    } else {
      questionId = randomUUID();
      await db.query(
        `INSERT INTO brain_questions(id,workspace_id,tenant_id,canonical_key,label) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(workspace_id,canonical_key) DO UPDATE SET occurrences=brain_questions.occurrences+1, last_seen_at=now(), updated_at=now()`,
        [questionId, ...p(ids), q.canonicalKey, q.label],
      );
      const stored = (
        await db.query<{ id: string }>(
          "SELECT id FROM brain_questions WHERE workspace_id=$1 AND tenant_id=$2 AND canonical_key=$3",
          [...p(ids), q.canonicalKey],
        )
      ).rows[0];
      questionId = stored?.id ?? questionId;
      existing.push({ id: questionId, canonical_key: q.canonicalKey, canonicalKey: q.canonicalKey, status: "open" });
      result.created++;
    }
    await db.query(
      "INSERT INTO brain_question_messages(workspace_id,tenant_id,question_id,inbox_message_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [...p(ids), questionId, inboxMessageId],
    );
  }
  return result;
}

/** Owner text of approved/candidate facts is not needed for this: ids only. */
export async function enqueueExtraction(
  db: PoolClient,
  ids: Ids & { userId: string },
  input: {
    provider: "gmail" | "outlook";
    connectedAccountId: string;
    mode: "test" | "scoped_autonomy";
    requestKey: string;
  },
) {
  const pending = await db.query(
    "SELECT 1 FROM brain_jobs WHERE workspace_id=$1 AND tenant_id=$2 AND kind='extract_sent' AND status IN ('queued','running') LIMIT 1",
    p(ids),
  );
  if (pending.rowCount) return null;
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO brain_jobs(id,workspace_id,tenant_id,created_by,request_key,kind,provider,connected_account_id,mode,window_days,max_messages)
     VALUES($1,$2,$3,$4,$5,'extract_sent',$6,$7,$8,90,200) ON CONFLICT(workspace_id,request_key) DO NOTHING RETURNING id`,
    [
      randomUUID(),
      ...p(ids),
      ids.userId,
      input.requestKey,
      input.provider,
      input.connectedAccountId,
      input.mode,
    ],
  );
  return inserted.rows[0]?.id ?? null;
}
