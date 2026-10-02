import type { PoolClient } from "pg";

/*
 * Account / workspace deletion (GDPR erasure). Order, all-or-nothing on data:
 *
 *  1. Revoke every Composio connected account of the workspace (broker). A
 *     failure stops here: nothing is erased, the owner can retry.
 *  2. Cancel the Stripe subscription IMMEDIATELY (not at period end): the
 *     workspace and its data no longer exist, so the service cannot continue.
 *     No automatic pro-rata refund (owner decision, see launch checklist).
 *     Invoices and the Stripe customer stay at Stripe (its own legal
 *     retention). A failure stops here: nothing is erased.
 *  3. Hard-delete every row of this tenant in one transaction through the
 *     SECURITY DEFINER `orbis_erase_tenant` (migration 012): owner check in SQL,
 *     deletion scoped to this tenant only, minimal audit row (hashed tenant id,
 *     date, per-table counts).
 *  4. After commit (caller): delete the Supabase Auth user when the service
 *     role key is configured and the user belongs to no other workspace; then
 *     sign out.
 *
 * The API also requires: owner role, a sign-in less than RECENT_AUTH_MS old,
 * and the typed confirmation CONFIRMATION_WORD.
 */

export const CONFIRMATION_WORD = "SUPPRIMER";
export const RECENT_AUTH_MS = 15 * 60_000;

export type EraseIdentity = { userId: string; workspaceId: string; tenantId: string };
export type EraseDeps = {
  revokeConnections(tenantId: string, workspaceId: string): Promise<{ status: "revoked" | "not_configured"; revoked: number }>;
  cancelSubscription(tenantId: string): Promise<"canceled" | "none" | "not_configured">;
  eraseRows(identity: EraseIdentity): Promise<Record<string, number>>;
};
export type EraseResult = {
  connections: { status: "revoked" | "not_configured"; revoked: number };
  subscription: "canceled" | "none" | "not_configured";
  rows: Record<string, number>;
};
export class EraseError extends Error {
  constructor(
    public step: "connections" | "subscription" | "rows",
    message: string,
  ) {
    super(message);
  }
}

/** Pure checks before anything irreversible. Returns an error message or null. */
export function erasurePreconditions(input: {
  role: string;
  confirm: unknown;
  lastSignInAt: string | null | undefined;
  now?: number;
}): { status: number; error: string } | null {
  if (input.role !== "owner") return { status: 403, error: "Seul le propriétaire de l’espace peut le supprimer." };
  if (input.confirm !== CONFIRMATION_WORD)
    return { status: 400, error: `Tapez ${CONFIRMATION_WORD} pour confirmer la suppression.` };
  const at = input.lastSignInAt ? Date.parse(input.lastSignInAt) : NaN;
  if (!Number.isFinite(at) || (input.now ?? Date.now()) - at > RECENT_AUTH_MS)
    return {
      status: 401,
      error: "Pour supprimer l’espace, reconnectez-vous d’abord (connexion de moins de 15 minutes).",
    };
  return null;
}

export async function eraseWorkspace(identity: EraseIdentity, deps: EraseDeps): Promise<EraseResult> {
  let connections: EraseResult["connections"];
  try {
    connections = await deps.revokeConnections(identity.tenantId, identity.workspaceId);
  } catch {
    throw new EraseError("connections", "Révocation des connexions impossible. Rien n’a été supprimé ; réessayez.");
  }
  let subscription: EraseResult["subscription"];
  try {
    subscription = await deps.cancelSubscription(identity.tenantId);
  } catch {
    throw new EraseError("subscription", "Résiliation de l’abonnement impossible. Rien n’a été supprimé ; réessayez.");
  }
  let rows: Record<string, number>;
  try {
    rows = await deps.eraseRows(identity);
  } catch {
    throw new EraseError("rows", "Suppression des données impossible. Réessayez ou contactez le support.");
  }
  return { connections, subscription, rows };
}

/** Step 3 inside the request transaction (RLS context = the owner's session). */
export async function eraseTenantRows(db: Pick<PoolClient, "query">, identity: EraseIdentity) {
  const { rows } = await db.query<{ counts: Record<string, number> }>(
    "SELECT orbis_erase_tenant($1,$2,$3) AS counts",
    [identity.workspaceId, identity.tenantId, `erase:${identity.workspaceId}`],
  );
  return rows[0]?.counts ?? {};
}

/** Minimal Stripe surface (mockable). */
export type StripeCancelSurface = {
  subscriptions: {
    retrieve(id: string): Promise<{ status: string }>;
    cancel(
      id: string,
      params: { invoice_now: boolean; prorate: boolean },
      options: { idempotencyKey: string },
    ): Promise<{ status: string }>;
  };
};
const ENDED = new Set(["canceled", "incomplete_expired"]);
/** Step 2 through the existing Stripe client. Subscription id read from our own row. */
export async function cancelTenantSubscription(
  db: Pick<PoolClient, "query">,
  tenantId: string,
  stripe: (() => StripeCancelSurface) | null,
): Promise<"canceled" | "none" | "not_configured"> {
  const row = (
    await db.query<{ stripe_subscription_id: string; status: string }>(
      "SELECT stripe_subscription_id, status FROM stripe_subscriptions WHERE tenant_id=$1",
      [tenantId],
    )
  ).rows[0];
  if (!row || ENDED.has(row.status)) return "none";
  // A live subscription that cannot be cancelled blocks the erasure (it would keep billing).
  if (!stripe) throw new Error("STRIPE_NOT_CONFIGURED");
  const client = stripe();
  const current = await client.subscriptions.retrieve(row.stripe_subscription_id);
  if (ENDED.has(current.status)) return "none";
  await client.subscriptions.cancel(
    row.stripe_subscription_id,
    { invoice_now: false, prorate: false },
    { idempotencyKey: `orbis-erase:${tenantId}:${row.stripe_subscription_id}` },
  );
  return "canceled";
}
