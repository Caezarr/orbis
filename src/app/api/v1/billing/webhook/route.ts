import type Stripe from "stripe";
import { stripe, stripePrices } from "@/lib/billing/stripe";
import { transaction } from "@/lib/platform/db";

export const runtime = "nodejs";
const idOf = (value: string | { id: string }) => typeof value === "string" ? value : value.id;

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  if (!signature) return Response.json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  let event: Stripe.Event;
  try { event = stripe().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return Response.json({ error: "INVALID_SIGNATURE" }, { status: 400 }); }
  try {
    await transaction(async db => {
      const inserted = await db.query("INSERT INTO stripe_events(event_id,event_type) VALUES($1,$2) ON CONFLICT DO NOTHING", [event.id, event.type]);
      if (!inserted.rowCount) return;
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
        const session = event.data.object;
        await db.query("UPDATE stripe_checkout_attempts SET expires_at=now() WHERE session_id=$1", [session.id]);
      }
      if (!["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) return;
      const delivered = event.data.object as Stripe.Subscription;
      const customer = idOf(delivered.customer);
      // Serialize by customer; fetch CURRENT provider state, never trust event order.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [customer]);
      const owner = await db.query<{tenant_id: string}>("SELECT tenant_id FROM stripe_customers WHERE stripe_customer_id=$1", [customer]);
      if (!owner.rows[0]) throw new Error("Customer mapping unavailable"); // Stripe retries after checkout transaction commits
      const subscription = await stripe().subscriptions.retrieve(delivered.id);
      if (idOf(subscription.customer) !== customer) throw new Error("Customer mismatch");
      const soloId = stripePrices.Solo(), businessId = stripePrices.BusinessBase(), extraId = stripePrices.BusinessExtraSeat();
      const items = subscription.items.data;
      const solo = soloId && items.find(item => item.price.id === soloId);
      const business = businessId && items.find(item => item.price.id === businessId);
      if ((!solo && !business) || (solo && business)) throw new Error("Unknown subscription price");
      if (items.some(item => ![soloId, businessId, extraId].filter(Boolean).includes(item.price.id))) throw new Error("Unexpected subscription item");
      if ((solo && solo.quantity !== 1) || (business && business.quantity !== 1)) throw new Error("Invalid base quantity");
      const extra = extraId ? items.filter(item => item.price.id === extraId).reduce((n, item) => n + (item.quantity ?? 0), 0) : 0;
      if ((solo && extra) || !Number.isSafeInteger(extra) || extra < 0 || extra > 45) throw new Error("Invalid seats");
      const periodEnd = Math.min(...items.map(item => item.current_period_end));
      const tenantId = owner.rows[0].tenant_id;
      // Do not let a late cancellation of an old subscription replace a newer one.
      const previous = await db.query<{stripe_subscription_id: string; status: string}>("SELECT stripe_subscription_id,status FROM stripe_subscriptions WHERE tenant_id=$1", [tenantId]);
      const prior = previous.rows[0];
      if (prior && prior.stripe_subscription_id !== subscription.id && ["canceled", "incomplete_expired"].includes(subscription.status)) return;
      if (prior && prior.stripe_subscription_id !== subscription.id && !["canceled", "incomplete_expired"].includes(prior.status)) throw new Error("Multiple active subscriptions require reconciliation");
      await db.query(`INSERT INTO stripe_subscriptions(tenant_id,stripe_subscription_id,stripe_customer_id,status,plan,seats,current_period_end,cancel_at_period_end)
        VALUES($1,$2,$3,$4,$5,$6,to_timestamp($7),$8)
        ON CONFLICT(tenant_id) DO UPDATE SET stripe_subscription_id=EXCLUDED.stripe_subscription_id,stripe_customer_id=EXCLUDED.stripe_customer_id,status=EXCLUDED.status,plan=EXCLUDED.plan,seats=EXCLUDED.seats,current_period_end=EXCLUDED.current_period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end,updated_at=now()`,
        [tenantId, subscription.id, customer, subscription.status, solo ? "Solo" : "Business", solo ? 1 : 5 + extra, periodEnd, subscription.cancel_at_period_end]);
    });
    return Response.json({ received: true });
  } catch {
    // Atomic rollback removes the deduplication entry so Stripe can retry.
    return Response.json({ error: "Billing synchronization unavailable. Retry this event." }, { status: 503 });
  }
}
