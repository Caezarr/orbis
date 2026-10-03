import { z } from "zod";
import { inboxMode } from "@/lib/inbox/service";
import { DEMO_MAILBOX_PAGE, demoMailboxActive } from "@/lib/integrations/demo-mailbox/guard";
import { PlatformError } from "@/lib/platform/auth";
import { workspaceContext } from "@/lib/platform/context";
import { parseLocalDate } from "./calendar";
import { PIPELINE_STATUSES, STATUS_LABELS, type PipelineStatus } from "./detect";
import { computeReport, loadReportInput, reportWeek, type WeeklyReport } from "./report";
import { loadPipelineSettings } from "./store";

/*
 * Session-scoped API of levels 6–8 (« Demandes », follow-ups, weekly report).
 * Tenant/workspace/user come from withWorkspaceRequest; every query also
 * filters on them; FORCE RLS enforces it. Only the workspace's own data.
 */
function context() {
  const ctx = workspaceContext();
  if (!ctx?.db || ctx.closed) throw new PlatformError("Requests require an authenticated database workspace", 503);
  return { ...ctx, db: ctx.db };
}
type Ctx = ReturnType<typeof context>;
const p = (ctx: Ctx) => [ctx.workspaceId, ctx.tenantId];

export const listSchema = z
  .object({
    status: z.enum(PIPELINE_STATUSES as [PipelineStatus, ...PipelineStatus[]]).optional(),
    kind: z.enum(["customer_request", "quote_request"]).optional(),
    q: z.string().trim().max(80).optional(),
    followup: z.enum(["ready", "any"]).optional(),
  })
  .strict();
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("won") }).strict(),
  z.object({ action: z.literal("lost") }).strict(),
  z.object({ action: z.literal("reopen") }).strict(),
  z.object({ action: z.literal("snooze"), days: z.number().int().min(1).max(60) }).strict(),
  z.object({ action: z.literal("dismiss_followups") }).strict(),
  z.object({ action: z.literal("resume_followups") }).strict(),
  z.object({ action: z.literal("erase_contact") }).strict(),
]);
export const settingsSchema = z
  .object({
    followupsEnabled: z.boolean(),
    businessDays: z.number().int().min(1).max(30),
    maxStages: z.number().int().min(1).max(2),
    replyBaselineMinutes: z.number().int().min(1).max(240).nullable(),
  })
  .strict();

