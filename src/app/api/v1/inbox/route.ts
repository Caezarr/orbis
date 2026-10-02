import { withWorkspaceRequest } from "@/lib/platform/request";
import { isOfflineMode } from "@/lib/platform/context";
import {
  enqueueFirstRun,
  listInboxResults,
  triggerSchema,
} from "@/lib/inbox/service";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";

const disabled = () =>
  Response.json(
    { error: "Inbox drafts are not enabled for this deployment." },
    { status: 503 },
  );
/** Results: classification, draft preview, questions, citations and draft ids. */
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    if (!inboxDraftsEnabled()) return disabled();
    if (isOfflineMode())
      return Response.json({ batches: [], messages: [], mode: "offline" });
    const batchId = new URL(request.url).searchParams.get("batchId");
    if (batchId !== null && !/^[0-9a-f-]{36}$/.test(batchId))
      return Response.json({ error: "Invalid batch id" }, { status: 400 });
    return Response.json(await listInboxResults(batchId ?? undefined));
  });
}
/** First run: queue one batch over recent inbound mail of the session workspace. */
export async function POST(request: Request) {
  return withWorkspaceRequest(
    request,
    async () => {
      if (!inboxDraftsEnabled()) return disabled();
      if (isOfflineMode())
        return Response.json(
          { error: "Inbox drafts need an authenticated workspace." },
          { status: 503 },
        );
      const parsed = triggerSchema.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return Response.json(
          { error: "Choose gmail or outlook and a valid window." },
          { status: 400 },
        );
      return Response.json(
        await enqueueFirstRun(
          parsed.data,
          request.headers.get("Idempotency-Key") ?? "",
        ),
        { status: 202 },
      );
    },
    { requireRole: ["owner", "admin", "operator"] },
  );
}
