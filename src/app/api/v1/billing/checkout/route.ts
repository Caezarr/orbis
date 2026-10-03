import { createHash } from "node:crypto";
import { appUrl, planPrice, stripe, subscriptionBillingConfigured } from "@/lib/billing/stripe";
import { checkoutInput } from "@/lib/billing/checkout-input";
import { displayPriceFrom, planCatalog } from "@/lib/billing/plans";
import { workspaceContext } from "@/lib/platform/context";
import { withWorkspaceRequest } from "@/lib/platform/request";

export const runtime = "nodejs";

/**
 * Stripe Checkout for one V1 subscription plan (solo | equipe). Allowed during
 * the trial (upgrade mid-trial) and after it ended; refused while another
 * subscription is live (use the Customer Portal). The amount charged is the
 * Stripe Price itself: the UI displays that same object, never a code constant.
 * automatic_tax is deliberately NOT enabled (see docs/product/billing-v1.md).
 */
export async function POST(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const context = workspaceContext();
    if (!context?.db) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    let input;
    try { input = checkoutInput(await request.json()); }
    catch { return Response.json({ error: "Choisissez une formule, puis réessayez." }, { status: 400 }); }
    const { plan, requestId } = input;
    if (!subscriptionBillingConfigured()) return Response.json({ error: "Le paiement n’est pas encore disponible sur ce déploiement." }, { status: 503 });
    const db = context.db;
    const existing = await db.query("SELECT status FROM stripe_subscriptions WHERE tenant_id=$1", [context.tenantId]);
    if (existing.rows.some(row => !["canceled", "incomplete_expired"].includes(row.status))) return Response.json({ error: "Un abonnement existe déjà : gérez-le depuis l’espace de facturation Stripe." }, { status: 409 });
    const mailboxes = planCatalog()[plan].mailboxes;
    const previous = await db.query<{plan: string; session_url: string; expires_at: Date}>("SELECT * FROM stripe_checkout_attempts WHERE tenant_id=$1 AND request_id=$2", [context.tenantId, requestId]);
    const attempt = previous.rows[0];
    if (attempt) {
      if (attempt.plan !== plan) return Response.json({ error: "Cette demande de paiement concerne une autre formule." }, { status: 409 });
      if (new Date(attempt.expires_at).getTime() <= Date.now()) return Response.json({ error: "Le paiement a expiré. Relancez-le." }, { status: 409 });
      return Response.json({ url: attempt.session_url });
    }
    const pending = await db.query("SELECT 1 FROM stripe_checkout_attempts WHERE tenant_id=$1 AND expires_at>now()", [context.tenantId]);
    if (pending.rowCount) return Response.json({ error: "Un paiement est déjà ouvert. Terminez-le ou attendez son expiration." }, { status: 409 });
    let priceId: string;
    try { priceId = planPrice(plan); }
    catch { return Response.json({ error: "Tarif bientôt disponible : cette formule ne peut pas encore être souscrite." }, { status: 503 }); }
    const origin = appUrl();
    const api = stripe();
    if (!displayPriceFrom(await api.prices.retrieve(priceId)))
      return Response.json({ error: "Tarif bientôt disponible : cette formule ne peut pas encore être souscrite." }, { status: 503 });
    const customers = await db.query<{stripe_customer_id: string}>("SELECT stripe_customer_id FROM stripe_customers WHERE tenant_id=$1", [context.tenantId]);
    let customer = customers.rows[0]?.stripe_customer_id;
    if (!customer) {
      customer = (await api.customers.create({ metadata: { tenant_id: context.tenantId } }, { idempotencyKey: `orbis-customer:${context.tenantId}` })).id;
      await db.query("INSERT INTO stripe_customers(tenant_id,stripe_customer_id) VALUES($1,$2)", [context.tenantId, customer]);
    }
    // UUID entropy, mapped to letters; deterministic across network retries.
    const suffix = Array.from(createHash("sha256").update(requestId).digest().subarray(0, 8), byte => String.fromCharCode(97 + byte % 26)).join("");
    const session = await api.checkout.sessions.create({
      mode: "subscription", customer, line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/billing?checkout=success`, cancel_url: `${origin}/billing?checkout=cancelled`,
      client_reference_id: context.tenantId,
      metadata: { tenant_id: context.tenantId, workspace_id: context.workspaceId, plan },
      subscription_data: { metadata: { tenant_id: context.tenantId, plan } },
      integration_identifier: `orbis_checkout_${suffix}`,
    }, { idempotencyKey: `orbis-checkout:${context.tenantId}:${requestId}` });
    if (!session.url) throw new Error("Checkout URL unavailable");
    await db.query("INSERT INTO stripe_checkout_attempts(tenant_id,request_id,plan,seats,session_id,session_url,expires_at) VALUES($1,$2,$3,$4,$5,$6,to_timestamp($7))", [context.tenantId, requestId, plan, mailboxes, session.id, session.url, session.expires_at]);
    return Response.json({ url: session.url });
  }, { requireRole: ["owner", "admin"] });
}
