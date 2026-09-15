import { createHash } from "node:crypto";
import { workspaceContext } from "@/lib/platform/context";
import { PlatformError } from "@/lib/platform/auth";
import type { TaskRow } from "@/lib/operations/domain";
import { proposedPlans } from "./rates";
import { stripe, appUrl } from "./stripe";
function context() {
  const ctx = workspaceContext();
  if (!ctx?.db)
    throw new PlatformError("Connected billing workspace required.", 503);
  return { ...ctx, db: ctx.db };
}
export type PaymentReservation = {
  id: string;
  customer_id: string;
  amount_cents: number;
  created_at: string;
  task_count: number;
  tenant_id: string;
  workspace_id: string;
};
export async function recordTaskCharge(row: TaskRow) {
  const ctx = context();
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `task-billing:${ctx.tenantId}`,
  ]);
  let disposition = "preview",
    due = 0,
    period: string | null = null;
  if (row.input.billingMode === "pay_per_task") {
    disposition = "payable";
    due = row.total_cents;
    const sub = (
      await ctx.db.query(
        "SELECT plan,current_period_start,current_period_end FROM stripe_subscriptions WHERE tenant_id=$1 AND status='active' AND current_period_start<=now() AND current_period_end>now()",
        [ctx.tenantId],
      )
    ).rows[0];
    if (sub) {
      period = new Date(sub.current_period_start).toISOString();
      const allowance =
        sub.plan === "Solo"
          ? proposedPlans.soloIncludedTasks
          : sub.plan === "Business"
            ? proposedPlans.businessIncludedTasks
            : 0;
      const used = (
        await ctx.db.query(
          "SELECT count(*)::integer AS count FROM task_charges WHERE tenant_id=$1 AND workspace_id=$2 AND period_key=$3 AND disposition='included'",
          [ctx.tenantId, ctx.workspaceId, period],
        )
      ).rows[0].count;
      if (used < allowance) {
        disposition = "included";
        due = 0;
      }
    }
  }
  await ctx.db.query(
    "INSERT INTO task_charges(task_id,tenant_id,workspace_id,quoted_cents,due_cents,disposition,period_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(task_id) DO NOTHING",
    [
      row.id,
      ctx.tenantId,
      ctx.workspaceId,
      row.total_cents,
      due,
      disposition,
      period,
    ],
  );
}
export async function taskLedger() {
  const ctx = context();
  const { rows } = await ctx.db.query(
    `SELECT c.task_id,t.title,c.quoted_cents,c.due_cents,c.disposition,c.created_at,b.status AS payment_status
 FROM task_charges c JOIN operational_tasks t ON t.id=c.task_id LEFT JOIN task_payment_batches b ON b.id=c.batch_id AND b.tenant_id=c.tenant_id AND b.workspace_id=c.workspace_id
 WHERE c.tenant_id=$1 AND c.workspace_id=$2 ORDER BY c.created_at DESC LIMIT 100`,
    [ctx.tenantId, ctx.workspaceId],
  );
  const total = (
    await ctx.db.query(
      `SELECT COALESCE(sum(c.due_cents),0)::integer AS due FROM task_charges c LEFT JOIN task_payment_batches b ON b.id=c.batch_id WHERE c.tenant_id=$1 AND c.workspace_id=$2 AND c.disposition='payable' AND (b.id IS NULL OR b.status IN ('open','expired'))`,
      [ctx.tenantId, ctx.workspaceId],
    )
  ).rows[0].due;
  return {
    items: rows,
    dueCents: total,
    canPay: ["owner", "admin"].includes(ctx.role),
    enabled: process.env.ORBIS_TASK_BILLING_ENABLED === "true",
  };
}
export async function payTasks(expectedCents: number) {
  const ctx = context();
  if (process.env.ORBIS_TASK_BILLING_ENABLED !== "true")
    throw new PlatformError("Task payment is not enabled.", 409);
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `task-billing:${ctx.tenantId}`,
  ]);
  const pending = (
    await ctx.db.query(
      "SELECT * FROM task_payment_batches WHERE tenant_id=$1 AND workspace_id=$2 AND status IN ('open','pending') ORDER BY created_at LIMIT 1 FOR UPDATE",
      [ctx.tenantId, ctx.workspaceId],
    )
  ).rows[0];
  if (pending) {
    if (!pending.session_id)
      return {
        reservation: {
          ...pending,
          created_at: new Date(pending.created_at).toISOString(),
          task_count: 0,
        } as PaymentReservation,
      };
    if (pending.status === "pending")
      throw new PlatformError(
        "Your previous payment is processing. Wait for confirmation before paying again.",
        409,
      );
    // Provider is authoritative even when the webhook has not arrived.
    const session = await stripe().checkout.sessions.retrieve(
      pending.session_id,
    );
    if (session.payment_status === "paid" || session.status === "complete")
      throw new PlatformError(
        "Payment is being confirmed. Refresh billing shortly.",
        409,
      );
    if (session.status === "open") return { url: session.url };
    await ctx.db.query(
      "UPDATE task_payment_batches SET status='expired' WHERE id=$1 AND tenant_id=$2",
      [pending.id, ctx.tenantId],
    );
  }
  const rows = (
    await ctx.db.query(
      `SELECT c.* FROM task_charges c LEFT JOIN task_payment_batches b ON b.id=c.batch_id WHERE c.tenant_id=$1 AND c.workspace_id=$2 AND c.disposition='payable' AND (c.batch_id IS NULL OR b.status='expired') ORDER BY c.task_id FOR UPDATE OF c`,
      [ctx.tenantId, ctx.workspaceId],
    )
  ).rows;
  const amount = rows.reduce((n, r) => n + r.due_cents, 0);
  if (!amount || amount !== expectedCents)
    throw new PlatformError(
      "Balance changed. Refresh and review the current amount.",
      409,
    );
  if (amount < 50)
    throw new PlatformError(
      "Your balance is below the minimum payment of €0.50.",
      409,
    );
  const api = stripe();
  const mapping = (
    await ctx.db.query(
      "SELECT stripe_customer_id FROM stripe_customers WHERE tenant_id=$1",
      [ctx.tenantId],
    )
  ).rows[0];
  let customer = mapping?.stripe_customer_id;
  if (!customer) {
    customer = (
      await api.customers.create(
        { metadata: { tenant_id: ctx.tenantId } },
        { idempotencyKey: `orbis-customer:${ctx.tenantId}` },
      )
    ).id;
    await ctx.db.query(
      "INSERT INTO stripe_customers(tenant_id,stripe_customer_id) VALUES($1,$2)",
      [ctx.tenantId, customer],
    );
  }
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        tenant: ctx.tenantId,
        rows: rows.map((r) => [r.task_id, r.due_cents, r.batch_id]),
      }),
    )
    .digest("hex");
  const batchId = `tasks_${digest}`;
  const prior = (
    await ctx.db.query("SELECT id FROM task_payment_batches WHERE id=$1", [
      batchId,
    ])
  ).rows[0];
  if (prior)
    throw new PlatformError(
      "This payment needs reconciliation. Contact your administrator.",
      409,
    );
  const reservation = (
    await ctx.db.query(
      "INSERT INTO task_payment_batches(id,tenant_id,workspace_id,customer_id,amount_cents) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [batchId, ctx.tenantId, ctx.workspaceId, customer, amount],
    )
  ).rows[0];
  await ctx.db.query(
    "UPDATE task_charges SET batch_id=$1 WHERE task_id=ANY($2::text[]) AND tenant_id=$3 AND workspace_id=$4",
    [batchId, rows.map((r) => r.task_id), ctx.tenantId, ctx.workspaceId],
  );
  return {
    reservation: {
      ...reservation,
      created_at: new Date(reservation.created_at).toISOString(),
      task_count: rows.length,
    } as PaymentReservation,
  };
}
/** Called only after the reservation transaction commits. No customer-supplied fields. */
export async function createReservedCheckout(reservation: PaymentReservation) {
  if (Date.now() - Date.parse(reservation.created_at) > 23 * 3600000)
    throw new PlatformError(
      "This payment needs reconciliation before retrying. Contact your administrator.",
      409,
    );
  const suffix = Array.from(
    createHash("sha256").update(reservation.id).digest().subarray(0, 8),
    (n) => String.fromCharCode(97 + (n % 26)),
  ).join("");
  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      customer: reservation.customer_id,
      client_reference_id: reservation.id,
      metadata: { task_batch_id: reservation.id },
      integration_identifier: `orbis_tasks_${suffix}`,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: reservation.amount_cents,
            product_data: { name: "Accepted Orbis tasks" },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl()}/settings?taskPayment=success`,
      cancel_url: `${appUrl()}/settings?taskPayment=cancelled`,
      invoice_creation: { enabled: true },
    },
    { idempotencyKey: `orbis-task-payment:${reservation.id}` },
  );
  if (!session.url) throw new PlatformError("Payment link unavailable.", 503);
  return session;
}
