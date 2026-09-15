import { workspaceContext } from "@/lib/platform/context";
import { withWorkspaceRequest } from "@/lib/platform/request";
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const context = workspaceContext();
    if (!context?.db) return Response.json({ configured: false, canManage: false, subscription: null });
    const canManage = ["owner", "admin"].includes(context.role);
    if (!canManage) return Response.json({ configured: false, canManage, subscription: null });
    const result = await context.db.query("SELECT plan,status,seats,current_period_end,cancel_at_period_end FROM stripe_subscriptions WHERE tenant_id=$1", [context.tenantId]);
    const customer = await context.db.query("SELECT 1 FROM stripe_customers WHERE tenant_id=$1", [context.tenantId]);
    return Response.json({ configured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.ORBIS_APP_URL && process.env.STRIPE_PRICE_SOLO_MONTHLY && process.env.STRIPE_PRICE_BUSINESS_BASE_MONTHLY && process.env.STRIPE_PRICE_BUSINESS_EXTRA_SEAT_MONTHLY), canManage, hasCustomer: !!customer.rowCount, subscription: result.rows[0] ?? null });
  });
}
