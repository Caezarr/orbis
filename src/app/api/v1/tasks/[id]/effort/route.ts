import { z } from "zod";
import { withWorkspaceRequest } from "@/lib/platform/request";
import { workspaceContext } from "@/lib/platform/context";
const schema = z
  .object({
    sessionId: z.uuid(),
    activeMs: z.number().int().min(0).max(14400000),
  })
  .strict();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withWorkspaceRequest(
    request,
    async () => {
      const ctx = workspaceContext();
      if (!ctx?.db)
        return Response.json(
          { error: "Connected workspace required" },
          { status: 503 },
        );
      const input = schema.safeParse(await request.json().catch(() => null));
      if (!input.success)
        return Response.json(
          { error: "Invalid activity measurement" },
          { status: 400 },
        );
      const { id } = await params;
      const result = await ctx.db.query(
        `INSERT INTO task_effort(task_id,workspace_id,tenant_id,user_id,session_id,active_ms)
 SELECT id,workspace_id,tenant_id,$4,$5,LEAST($6,30000) FROM operational_tasks WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3 AND status='needs_review'
 ON CONFLICT(task_id,user_id,session_id) DO UPDATE SET active_ms=GREATEST(task_effort.active_ms,LEAST($6,task_effort.active_ms+GREATEST(0,extract(epoch FROM (now()-task_effort.updated_at))*1000)::integer)),updated_at=now() RETURNING active_ms`,
        [
          id,
          ctx.workspaceId,
          ctx.tenantId,
          ctx.userId,
          input.data.sessionId,
          input.data.activeMs,
        ],
      );
      return Response.json({ recorded: !!result.rowCount });
    },
    { requireRole: ["owner", "admin", "operator"] },
  );
}
