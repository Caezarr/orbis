import { createHash } from "node:crypto";
import { appUrl, extraSeatPrice, planPrice, stripe } from "@/lib/billing/stripe";
import { checkoutInput } from "@/lib/billing/checkout-input";
import { proposedPlans } from "@/lib/billing/rates";
import { workspaceContext } from "@/lib/platform/context";
import { withWorkspaceRequest } from "@/lib/platform/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const context = workspaceContext();
    if (!context?.db) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    let input;
    try { input = checkoutInput(await request.json()); }
    catch { return Response.json({ error: "Choose a plan and a valid number of seats, then try again." }, { status: 400 }); }
    const { plan, seats, requestId } = input;
    const db = context.db;
    const existing = await db.query("SELECT status FROM stripe_subscriptions WHERE tenant_id=$1", [context.tenantId]);
    if (existing.rows.some(row => !["canceled", "incomplete_expired"].includes(row.status))) return Response.json({ error: "Manage your existing subscription in the billing portal." }, { status: 409 });
    const previous = await db.query<{plan: string; seats: number; session_url: string; expires_at: Date}>("SELECT * FROM stripe_checkout_attempts WHERE tenant_id=$1 AND request_id=$2", [context.tenantId, requestId]);
    const attempt = previous.rows[0];
    if (attempt) {
      if (attempt.plan !== plan || attempt.seats !== seats) return Response.json({ error: "Checkout request already used for another plan." }, { status: 409 });
      if (new Date(attempt.expires_at).getTime() <= Date.now()) return Response.json({ error: "Checkout expired. Start a new checkout." }, { status: 409 });
      return Response.json({ url: attempt.session_url });
    }
    const pending = await db.query("SELECT 1 FROM stripe_checkout_attempts WHERE tenant_id=$1 AND expires_at>now()", [context.tenantId]);
    if (pending.rowCount) return Response.json({ error: "A checkout is already open. Complete it or wait for it to expire." }, { status: 409 });
    const origin = appUrl();
    const lineItems = [{ price: planPrice(plan), quantity: 1 }];
    if (plan === "Business" && seats > 5) lineItems.push({ price: extraSeatPrice(), quantity: seats - 5 });
    const api = stripe();
    const expectedAmounts = [plan === "Solo" ? proposedPlans.soloMonthlyCents : proposedPlans.businessMonthlyCents, proposedPlans.extraSeatCents];
    for (const [index, item] of lineItems.entries()) {
      const price = await api.prices.retrieve(item.price);
      if (!price.active || price.currency !== "eur" || price.unit_amount !== expectedAmounts[index] || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1 || price.recurring.usage_type !== "licensed") {
        return Response.json({ error: "Billing configuration does not match the displayed offer. Contact your workspace administrator." }, { status: 503 });
      }
    }
    const customers = await db.query<{stripe_customer_id: string}>("SELECT stripe_customer_id FROM stripe_customers WHERE tenant_id=$1", [context.tenantId]);
    let customer = customers.rows[0]?.stripe_customer_id;
    if (!customer) {
      customer = (await api.customers.create({ metadata: { tenant_id: context.tenantId } }, { idempotencyKey: `orbis-customer:${context.tenantId}` })).id;
      await db.query("INSERT INTO stripe_customers(tenant_id,stripe_customer_id) VALUES($1,$2)", [context.tenantId, customer]);
    }
    // UUID entropy, mapped to letters; deterministic across network retries.
    const suffix = Array.from(createHash("sha256").update(requestId).digest().subarray(0, 8), byte => String.fromCharCode(97 + byte % 26)).join("");
    const session = await api.checkout.sessions.create({
      mode: "subscription", customer, line_items: lineItems,
      success_url: `${origin}/settings?billing=success`, cancel_url: `${origin}/settings?billing=cancelled`,
      client_reference_id: context.tenantId,
      metadata: { tenant_id: context.tenantId, workspace_id: context.workspaceId },
      subscription_data: { metadata: { tenant_id: context.tenantId } },
      integration_identifier: `orbis_checkout_${suffix}`,
    }, { idempotencyKey: `orbis-checkout:${context.tenantId}:${requestId}` });
    if (!session.url) throw new Error("Checkout URL unavailable");
    await db.query("INSERT INTO stripe_checkout_attempts(tenant_id,request_id,plan,seats,session_id,session_url,expires_at) VALUES($1,$2,$3,$4,$5,$6,to_timestamp($7))", [context.tenantId, requestId, plan, seats, session.id, session.url, session.expires_at]);
    return Response.json({ url: session.url });
  }, { requireRole: ["owner", "admin"] });
}
