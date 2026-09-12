import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { transaction } from "@/lib/platform/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 400 });
  let event: Stripe.Event;
  try { event = stripe().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 400 }); }
  await transaction(async client => {
    const inserted = await client.query("INSERT INTO stripe_events(event_id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING", [event.id, event.type]);
    if (inserted.rowCount === 0) return;
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription && session.customer && session.metadata?.tenant_id) {
        await client.query("INSERT INTO stripe_customers(tenant_id, stripe_customer_id) VALUES ($1, $2) ON CONFLICT (tenant_id) DO UPDATE SET stripe_customer_id = EXCLUDED.stripe_customer_id", [session.metadata.tenant_id, String(session.customer)]);
      }
    }
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const tenantId = subscription.metadata.tenant_id;
      const plan = subscription.metadata.plan === "Business" ? "Business" : "Solo";
      const periodEnd = (subscription as unknown as { current_period_end?: number }).current_period_end;
      if (tenantId) await client.query(`INSERT INTO stripe_subscriptions(tenant_id, stripe_subscription_id, stripe_customer_id, status, plan, seats, current_period_end, cancel_at_period_end)
        VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7),$8) ON CONFLICT (tenant_id) DO UPDATE SET stripe_subscription_id=EXCLUDED.stripe_subscription_id, stripe_customer_id=EXCLUDED.stripe_customer_id, status=EXCLUDED.status, plan=EXCLUDED.plan, seats=EXCLUDED.seats, current_period_end=EXCLUDED.current_period_end, cancel_at_period_end=EXCLUDED.cancel_at_period_end, updated_at=now()`, [tenantId, subscription.id, String(subscription.customer), subscription.status, plan, Number(subscription.metadata.seats ?? 1), periodEnd ?? null, subscription.cancel_at_period_end]);
    }
  });
  return NextResponse.json({ received: true });
}
