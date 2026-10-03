import { displayPrices, subscriptionBillingConfigured } from "@/lib/billing/stripe";
import { planCatalog, planOffers } from "@/lib/billing/plans";
import { entitlementSummary } from "@/lib/billing/summary";
import { workspaceContext } from "@/lib/platform/context";
import { withWorkspaceRequest } from "@/lib/platform/request";

export const runtime = "nodejs";

/**
 * Plans page data: offers with prices read from Stripe (null = "Tarif bientôt
 * disponible"), the workspace entitlement and the subscription summary.
 * Accepted-task billing (ORBIS_TASK_BILLING_ENABLED) is not part of V1 and is
 * only surfaced when explicitly enabled.
 */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const context = workspaceContext();
    const trial = planCatalog().trial;
    const base = {
      trial: { days: trial.trialDays, drafts: trial.includedDrafts, features: trial.features },
      offers: planOffers(await displayPrices()),
      taskBilling: process.env.ORBIS_TASK_BILLING_ENABLED === "true",
    };
    if (!context?.db) return Response.json({ ...base, configured: false, canManage: false, hasCustomer: false, subscription: null, entitlement: null });
    const canManage = ["owner", "admin"].includes(context.role);
    const ids = { workspaceId: context.workspaceId, tenantId: context.tenantId };
    const entitlement = await entitlementSummary(context.db, ids);
    if (!canManage) return Response.json({ ...base, configured: false, canManage, hasCustomer: false, subscription: null, entitlement });
    const result = await context.db.query("SELECT plan,status,current_period_end,cancel_at_period_end FROM stripe_subscriptions WHERE tenant_id=$1", [context.tenantId]);
    const customer = await context.db.query("SELECT 1 FROM stripe_customers WHERE tenant_id=$1", [context.tenantId]);
    return Response.json({ ...base, configured: subscriptionBillingConfigured(), canManage, hasCustomer: !!customer.rowCount, subscription: result.rows[0] ?? null, entitlement });
  });
}
