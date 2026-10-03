import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { inboxMode } from "@/lib/inbox/service";
import { monthlyCapCents } from "@/lib/inbox/store";
import { PlatformError } from "@/lib/platform/auth";
import { workspaceContext } from "@/lib/platform/context";
import { currentEntitlement } from "@/lib/billing/entitlements-store";
import { blockMessage, brainJobBlock } from "@/lib/billing/entitlements";
import {
  CATEGORY_LABELS,
  factCategories,
  factConflicts,
  isActive,
  type Fact,
  type FactCategory,
} from "./facts";
import { questionTokens } from "./questions";
import { enqueueExtraction, loadFacts, reopenOrphanedQuestions, type Ids } from "./store";
import { topicKey } from "./text";

/*
 * Session-scoped company brain API. Tenant/workspace/user come from
 * withWorkspaceRequest; every query also filters on them; FORCE RLS enforces it.
 * Facts become "approved" only here, from an explicit owner/admin action.
 */
function context() {
  const ctx = workspaceContext();
  if (!ctx?.db || ctx.closed)
    throw new PlatformError("Company sheet requires an authenticated database workspace", 503);
  return { ...ctx, db: ctx.db };
}
type Ctx = ReturnType<typeof context>;
const idsOf = (ctx: Ctx): Ids => ({ workspaceId: ctx.workspaceId, tenantId: ctx.tenantId });
const p = (ctx: Ctx) => [ctx.workspaceId, ctx.tenantId];
const lockFacts = (db: PoolClient, workspaceId: string) =>
  db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `orbis-brain-facts:${workspaceId}`,
  ]);

export const factReviewSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    /** Edited statement (approve only). */
    statement: z.string().trim().min(3).max(400).optional(),
    expectedVersion: z.number().int().min(1),
  })
  .strict();
export const answerSchema = z
  .object({
    answer: z.string().trim().min(1).max(400),
    /** « Ça dépend » : the answer is conditional text. */
    conditional: z.boolean().default(false),
  })
  .strict();
export const regenerationSchema = z
  .object({ inboxMessageId: z.string().uuid() })
  .strict();

type JobView = {
  id: string;
  status: string;
  stats: Record<string, unknown>;
  created_at: Date;
  completed_at: Date | null;
  error: string | null;
};
export async function brainOverview() {
  const ctx = context();
  const facts = await loadFacts(ctx.db, idsOf(ctx));
  const conflicts = factConflicts(facts);
  const conflictOf = new Map<string, string>();
  for (const [key, list] of conflicts) for (const id of list) conflictOf.set(id, key);
  const job = (
    await ctx.db.query<JobView>(
      "SELECT id,status,stats,created_at,completed_at,error FROM brain_jobs WHERE workspace_id=$1 AND tenant_id=$2 AND kind='extract_sent' ORDER BY created_at DESC LIMIT 1",
      p(ctx),
    )
  ).rows[0];
  const profile = ctx.state.profile;
  const now = new Date();
  return {
    categories: factCategories.map((c) => ({ id: c, label: CATEGORY_LABELS[c] })),
    facts: facts.map((f) => ({
      ...f,
      active: isActive(f, now),
      conflictKey: conflictOf.get(f.id) ?? null,
    })),
    counts: {
      candidates: facts.filter((f) => f.status === "candidate").length,
      approved: facts.filter((f) => isActive(f, now)).length,
      conflicts: conflicts.size,
    },
    profile:
      profile && profile.tenantId === ctx.tenantId
        ? {
            name: profile.name,
            website: profile.website,
            summary: profile.summary,
            claims: profile.claims
              .filter((c) => c.kind === "fact")
              .map((c) => ({ label: c.label, value: c.value, sourceUrl: c.sourceUrl })),
          }
        : null,
    extraction: job
      ? {
          id: job.id,
          status: job.status,
          stats: job.stats,
          createdAt: job.created_at.toISOString(),
          completedAt: job.completed_at?.toISOString(),
          error: job.error ?? undefined,
        }
      : null,
    canReview: ctx.role === "owner" || ctx.role === "admin",
  };
}

