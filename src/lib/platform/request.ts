import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Membership, StoreState, Workspace } from "@/lib/domain/types";
import { PACKAGES } from "@/lib/capabilities/registry";
import { getStore } from "@/lib/store/store";
import { authenticatedUser, isSameOriginMutation, PlatformError } from "./auth";
import { setTenantContext, transaction } from "./db";
import { isOfflineMode, workspaceContext, workspaceStorage, type WorkspaceContext } from "./context";

export function blankTenantState(workspace: Workspace): StoreState {
  return {
    workspace, memberships: [], profile: null, packages: structuredClone(PACKAGES),
    missions: [], missionVersions: [], sources: [], instructions: [], memory: [],
    connections: [], runs: [], artifacts: [], evaluations: [], approvals: [], actions: [],
    budgets: [], usage: [], audit: [], outbox: [], cases: [], decisions: [], signals: [],
    copilot: [], workflowBriefs: [], teamGroups: [], businessAudits: [], knowledgeSelections: [],
    impact: { hoursSaved: 0, acceptedResultCostEur: 0, secondCapabilityMinutes: 0, correctionRate: 0, runsThisWeek: 0 },
  };
}
type MemberRow = { id: string; workspace_id: string; tenant_id: string; user_id: string; name: string; email: string; role: Membership["role"] };
function member(row: MemberRow): Membership {
  return { id: row.id, workspaceId: row.workspace_id, tenantId: row.tenant_id, userId: row.user_id, name: row.name, email: row.email, role: row.role };
}

async function resolveContext(client: PoolClient): Promise<WorkspaceContext> {
  const user = await authenticatedUser();
  await setTenantContext(client, { userId: user.id });
  // Serialize first-login provisioning for this user across processes.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [user.id]);
  let rows = (await client.query<MemberRow>("SELECT * FROM memberships WHERE user_id = $1 ORDER BY created_at, workspace_id", [user.id])).rows;
  if (!rows.length) {
    const id = randomUUID();
    const tenantId = randomUUID();
    const workspace: Workspace = { id, tenantId, name: "My workspace", slug: `workspace-${id}`, createdAt: new Date().toISOString() };
    await client.query("INSERT INTO workspaces(id,tenant_id,name,slug,created_by) VALUES($1,$2,$3,$4,$5)", [id, tenantId, workspace.name, workspace.slug, user.id]);
    rows = (await client.query<MemberRow>("INSERT INTO memberships(id,workspace_id,tenant_id,user_id,name,email,role) VALUES($1,$2,$3,$4,$5,$6,'owner') RETURNING *", [randomUUID(), id, tenantId, user.id, user.email ?? "", user.email ?? ""])).rows;
    await setTenantContext(client, { userId: user.id, workspaceId: id, tenantId });
    await client.query("INSERT INTO workspace_state(workspace_id,tenant_id,state) VALUES($1,$2,$3::jsonb)", [id, tenantId, JSON.stringify(blankTenantState(workspace))]);
  }
  // A cookie selects among verified memberships; it never grants membership.
  const selected = (await cookies()).get("orbis_workspace")?.value;
  const membership = selected ? rows.find(row => row.workspace_id === selected) : rows[0];
  if (!membership) throw new PlatformError("Workspace membership required", 403);
  const identity = { userId: user.id, workspaceId: membership.workspace_id, tenantId: membership.tenant_id };
  await setTenantContext(client, identity);
  const result = await client.query<{state: StoreState}>("SELECT state FROM workspace_state WHERE workspace_id=$1 AND tenant_id=$2 FOR UPDATE", [identity.workspaceId, identity.tenantId]);
  if (!result.rows[0]) throw new PlatformError("Workspace state unavailable", 503);
  const state = result.rows[0].state;
  if (state.workspace.id !== identity.workspaceId || state.workspace.tenantId !== identity.tenantId) throw new PlatformError("Workspace state identity mismatch", 503);
  // Authorization always uses relational membership, never editable snapshot data.
  state.memberships = rows.filter(row => row.workspace_id === identity.workspaceId).map(member);
  return { ...identity, role: membership.role, state, db: client, dirty: false };
}

export type WorkspaceRequestOptions = { requireRole?: Membership["role"] | Membership["role"][] };
function enforceRole(context: WorkspaceContext, options: WorkspaceRequestOptions) {
  if (!options.requireRole) return;
  const roles = Array.isArray(options.requireRole) ? options.requireRole : [options.requireRole];
  if (context.role !== "owner" && !roles.includes(context.role)) throw new PlatformError("Insufficient workspace role", 403);
}
class RollbackResponse { constructor(public response: Response) {} }

/** Finish all work inside callback. Detached work must open its own transaction. */
export async function withWorkspaceRequest(request: Request, callback: () => Response | Promise<Response>, options: WorkspaceRequestOptions = {}): Promise<Response> {
  try {
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (mutation && !isSameOriginMutation(request)) throw new PlatformError("Same-origin request required", 403);
    if (isOfflineMode()) {
      const url = new URL(request.url);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new PlatformError("Offline mode is localhost-only", 403);
      return await callback();
    }
    return await transaction(async client => {
      const context = await resolveContext(client);
      enforceRole(context, options);
      context.readOnly = !mutation;
      try {
        return await workspaceStorage.run(context, async () => {
          const response = await callback();
          if (response.status >= 400) throw new RollbackResponse(response);
          if (context.dirty) {
            if (context.state.workspace.id !== context.workspaceId || context.state.workspace.tenantId !== context.tenantId) throw new PlatformError("Workspace identity cannot change", 409);
            await client.query("UPDATE workspace_state SET state=$1::jsonb, version=version+1, updated_at=now() WHERE workspace_id=$2 AND tenant_id=$3", [JSON.stringify(context.state), context.workspaceId, context.tenantId]);
          }
          response.headers.set("Cache-Control", "private, no-store");
          return response;
        });
      } finally { context.closed = true; }
    });
  } catch (error) {
    if (error instanceof RollbackResponse) return error.response;
    const status = error instanceof PlatformError ? error.status : 503;
    return Response.json({ error: error instanceof PlatformError ? error.message : "Workspace service unavailable" }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}

/** Request-scoped authenticated read for async Server Components; never cache globally. */
export async function getRequestStore(): Promise<StoreState> {
  const current = workspaceContext();
  if (current) return getStore();
  if (isOfflineMode()) return getStore();
  try {
    return await transaction(async client => structuredClone((await resolveContext(client)).state));
  } catch (error) {
    if (error instanceof PlatformError && error.status === 401) redirect("/login");
    throw error;
  }
}
