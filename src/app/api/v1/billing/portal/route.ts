import { NextResponse } from "next/server";
import { appUrl, stripe } from "@/lib/billing/stripe";
import { workspaceContext } from "@/lib/platform/context";
import { pool } from "@/lib/platform/db";

export const runtime = "nodejs";

export async function POST() {
  const context = workspaceContext();
  if (!context?.tenantId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const result = await pool().query<{ stripe_customer_id: string }>("SELECT stripe_customer_id FROM stripe_customers WHERE tenant_id = $1", [context.tenantId]);
  const customer = result.rows[0]?.stripe_customer_id;
  if (!customer) return NextResponse.json({ error: "BILLING_CUSTOMER_NOT_FOUND" }, { status: 404 });
  const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${appUrl()}/settings` });
  return NextResponse.json({ url: session.url });
}