type ItemRow = {
  id: string;
  kind: string;
  status: PipelineStatus;
  contact_name: string | null;
  contact_email: string | null;
  contact_domain: string | null;
  contact_erased_at: Date | null;
  need_summary: string | null;
  budget_text: string | null;
  deadline_text: string | null;
  extraction_state: string;
  first_customer_at: Date | null;
  first_replied_at: Date | null;
  last_owner_at: Date | null;
  last_customer_at: Date | null;
  awaiting_customer: boolean;
  snoozed_until: Date | null;
  followups_dismissed: boolean;
  closed_at: Date | null;
  thread_id: string;
  provider: "gmail" | "outlook";
  drafts: number;
  followups: { id: string; stage: number; status: string; drafted_at: string | null; draft_preview: string | null; questions: string[]; flags: string[]; simulated: boolean }[] | null;
};
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
export type RequestView = ReturnType<typeof publicItem>;
function publicItem(r: ItemRow) {
  return {
    id: r.id,
    kind: r.kind as "customer_request" | "quote_request",
    status: r.status,
    statusLabel: STATUS_LABELS[r.status],
    contact: r.contact_erased_at ? null : { name: r.contact_name, email: r.contact_email, domain: r.contact_domain },
    need: r.need_summary,
    budget: r.budget_text,
    deadline: r.deadline_text,
    extraction: r.extraction_state,
    receivedAt: iso(r.first_customer_at),
    firstRepliedAt: iso(r.first_replied_at),
    lastOwnerAt: iso(r.last_owner_at),
    lastCustomerAt: iso(r.last_customer_at),
    awaitingCustomer: r.awaiting_customer,
    snoozedUntil: iso(r.snoozed_until),
    followupsDismissed: r.followups_dismissed,
    closedAt: iso(r.closed_at),
    drafts: Number(r.drafts ?? 0),
    openUrl: demoMailboxActive()
      ? DEMO_MAILBOX_PAGE
      : r.provider === "gmail"
        ? `https://mail.google.com/mail/#all/${encodeURIComponent(r.thread_id)}`
        : "https://outlook.office.com/mail/",
    followups: (r.followups ?? []).map((f) => ({
      id: f.id,
      stage: f.stage,
      status: f.status,
      draftedAt: iso(f.drafted_at),
      preview: f.draft_preview,
      questions: f.questions ?? [],
      flags: f.flags ?? [],
      simulated: f.simulated,
    })),
  };
}
const ITEM_SELECT = `SELECT i.id,i.kind,i.status,i.contact_name,i.contact_email,i.contact_domain,i.contact_erased_at,i.need_summary,i.budget_text,i.deadline_text,
  i.extraction_state,i.first_customer_at,i.first_replied_at,i.last_owner_at,i.last_customer_at,i.awaiting_customer,i.snoozed_until,i.followups_dismissed,
  i.closed_at,i.thread_id,i.provider,
  (SELECT count(*) FROM inbox_messages m WHERE m.workspace_id=i.workspace_id AND m.tenant_id=i.tenant_id AND m.connected_account_id=i.connected_account_id
     AND m.thread_id=i.thread_id AND m.draft_state IN ('created','simulated'))::int AS drafts,
  (SELECT jsonb_agg(jsonb_build_object('id',f.id,'stage',f.stage,'status',f.status,'drafted_at',f.drafted_at,'draft_preview',f.draft_preview,
     'questions',f.questions,'flags',f.flags,'simulated',f.draft_state='simulated') ORDER BY f.stage)
   FROM followups f WHERE f.pipeline_item_id=i.id AND f.workspace_id=i.workspace_id AND f.tenant_id=i.tenant_id) AS followups
  FROM pipeline_items i`;

export async function listRequests(filters: z.infer<typeof listSchema>) {
  const ctx = context();
  const args: unknown[] = p(ctx);
  const where = ["i.workspace_id=$1", "i.tenant_id=$2"];
  if (filters.status) where.push(`i.status=$${args.push(filters.status)}`);
  if (filters.kind) where.push(`i.kind=$${args.push(filters.kind)}`);
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const k = args.push(like);
    where.push(`(i.contact_name ILIKE $${k} OR i.contact_email ILIKE $${k} OR i.need_summary ILIKE $${k})`);
  }
  if (filters.followup === "ready")
    where.push(
      "EXISTS (SELECT 1 FROM followups f WHERE f.pipeline_item_id=i.id AND f.workspace_id=i.workspace_id AND f.tenant_id=i.tenant_id AND f.status IN ('drafted','needs_review') AND (i.last_owner_at IS NULL OR f.drafted_at IS NULL OR i.last_owner_at<f.drafted_at)) AND i.status NOT IN ('gagne','perdu')",
    );
  const rows = (
    await ctx.db.query<ItemRow>(`${ITEM_SELECT} WHERE ${where.join(" AND ")} ORDER BY i.first_customer_at DESC NULLS LAST, i.created_at DESC LIMIT 200`, args)
  ).rows;
  const counts = (
    await ctx.db.query<{ status: PipelineStatus; n: string }>(
      "SELECT status,count(*)::text AS n FROM pipeline_items WHERE workspace_id=$1 AND tenant_id=$2 GROUP BY status",
      p(ctx),
    )
  ).rows;
  return {
    items: rows.map(publicItem),
    counts: Object.fromEntries(PIPELINE_STATUSES.map((s) => [s, Number(counts.find((c) => c.status === s)?.n ?? 0)])),
    settings: await loadPipelineSettings(ctx.db, { workspaceId: ctx.workspaceId, tenantId: ctx.tenantId }),
    mode: inboxMode(),
    canEdit: ["owner", "admin", "operator"].includes(ctx.role),
    canAdmin: ctx.role === "owner" || ctx.role === "admin",
  };
}