/** Manual re-run of the sent-mail extraction for the first-run mailbox. */
export async function requestExtraction(requestKey: string) {
  const ctx = context();
  if (!/^[A-Za-z0-9_\-:.]{8,120}$/.test(requestKey))
    throw new PlatformError("Idempotency-Key of 8–120 safe characters required", 400);
  if (!monthlyCapCents())
    throw new PlatformError("Configurez un budget mensuel avant de lancer la lecture.", 503);
  const account = (
    await ctx.db.query<{ provider: "gmail" | "outlook"; connected_account_id: string }>(
      "SELECT provider,connected_account_id FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 AND kind='first_run' AND status IN ('completed','quota_reached') ORDER BY completed_at DESC NULLS LAST LIMIT 1",
      p(ctx),
    )
  ).rows[0];
  if (!account)
    throw new PlatformError("Connectez d’abord votre boîte mail et lancez un premier passage.", 409);
  // Plan gate (402): no extraction model call on an expired/unpaid/canceled plan.
  const extractBlock = brainJobBlock(await currentEntitlement(ctx.db, idsOf(ctx)), "extract_sent");
  if (extractBlock) throw new PlatformError(blockMessage(extractBlock), 402);
  const id = await enqueueExtraction(
    ctx.db,
    { ...idsOf(ctx), userId: ctx.userId },
    {
      provider: account.provider,
      connectedAccountId: account.connected_account_id,
      mode: inboxMode(),
      requestKey: `extract:manual:${requestKey}`,
    },
  );
  if (!id) throw new PlatformError("Une lecture est déjà en cours.", 409);
  return { id, status: "queued" };
}

async function supersedeTopic(ctx: Ctx, fact: { id: string; category: string; topic_key: string }) {
  const superseded = await ctx.db.query<{ id: string }>(
    `UPDATE brain_facts SET status='superseded', updated_at=now(),
       history=history || jsonb_build_array(jsonb_build_object('at',now(),'actor',$5::text,'status','superseded'))
     WHERE workspace_id=$1 AND tenant_id=$2 AND category=$3 AND topic_key=$4 AND id<>$6 AND status IN ('candidate','approved') RETURNING id`,
    [...p(ctx), fact.category, fact.topic_key, ctx.userId, fact.id],
  );
  const ids = superseded.rows.map((r) => r.id);
  // Questions answered by a replaced fact are now answered by the new one.
  if (ids.length)
    await ctx.db.query(
      "UPDATE brain_questions SET answered_fact_id=$3, updated_at=now() WHERE workspace_id=$1 AND tenant_id=$2 AND answered_fact_id = ANY($4::text[])",
      [...p(ctx), fact.id, ids],
    );
  return ids.length;
}

/** Approve (optionally edited) or reject one fact. Optimistic version check. */
export async function reviewFact(id: string, input: z.infer<typeof factReviewSchema>) {
  const ctx = context();
  await lockFacts(ctx.db, ctx.workspaceId);
  const row = (
    await ctx.db.query<{ id: string; status: string; version: number; category: string; topic_key: string; statement: string }>(
      "SELECT id,status,version,category,topic_key,statement FROM brain_facts WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 FOR UPDATE",
      [id, ...p(ctx)],
    )
  ).rows[0];
  if (!row) throw new PlatformError("Fait introuvable.", 404);
  if (row.version !== input.expectedVersion)
    throw new PlatformError("Ce fait a changé entre-temps. Rechargez la page.", 409);
  if (input.action === "approve" && row.status !== "candidate")
    throw new PlatformError("Seul un fait à valider peut être validé.", 409);
  if (input.action === "reject" && !["candidate", "approved"].includes(row.status))
    throw new PlatformError("Ce fait est déjà écarté.", 409);
  if (input.action === "reject") {
    if (input.statement) throw new PlatformError("Une modification s’accompagne d’une validation.", 400);
    // Data minimization: a rejected fact keeps no quote of the owner's mail.
    await ctx.db.query(
      `UPDATE brain_facts SET status='rejected', quotes='[]'::jsonb, reviewed_by=$4, reviewed_at=now(), version=version+1, updated_at=now(),
         history=history || jsonb_build_array(jsonb_build_object('at',now(),'actor',$4::text,'status','rejected'))
       WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3`,
      [id, ...p(ctx), ctx.userId],
    );
    const reopened = await reopenOrphanedQuestions(ctx.db, idsOf(ctx));
    return { id, status: "rejected", reopenedQuestions: reopened };
  }
  const statement = input.statement ?? row.statement;
  await ctx.db.query(
    `UPDATE brain_facts SET status='approved', statement=$4, reviewed_by=$5, reviewed_at=now(), version=version+1, updated_at=now(),
       history=history || jsonb_build_array(jsonb_build_object('at',now(),'actor',$5::text,'status',$6::text,'statement',$4::text))
     WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3`,
    [id, ...p(ctx), statement, ctx.userId, input.statement && input.statement !== row.statement ? "approved_edited" : "approved"],
  );
  const superseded = await supersedeTopic(ctx, row);
  return { id, status: "approved", superseded };
}

function categoryFor(tokens: string[]): FactCategory {
  const has = (...words: string[]) => words.some((w) => tokens.includes(w));
  if (has("prix", "devis", "remise")) return "pricing";
  if (has("delai", "disponibilite", "date", "livraison")) return "lead_time";
  if (has("zone", "deplacement", "intervention", "ville", "km")) return "service_area";
  if (has("acompte", "garantie", "paiement", "reglement", "conditions", "annulation")) return "terms";
  if (has("horaire")) return "hours";
  return "other";
}

