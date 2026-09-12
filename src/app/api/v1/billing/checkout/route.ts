import { NextResponse } from "next/server";
import Stripe from "stripe";
import { appUrl, extraSeatPrice, planPrice, stripe } from "@/lib/billing/stripe";
import { workspaceContext } from "@/lib/platform/context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = workspaceContext();
  if (!context?.tenantId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { plan?: "Solo" | "Business"; seats?: number };
  if (body.plan !== "Solo" && body.plan !== "Business") return NextResponse.json({ error: "INVALID_PLAN" }, { status: 400 });
  const seats = body.plan === "Solo" ? 1 : Math.max(5, Math.min(50, Math.floor(body.seats ?? 5)));
  const line_items: { price: string; quantity: number }[] = [{ price: planPrice(body.plan), quantity: 1 }];
  if (body.plan === "Business" && seats > 5) line_items.push({ price: extraSeatPrice(), quantity: seats - 5 });
  const checkoutParams = {
    mode: "subscription", line_items, success_url: `${appUrl()}/settings?billing=success`, cancel_url: `${appUrl()}/pricing?billing=cancelled`,
    customer_creation: "always", client_reference_id: context.tenantId,
    metadata: { tenant_id: context.tenantId, workspace_id: context.workspaceId, plan: body.plan, seats: String(seats) },
    subscription_data: { metadata: { tenant_id: context.tenantId, workspace_id: context.workspaceId, plan: body.plan, seats: String(seats) } },
    integration_identifier: `orbis_checkout_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`,
  } as unknown as Stripe.Checkout.SessionCreateParams;
  const session = await stripe().checkout.sessions.create(checkoutParams);
  return NextResponse.json({ url: session.url });
}