/** Owner decisions on one request. Gagné/perdu are manual only. */
export async function requestAction(id: string, input: z.infer<typeof actionSchema>) {
  const ctx = context();
  if (input.action === "erase_contact" && ctx.role !== "owner" && ctx.role !== "admin")
    throw new PlatformError("Seul le propriétaire ou un administrateur peut effacer un contact.", 403);
  const args = [id, ...p(ctx), ctx.userId];
  const sql: Record<typeof input.action, string> = {
    won: "UPDATE pipeline_items SET status='gagne', closed_at=now(), closed_by=$4, next_check_at=NULL, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
    lost: "UPDATE pipeline_items SET status='perdu', closed_at=now(), closed_by=$4, next_check_at=NULL, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
    reopen:
      "UPDATE pipeline_items SET status=CASE WHEN relance_at IS NOT NULL THEN 'relance' WHEN first_replied_at IS NOT NULL THEN 'repondu' ELSE 'nouveau' END, closed_at=NULL, closed_by=NULL, next_check_at=now(), updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND status IN ('gagne','perdu') AND $4::text IS NOT NULL",
    snooze: `UPDATE pipeline_items SET snoozed_until=now() + make_interval(days => $5::int), next_check_at=now() + make_interval(days => $5::int), updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND status NOT IN ('gagne','perdu') AND $4::text IS NOT NULL`,
    dismiss_followups: "UPDATE pipeline_items SET followups_dismissed=true, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND $4::text IS NOT NULL",
    resume_followups: "UPDATE pipeline_items SET followups_dismissed=false, snoozed_until=NULL, next_check_at=now(), updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND status NOT IN ('gagne','perdu') AND $4::text IS NOT NULL",
    erase_contact:
      "UPDATE pipeline_items SET contact_name=NULL, contact_email=NULL, need_summary=NULL, budget_text=NULL, deadline_text=NULL, contact_erased_at=now(), next_check_at=NULL, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND $4::text IS NOT NULL",
  };
  const result = await ctx.db.query(sql[input.action], input.action === "snooze" ? [...args, input.days] : args);
  if (!result.rowCount) throw new PlatformError("Demande introuvable ou action impossible dans son état actuel.", 404);
  if (input.action === "dismiss_followups" || input.action === "won" || input.action === "lost" || input.action === "erase_contact")
    // Proposed follow-ups that produced no draft are closed; drafts already in the mailbox stay there.
    await ctx.db.query(
      "UPDATE followups SET status='dismissed', updated_at=now() WHERE pipeline_item_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND draft_state='none' AND status IN ('drafting','failed','not_needed')",
      [id, ...p(ctx)],
    );
  if (input.action === "erase_contact")
    await ctx.db.query(
      "UPDATE followups SET draft_preview=NULL, questions='[]'::jsonb, updated_at=now() WHERE pipeline_item_id=$1 AND workspace_id=$2 AND tenant_id=$3",
      [id, ...p(ctx)],
    );
  const row = (await ctx.db.query<ItemRow>(`${ITEM_SELECT} WHERE i.id=$1 AND i.workspace_id=$2 AND i.tenant_id=$3`, [id, ...p(ctx)])).rows[0];
  return publicItem(row!);
}

