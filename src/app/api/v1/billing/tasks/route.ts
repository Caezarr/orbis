import { withWorkspaceRequest } from "@/lib/platform/request";
import { workspaceContext } from "@/lib/platform/context";
import {
  taskLedger,
  payTasks,
  createReservedCheckout,
  type PaymentReservation,
} from "@/lib/billing/task-ledger";
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () =>
    Response.json(
      workspaceContext()?.db
        ? await taskLedger()
        : { items: [], dueCents: 0, enabled: false, canPay: false },
    ),
  );
}
export async function POST(request: Request) {
  let reservation: PaymentReservation | undefined;
  const prepared = await withWorkspaceRequest(
    request,
    async () => {
      const input = await request.json().catch(() => null);
      if (
        !Number.isSafeInteger(input?.expectedCents) ||
        input.expectedCents < 0
      )
        return Response.json(
          { error: "Review the current task balance." },
          { status: 400 },
        );
      const result = await payTasks(input.expectedCents);
      if ("reservation" in result) {
        reservation = result.reservation;
        return Response.json({ reserved: true });
      }
      return Response.json(result);
    },
    { requireRole: ["owner", "admin"] },
  );
  if (!prepared.ok || !reservation) return prepared;
  try {
    const current = reservation as PaymentReservation;
    const session = await createReservedCheckout(current);
    return withWorkspaceRequest(
      request,
      async () => {
        const ctx = workspaceContext()!;
        const update = await ctx.db!.query(
          "UPDATE task_payment_batches SET session_id=$1,session_url=$2,expires_at=to_timestamp($3) WHERE id=$4 AND tenant_id=$5 AND workspace_id=$6 AND (session_id IS NULL OR session_id=$1)",
          [
            session.id,
            session.url,
            session.expires_at,
            current.id,
            ctx.tenantId,
            ctx.workspaceId,
          ],
        );
        if (!update.rowCount)
          return Response.json(
            {
              error: "Payment reservation changed. Contact your administrator.",
            },
            { status: 409 },
          );
        return Response.json({ url: session.url });
      },
      { requireRole: ["owner", "admin"] },
    );
  } catch {
    return Response.json(
      {
        error:
          "Payment could not open. Your task balance is reserved; retry safely or contact your administrator.",
      },
      { status: 503 },
    );
  }
}
