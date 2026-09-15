import { withWorkspaceRequest } from "@/lib/platform/request";
import { workspaceContext } from "@/lib/platform/context";
export async function GET(request: Request) {
  return withWorkspaceRequest(request, async () => {
    const ctx = workspaceContext();
    if (!ctx?.db) return Response.json({ available: false, workflows: [] });
    const { rows } = await ctx.db.query(
      `SELECT t.workflow_id,
 count(*)::integer AS tasks,
 count(*) FILTER(WHERE t.status='completed')::integer AS accepted,
 count(*) FILTER(WHERE t.status='failed')::integer AS failed,
 count(*) FILTER(WHERE t.status='needs_review')::integer AS awaiting_review,
 round(avg(t.execution_ms) FILTER(WHERE t.ready_at IS NOT NULL))::float8 AS execution_ms,
 round(avg(extract(epoch FROM (t.ready_at-t.created_at))*1000) FILTER(WHERE t.ready_at IS NOT NULL))::float8 AS delivery_ms,
 round(avg(extract(epoch FROM (t.completed_at-t.ready_at))*1000) FILTER(WHERE t.status='completed'))::float8 AS review_wait_ms,
 COALESCE(sum(e.active_ms),0)::float8 AS active_ms,
 count(*) FILTER(WHERE t.status='completed' AND t.baseline_minutes IS NOT NULL AND e.active_ms IS NOT NULL)::integer AS measured_outcomes,
 sum(t.baseline_minutes*60000::bigint-e.active_ms) FILTER(WHERE t.status='completed' AND e.active_ms IS NOT NULL)::float8 AS estimated_saved_ms,
 COALESCE(sum(t.total_cents) FILTER(WHERE t.status='completed'),0)::float8 AS accepted_value_cents
 FROM operational_tasks t LEFT JOIN (SELECT task_id,sum(active_ms) AS active_ms FROM task_effort WHERE workspace_id=$1 AND tenant_id=$2 GROUP BY task_id) e ON e.task_id=t.id
 WHERE t.workspace_id=$1 AND t.tenant_id=$2 AND t.created_at>=now()-interval '30 days' GROUP BY t.workflow_id`,
      [ctx.workspaceId, ctx.tenantId],
    );
    return Response.json({ available: true, periodDays: 30, workflows: rows });
  });
}