/** CSV cell: quoted, with spreadsheet formula injection neutralized. */
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export const CSV_COLUMNS = [
  "date_reception",
  "statut",
  "type",
  "contact_nom",
  "contact_email",
  "besoin",
  "budget",
  "delai",
  "premiere_reponse",
  "brouillons",
  "relances_preparees",
] as const;
export async function exportRequestsCsv() {
  const { items } = await listRequests({});
  const lines = [CSV_COLUMNS.join(",")];
  for (const i of items)
    lines.push(
      [
        i.receivedAt,
        i.statusLabel,
        i.kind === "quote_request" ? "Devis" : "Demande",
        i.contact?.name,
        i.contact?.email,
        i.need,
        i.budget,
        i.deadline,
        i.firstRepliedAt,
        i.drafts,
        i.followups.filter((f) => f.draftedAt).length,
      ]
        .map(csvCell)
        .join(","),
    );
  // BOM so Excel opens UTF-8 accents correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

export async function pipelineSettings() {
  const ctx = context();
  return loadPipelineSettings(ctx.db, { workspaceId: ctx.workspaceId, tenantId: ctx.tenantId });
}
export async function savePipelineSettings(input: z.infer<typeof settingsSchema>) {
  const ctx = context();
  await ctx.db.query(
    `INSERT INTO pipeline_settings(workspace_id,tenant_id,followups_enabled,followup_business_days,followup_max_stages,reply_baseline_minutes,updated_by)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(workspace_id) DO UPDATE SET followups_enabled=EXCLUDED.followups_enabled, followup_business_days=EXCLUDED.followup_business_days,
       followup_max_stages=EXCLUDED.followup_max_stages, reply_baseline_minutes=EXCLUDED.reply_baseline_minutes, updated_by=EXCLUDED.updated_by, updated_at=now()
     WHERE pipeline_settings.tenant_id=$2`,
    [...p(ctx), input.followupsEnabled, input.businessDays, input.maxStages, input.replyBaselineMinutes, ctx.userId],
  );
  return pipelineSettings();
}

export async function weeklyReport(monday?: string, now = new Date()): Promise<WeeklyReport & { previous: WeeklyReport }> {
  const ctx = context();
  const date = monday ? parseLocalDate(monday) : null;
  if (monday && !date) throw new PlatformError("Semaine invalide.", 400);
  const ids = { workspaceId: ctx.workspaceId, tenantId: ctx.tenantId };
  const settings = await loadPipelineSettings(ctx.db, ids);
  const week = reportWeek(now, date ?? undefined);
  // Previous week = the Paris week containing (start − 1 h): DST-safe.
  const previous = reportWeek(new Date(week.start.getTime() - 3_600_000));
  const [current, before] = [
    computeReport(await loadReportInput(ctx.db, ids, week, settings.replyBaselineMinutes), week),
    computeReport(await loadReportInput(ctx.db, ids, previous, settings.replyBaselineMinutes), previous),
  ];
  return { ...current, previous: before };
}

/** Today card: this week's measured counts + follow-ups waiting for review. */
export async function todaySummary(now = new Date()) {
  const ctx = context();
  const ids = { workspaceId: ctx.workspaceId, tenantId: ctx.tenantId };
  const settings = await loadPipelineSettings(ctx.db, ids);
  const week = reportWeek(now);
  const report = computeReport(await loadReportInput(ctx.db, ids, week, settings.replyBaselineMinutes), week);
  const ready = Number(
    (
      await ctx.db.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM followups f JOIN pipeline_items i ON i.id=f.pipeline_item_id AND i.workspace_id=f.workspace_id AND i.tenant_id=f.tenant_id
         WHERE f.workspace_id=$1 AND f.tenant_id=$2 AND f.status IN ('drafted','needs_review') AND i.status NOT IN ('gagne','perdu')
           AND (i.last_owner_at IS NULL OR f.drafted_at IS NULL OR i.last_owner_at<f.drafted_at)`,
        p(ctx),
      )
    ).rows[0]?.n ?? 0,
  );
  const open = Number(
    (
      await ctx.db.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM pipeline_items WHERE workspace_id=$1 AND tenant_id=$2 AND status IN ('nouveau','repondu','relance')",
        p(ctx),
      )
    ).rows[0]?.n ?? 0,
  );
  return { report, followupsReady: ready, openRequests: open };
}