type QuestionRow = {
  id: string;
  label: string;
  canonical_key: string;
  status: string;
  occurrences: number;
  last_seen_at: Date;
  draft_links: string;
};
/** Open questions (an answered question whose fact is no longer active counts as open). */
export async function openQuestions(ctx: Ctx = context(), limit = 10) {
  const where = `q.workspace_id=$1 AND q.tenant_id=$2 AND (q.status='open' OR (q.status='answered' AND NOT EXISTS (
      SELECT 1 FROM brain_facts f WHERE f.id=q.answered_fact_id AND f.workspace_id=q.workspace_id AND f.tenant_id=q.tenant_id
      AND f.status='approved' AND (f.valid_until IS NULL OR f.valid_until>now()))))`;
  const total = (
    await ctx.db.query<{ n: string }>(`SELECT count(*)::text AS n FROM brain_questions q WHERE ${where}`, p(ctx))
  ).rows[0];
  const rows = (
    await ctx.db.query<QuestionRow>(
      `SELECT q.id,q.label,q.canonical_key,q.status,q.occurrences,q.last_seen_at,
         (SELECT count(*) FROM brain_question_messages qm WHERE qm.question_id=q.id AND qm.workspace_id=q.workspace_id AND qm.tenant_id=q.tenant_id)::text AS draft_links
       FROM brain_questions q WHERE ${where} ORDER BY q.occurrences DESC, q.last_seen_at DESC LIMIT $3`,
      [...p(ctx), limit],
    )
  ).rows;
  return {
    count: Number(total?.n ?? 0),
    questions: rows.map((r) => ({
      id: r.id,
      label: r.label,
      occurrences: r.occurrences,
      drafts: Number(r.draft_links),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
    })),
  };
}

type AffectedRow = {
  id: string;
  subject_preview: string | null;
  drafted_at: Date | null;
  draft_state: string;
  outcome: string | null;
  regen_status: string | null;
  regen_draft_state: string | null;
};
/**
 * Drafts that asked a now-answered question and were not sent yet: "nouvelle
 * info disponible". Regeneration is offered, never automatic.
 */
export async function draftsWithNewInfo(ctx: Ctx = context(), limit = 10) {
  const rows = (
    await ctx.db.query<AffectedRow>(
      `SELECT DISTINCT ON (m.id) m.id, m.subject_preview, m.drafted_at, m.draft_state, o.outcome,
         j.status AS regen_status, j.draft_state AS regen_draft_state
       FROM brain_question_messages qm
       JOIN brain_questions q ON q.id=qm.question_id AND q.workspace_id=qm.workspace_id AND q.tenant_id=qm.tenant_id
       JOIN inbox_messages m ON m.id=qm.inbox_message_id AND m.workspace_id=qm.workspace_id AND m.tenant_id=qm.tenant_id
       LEFT JOIN brain_draft_outcomes o ON o.inbox_message_id=m.id AND o.workspace_id=m.workspace_id AND o.tenant_id=m.tenant_id
       LEFT JOIN LATERAL (SELECT status, draft_state FROM brain_jobs b WHERE b.inbox_message_id=m.id AND b.workspace_id=m.workspace_id AND b.tenant_id=m.tenant_id ORDER BY b.created_at DESC LIMIT 1) j ON true
       WHERE qm.workspace_id=$1 AND qm.tenant_id=$2 AND q.status='answered' AND q.answered_at > m.drafted_at
         AND m.status='drafted' AND m.draft_state IN ('created','simulated')
         AND m.drafted_at > now()-interval '14 days'
         AND (o.outcome IS NULL OR o.outcome='pending')
       ORDER BY m.id, m.drafted_at DESC LIMIT $3`,
      [...p(ctx), limit],
    )
  ).rows;
  return rows.map((r) => ({
    inboxMessageId: r.id,
    subjectPreview: r.subject_preview ?? undefined,
    draftedAt: r.drafted_at?.toISOString(),
    simulated: r.draft_state === "simulated",
    regeneration: r.regen_status
      ? { status: r.regen_status, draftState: r.regen_draft_state ?? "none" }
      : undefined,
  }));
}

