import { randomUUID } from "node:crypto";
import { track } from "@/lib/analytics/events";
import { recordTaskCharge } from "@/lib/billing/task-ledger";
import { PlatformError } from "@/lib/platform/auth";
import { workspaceContext } from "@/lib/platform/context";
import { contextSnapshot } from "@/lib/runtime/agent-engine";
import { contracts } from "@/lib/runtime/contracts";
import { getTaskQuote } from "@/lib/billing/task-quote";
import { businessWorkflows } from "@/lib/workflows/blueprints";
import {
  digest,
  publicTask,
  type EnqueueInput,
  type TaskInput,
  type TaskRow,
} from "./domain";

function context() {
  const ctx = workspaceContext();
  if (!ctx?.db || ctx.closed)
    throw new PlatformError(
      "Durable operations require an authenticated database workspace",
      503,
    );
  return { ...ctx, db: ctx.db };
}
export function quoteFor(missionId: string, workflowId: string) {
  const ctx = context();
  const mission = ctx.state.missions.find(
    (m) => m.id === missionId && m.tenantId === ctx.tenantId,
  );
  if (!mission) throw new PlatformError("Mission not found", 404);
  if (
    !Object.hasOwn(contracts, mission.packageSlug) ||
    !businessWorkflows.some((w) => w.id === workflowId)
  )
    throw new PlatformError(
      "Choose a supported read-only package and workflow",
      400,
    );
  return getTaskQuote({
    workflowId,
    taskId: `read-only:${mission.packageSlug}`,
  });
}
export async function enqueue(input: EnqueueInput, requestKey: string) {
  const ctx = context();
  if (!requestKey.trim() || requestKey.length > 200)
    throw new PlatformError(
      "Idempotency-Key of 1–200 characters required",
      400,
    );
  const requestHash = digest(input);
  const prior = await ctx.db.query<TaskRow>(
    "SELECT * FROM operational_tasks WHERE workspace_id=$1 AND tenant_id=$2 AND request_key=$3",
    [ctx.workspaceId, ctx.tenantId, requestKey],
  );
  if (prior.rows[0]) {
    if (prior.rows[0].request_hash !== requestHash)
      throw new PlatformError(
        "Idempotency key already used for a different request",
        409,
      );
    return publicTask(prior.rows[0]);
  }
  const quote = quoteFor(input.missionId, input.workflowId);
  const mode =
    process.env.ORBIS_TASK_BILLING_ENABLED === "true"
      ? "pay_per_task"
      : "preview";
  if (input.expectedBillingMode !== mode)
    throw new PlatformError("Billing terms changed. Review a new quote.", 409);
  if (
    quote.totalCents !== input.expectedTotalCents ||
    quote.rateVersion !== input.expectedRateVersion
  )
    throw new PlatformError(
      "Quote changed; review the current quote before enqueueing",
      409,
    );
  const cap = Number(process.env.ORBIS_OPERATIONS_MONTHLY_CAP_CENTS);
  if (!Number.isSafeInteger(cap) || cap <= 0)
    throw new PlatformError(
      "Configure a task budget before enabling execution",
      503,
    );
  const spend = await ctx.db.query<{ reserved: string }>(
    "SELECT COALESCE(sum(total_cents),0)::text AS reserved FROM operational_tasks WHERE workspace_id=$1 AND tenant_id=$2 AND (status IN ('queued','running','needs_review') OR (status='completed' AND completed_at>=date_trunc('month',now())))",
    [ctx.workspaceId, ctx.tenantId],
  );
  if (Number(spend.rows[0]?.reserved ?? 0) + quote.totalCents > cap)
    throw new PlatformError(
      "Monthly task budget reached. Resolve pending work or increase the approved budget.",
      409,
    );
  const snapshot = contextSnapshot(ctx.state, input.missionId);
  if (
    !snapshot.sources.length ||
    snapshot.sources.some((s) => s.kind === "fixture")
  )
    throw new PlatformError(
      "Select ready, non-fixture evidence before enqueueing",
      400,
    );
  const taskInput: TaskInput = {
    billingMode: mode,
    missionId: input.missionId,
    packageSlug: snapshot.mission.packageSlug,
    contextHash: snapshot.hash,
    text: input.text,
    objective: snapshot.version.outcome,
    instructions: snapshot.version.instructions,
    rules: snapshot.instructions.map((i) => i.body),
    memory: snapshot.memory.map((m) => m.body),
    sources: snapshot.sources,
  };
  if (JSON.stringify(taskInput).length > 65000)
    throw new PlatformError("Evidence context exceeds 65,000 characters", 400);
  const result = await ctx.db.query<TaskRow>(
    `INSERT INTO operational_tasks
    (id,workspace_id,tenant_id,created_by,request_key,request_hash,workflow_id,task_id,title,input,quote,total_cents,baseline_minutes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)
    ON CONFLICT(workspace_id,request_key) DO NOTHING RETURNING *`,
    [
      randomUUID(),
      ctx.workspaceId,
      ctx.tenantId,
      ctx.userId,
      requestKey,
      requestHash,
      input.workflowId,
      quote.taskId,
      `${snapshot.mission.name} · read-only preparation`,
      JSON.stringify(taskInput),
      JSON.stringify(quote),
      quote.totalCents,
      input.baselineMinutes ?? null,
    ],
  );
  if (!result.rows[0]) return enqueue(input, requestKey);
  await track("task_queued", {
    task_id: result.rows[0].id,
    workflow_id: input.workflowId,
    amount_cents: quote.totalCents,
    baseline_minutes: input.baselineMinutes,
  });
  return publicTask(result.rows[0]);
}
export async function listTasks() {
  const ctx = context();
  const rows = (
    await ctx.db.query<TaskRow>(
      "SELECT * FROM operational_tasks WHERE workspace_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 200",
      [ctx.workspaceId, ctx.tenantId],
    )
  ).rows;
  return {
    tasks: rows.map(publicTask),
    contributionEvents: rows
      .filter((row) => row.status === "completed")
      .map((row) => ({
        id: `accepted:${row.id}`,
        tenantId: ctx.tenantId,
        kind: "accepted_work",
        occurredAt: row.completed_at!.toISOString(),
        title: row.title,
        proofHref: `/tasks/${encodeURIComponent(row.id)}`,
      })),
    limit: 200,
  };
}
export async function getTask(id: string) {
  const ctx = context();
  const row = (
    await ctx.db.query<TaskRow>(
      "SELECT * FROM operational_tasks WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
      [id, ctx.workspaceId, ctx.tenantId],
    )
  ).rows[0];
  if (!row) throw new PlatformError("Task not found", 404);
  return publicTask(row);
}
export async function decideTask(
  id: string,
  decision: "accept" | "reject" | "cancel",
  reviewToken?: string,
) {
  const ctx = context();
  const row = (
    await ctx.db.query<TaskRow>(
      "SELECT * FROM operational_tasks WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 FOR UPDATE",
      [id, ctx.workspaceId, ctx.tenantId],
    )
  ).rows[0];
  if (!row) throw new PlatformError("Task not found", 404);
  if (decision === "accept" && reviewToken !== publicTask(row).reviewToken)
    throw new PlatformError(
      "Review this exact result and price before accepting",
      409,
    );
  if (decision === "accept" && row.status === "completed")
    return publicTask(row);
  if (decision === "cancel" && row.status === "cancelled")
    return publicTask(row);
  if (decision === "accept" || decision === "reject") {
    if (row.status !== "needs_review")
      throw new PlatformError("Only a ready result can be reviewed", 409);
  } else if (!["queued", "running", "needs_review"].includes(row.status))
    throw new PlatformError("Task is already terminal", 409);
  if (decision === "accept") {
    let freshHash: string | undefined;
    try {
      freshHash = contextSnapshot(ctx.state, row.input.missionId).hash;
    } catch {
      /* removed mission */
    }
    if (freshHash !== row.input.contextHash)
      throw new PlatformError(
        "Evidence or mission changed; prepare a new task before accepting",
        409,
      );
    if (
      !row.output?.checks.length ||
      row.output.checks.some((c) => c.status !== "pass")
    )
      throw new PlatformError("Evidence checks must pass", 409);
    await ctx.db.query(
      `INSERT INTO operational_acceptances(task_id,workspace_id,tenant_id,accepted_by,total_cents)
      VALUES($1,$2,$3,$4,$5)`,
      [row.id, ctx.workspaceId, ctx.tenantId, ctx.userId, row.total_cents],
    );
    await recordTaskCharge(row);
  }
  const status =
    decision === "accept"
      ? "completed"
      : decision === "reject"
        ? "failed"
        : "cancelled";
  const result = await ctx.db.query<TaskRow>(
    `UPDATE operational_tasks SET status=$4, lease_token=NULL, lease_until=NULL,
    completed_at=CASE WHEN $4='completed' THEN now() ELSE NULL END,
    accepted_by=CASE WHEN $4='completed' THEN $5 ELSE NULL END,
    error=CASE WHEN $4='failed' THEN 'Result rejected by reviewer; not billable.' ELSE NULL END
    WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 RETURNING *`,
    [id, ctx.workspaceId, ctx.tenantId, status, ctx.userId],
  );
  await track(
    decision === "accept"
      ? "task_accepted"
      : decision === "reject"
        ? "task_rejected"
        : "task_cancelled",
    {
      task_id: id,
      workflow_id: row.workflow_id,
      amount_cents: decision === "accept" ? row.total_cents : 0,
    },
  );
  return publicTask(result.rows[0]);
}
