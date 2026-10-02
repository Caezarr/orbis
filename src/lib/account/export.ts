import type { PoolClient } from "pg";
import type { StoreState } from "@/lib/domain/types";
import { createZip, type ZipEntry } from "./zip";

/*
 * GDPR export of the session workspace's own data (owner/admin), as a ZIP of
 * JSON files plus CSV versions of the tabular parts. Read inside the request's
 * RLS context (withWorkspaceRequest): explicit workspace/tenant filters on top.
 *
 * Contents: workspace + members, confirmed company profile and workspace
 * snapshot data, company-sheet facts and questions, request pipeline and
 * follow-ups, inbox batches and drafts METADATA (classification, states,
 * dates, our draft previews while retained), weekly report data, billing
 * status (plan, subscription status, trial). Never exported: provider tokens
 * or secrets (held by Composio/Stripe, never by Orbis), inbound email bodies
 * (never stored), idempotency/payload hashes, lease tokens.
 */

type Db = Pick<PoolClient, "query">;
export type ExportIds = { workspaceId: string; tenantId: string };
export type ExportSection = { name: string; rows: Record<string, unknown>[] };

const SECTIONS: { name: string; table: string; sql: string }[] = [
  {
    name: "members",
    table: "memberships",
    sql: "SELECT user_id, name, email, role, created_at FROM memberships WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY created_at",
  },
  {
    name: "company_facts",
    table: "brain_facts",
    sql: "SELECT id, category, topic_key, statement, condition, status, origin, quotes, evidence_at, confidence, valid_until, reviewed_at, created_at, updated_at FROM brain_facts WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY created_at",
  },
  {
    name: "questions",
    table: "brain_questions",
    sql: "SELECT id, label, status, occurrences, answered_fact_id, answered_at, first_seen_at, last_seen_at FROM brain_questions WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY first_seen_at",
  },
  {
    name: "requests",
    table: "pipeline_items",
    sql: "SELECT id, provider, thread_id, kind, contact_name, contact_email, contact_domain, contact_erased_at, need_summary, budget_text, deadline_text, status, first_customer_at, last_customer_at, first_replied_at, last_owner_at, relance_at, snoozed_until, followups_dismissed, closed_at, created_at, updated_at, purge_after FROM pipeline_items WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY created_at",
  },
  {
    name: "followups",
    table: "followups",
    sql: "SELECT id, pipeline_item_id, stage, status, owner_message_at, due_at, reason, draft_state, drafted_at, draft_preview, questions, created_at, purge_after FROM followups WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY created_at",
  },
  {
    name: "request_settings",
    table: "pipeline_settings",
    sql: "SELECT followups_enabled, followup_business_days, followup_max_stages, reply_baseline_minutes, updated_at FROM pipeline_settings WHERE workspace_id=$1 AND tenant_id=$2",
  },
  {
    name: "inbox_batches",
    table: "inbox_batches",
    sql: "SELECT id, kind, provider, mode, window_days, max_messages, max_drafts, status, stats, created_at, started_at, completed_at FROM inbox_batches WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY created_at",
  },
  {
    name: "drafts",
    table: "inbox_messages",
    sql: "SELECT id, batch_id, provider, thread_id, received_at, status, classification, skip_reason, flags, subject_preview, draft_preview, questions, citations, draft_state, draft_id, drafted_at, created_at, purge_after FROM inbox_messages WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY created_at",
  },
  {
    name: "inbox_settings",
    table: "inbox_settings",
    sql: "SELECT continuous_enabled, provider, interval_minutes, next_run_at, enabled_at, updated_at FROM inbox_settings WHERE workspace_id=$1 AND tenant_id=$2",
  },
  {
    name: "billing_trial",
    table: "billing_trials",
    sql: "SELECT started_at, ends_at, draft_limit, config_version FROM billing_trials WHERE workspace_id=$1 AND tenant_id=$2",
  },
  {
    name: "billing_subscription",
    table: "stripe_subscriptions",
    sql: "SELECT plan, status, current_period_start, current_period_end, cancel_at_period_end, updated_at FROM stripe_subscriptions WHERE tenant_id=$2 AND $1::text IS NOT NULL",
  },
];

export async function collectWorkspaceExport(db: Db, ids: ExportIds): Promise<ExportSection[]> {
  const out: ExportSection[] = [];
  for (const section of SECTIONS) {
    const exists = (await db.query<{ r: string | null }>("SELECT to_regclass($1) AS r", [`public.${section.table}`])).rows[0]?.r;
    if (!exists) continue;
    const rows = (await db.query<Record<string, unknown>>(section.sql, [ids.workspaceId, ids.tenantId])).rows;
    out.push({ name: section.name, rows });
  }
  return out;
}

/** Same formula-injection protection as the requests CSV export. */
export function csvCell(value: unknown) {
  if (value === null || value === undefined) return '""';
  const raw =
    value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "﻿";
  const columns = Object.keys(rows[0]);
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

const CSV_SECTIONS = new Set(["company_facts", "questions", "requests", "followups", "drafts"]);

export function buildExportArchive(input: {
  exportedAt: Date;
  workspace: StoreState["workspace"];
  profile: StoreState["profile"];
  snapshot: Partial<StoreState>;
  sections: ExportSection[];
  report?: unknown;
  entitlement?: unknown;
}) {
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
  const entries: ZipEntry[] = [
    {
      name: "README.txt",
      content: [
        "Export Orbis — données de votre espace de travail",
        `Date : ${input.exportedAt.toISOString()}`,
        "",
        "Contenu : profil de l'entreprise, membres, fiche entreprise (faits et questions), demandes et relances,",
        "lots et métadonnées des brouillons (aperçus conservés 30 jours), rapport hebdomadaire, état de l'abonnement.",
        "Non inclus : le corps des e-mails reçus (jamais stocké par Orbis), les jetons d'accès (détenus par",
        "Composio et Stripe), les empreintes techniques d'idempotence.",
        "Les fichiers .json sont la référence ; les .csv reprennent les tableaux (UTF-8 avec BOM).",
        "",
      ].join("\n"),
    },
    { name: "workspace.json", content: json({ workspace: input.workspace, profile: input.profile }) },
    { name: "workspace-snapshot.json", content: json(input.snapshot) },
  ];
  for (const section of input.sections) {
    entries.push({ name: `${section.name}.json`, content: json(section.rows) });
    if (CSV_SECTIONS.has(section.name)) entries.push({ name: `${section.name}.csv`, content: toCsv(section.rows) });
  }
  if (input.report !== undefined) entries.push({ name: "weekly-report.json", content: json(input.report) });
  if (input.entitlement !== undefined) entries.push({ name: "billing-status.json", content: json(input.entitlement) });
  return createZip(entries, input.exportedAt);
}

/** Workspace snapshot fields worth exporting (never secrets: sources keep references only). */
export function snapshotForExport(state: StoreState): Partial<StoreState> {
  return {
    missions: state.missions,
    missionVersions: state.missionVersions,
    sources: state.sources,
    instructions: state.instructions,
    memory: state.memory,
    artifacts: state.artifacts,
    evaluations: state.evaluations,
    usage: state.usage,
    audit: state.audit,
  };
}