/** Answer once → approved fact (source = this answer, dated) → never asked again. */
export async function answerQuestion(id: string, input: z.infer<typeof answerSchema>) {
  const ctx = context();
  await lockFacts(ctx.db, ctx.workspaceId);
  const q = (
    await ctx.db.query<{ id: string; label: string; canonical_key: string; status: string }>(
      "SELECT id,label,canonical_key,status FROM brain_questions WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 FOR UPDATE",
      [id, ...p(ctx)],
    )
  ).rows[0];
  if (!q) throw new PlatformError("Question introuvable.", 404);
  await reopenOrphanedQuestions(ctx.db, idsOf(ctx));
  const current = (
    await ctx.db.query<{ status: string }>(
      "SELECT status FROM brain_questions WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
      [id, ...p(ctx)],
    )
  ).rows[0];
  if (current?.status !== "open") throw new PlatformError("Cette question n’est plus ouverte.", 409);
  const category = categoryFor(questionTokens(q.label));
  const topic = topicKey(q.canonical_key);
  const factId = randomUUID();
  const statement = input.conditional ? `${q.label} : ça dépend` : `${q.label} : ${input.answer}`;
  await ctx.db.query(
    `INSERT INTO brain_facts(id,workspace_id,tenant_id,category,topic_key,statement,condition,status,origin,quotes,evidence_at,confidence,question_id,history,created_by,reviewed_by,reviewed_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,'approved','question_answer','[]'::jsonb,now(),1,$8,
       jsonb_build_array(jsonb_build_object('at',now(),'actor',$9::text,'status','approved','statement',$6::text)),$9,$9,now())`,
    [factId, ...p(ctx), category, topic, statement.slice(0, 400), input.conditional ? input.answer : null, q.id, ctx.userId],
  );
  await supersedeTopic(ctx, { id: factId, category, topic_key: topic });
  await ctx.db.query(
    "UPDATE brain_questions SET status='answered', answered_fact_id=$4, answered_by=$5, answered_at=now(), updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
    [q.id, ...p(ctx), factId, ctx.userId],
  );
  return {
    questionId: q.id,
    factId,
    category: category satisfies Fact["category"],
    affectedDrafts: await draftsWithNewInfo(ctx),
  };
}

export async function dismissQuestion(id: string) {
  const ctx = context();
  const r = await ctx.db.query(
    "UPDATE brain_questions SET status='dismissed', updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND status='open'",
    [id, ...p(ctx)],
  );
  if (!r.rowCount) throw new PlatformError("Question introuvable ou déjà traitée.", 404);
  return { id, status: "dismissed" };
}

/**
 * Explicit, one-click regeneration: queues a job that creates a NEW draft in
 * the same thread. The previous Orbis draft stays in the mailbox (deleting is
 * not allowed by the mailbox policy); the UI says so.
 */
export async function requestRegeneration(inboxMessageId: string) {
  const ctx = context();
  const row = (
    await ctx.db.query<{ id: string; provider: "gmail" | "outlook"; connected_account_id: string; status: string; draft_state: string }>(
      "SELECT id,provider,connected_account_id,status,draft_state FROM inbox_messages WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
      [inboxMessageId, ...p(ctx)],
    )
  ).rows[0];
  if (!row || row.status !== "drafted" || !["created", "simulated"].includes(row.draft_state))
    throw new PlatformError("Brouillon introuvable.", 404);
  if (!monthlyCapCents()) throw new PlatformError("Configurez un budget mensuel d’abord.", 503);
  // A regeneration is a new draft: same plan gate and draft quota as inbox drafts (402).
  const regenBlock = brainJobBlock(await currentEntitlement(ctx.db, idsOf(ctx)), "regenerate_draft");
  if (regenBlock) throw new PlatformError(blockMessage(regenBlock), 402);
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `orbis-brain-regen:${inboxMessageId}`,
  ]);
  const prior = (
    await ctx.db.query<{ n: string; pending: string }>(
      "SELECT count(*)::text AS n, count(*) FILTER (WHERE status IN ('queued','running'))::text AS pending FROM brain_jobs WHERE workspace_id=$1 AND tenant_id=$2 AND kind='regenerate_draft' AND inbox_message_id=$3",
      [...p(ctx), inboxMessageId],
    )
  ).rows[0];
  if (Number(prior?.pending ?? 0) > 0) throw new PlatformError("Un nouveau brouillon est déjà en préparation.", 409);
  if (Number(prior?.n ?? 0) >= 3) throw new PlatformError("Trois nouveaux brouillons ont déjà été préparés pour ce message.", 409);
  const id = randomUUID();
  await ctx.db.query(
    `INSERT INTO brain_jobs(id,workspace_id,tenant_id,created_by,request_key,kind,provider,connected_account_id,mode,window_days,max_messages,inbox_message_id)
     VALUES($1,$2,$3,$4,$5,'regenerate_draft',$6,$7,$8,1,1,$9)`,
    [id, ...p(ctx), ctx.userId, `regen:${inboxMessageId}:${Number(prior?.n ?? 0) + 1}`, row.provider, row.connected_account_id, inboxMode(), inboxMessageId],
  );
  return {
    id,
    status: "queued",
    notice:
      "Orbi prépare un nouveau brouillon dans la même conversation. L’ancien brouillon reste dans votre boîte : supprimez-le vous-même si besoin.",
  };
}
