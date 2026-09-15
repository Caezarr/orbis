-- Tenant policy contract for Dalton: same transaction-local settings and
-- memberships as 001. Worker runs as a verified workspace member, no BYPASSRLS.
CREATE TABLE operational_tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','needs_review','completed','failed','cancelled')),
  input JSONB NOT NULL,
  quote JSONB NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  output JSONB,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token TEXT,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  accepted_by TEXT,
  UNIQUE(workspace_id, request_key),
  UNIQUE(id, workspace_id, tenant_id),
  FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE,
  CHECK ((status = 'running') = (lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL AND accepted_by IS NOT NULL)),
  CHECK (status NOT IN ('needs_review','completed') OR output IS NOT NULL),
  CHECK (quote->>'currency' = 'EUR' AND (quote->>'totalCents')::integer = total_cents)
);
CREATE INDEX operational_tasks_queue ON operational_tasks(workspace_id, available_at, created_at) WHERE status IN ('queued','running');
-- An accepted outcome receipt, NOT a Stripe charge. Exactly one per task.
CREATE TABLE operational_acceptances (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  accepted_by TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(task_id,workspace_id,tenant_id) REFERENCES operational_tasks(id,workspace_id,tenant_id) ON DELETE CASCADE
);
ALTER TABLE operational_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_acceptances FORCE ROW LEVEL SECURITY;
CREATE POLICY operational_task_tenant ON operational_tasks FOR ALL USING (
 workspace_id = nullif(current_setting('app.workspace_id',true),'') AND
 tenant_id = nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=operational_tasks.workspace_id AND m.tenant_id=operational_tasks.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
) WITH CHECK (
 workspace_id = nullif(current_setting('app.workspace_id',true),'') AND
 tenant_id = nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=operational_tasks.workspace_id AND m.tenant_id=operational_tasks.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
);
CREATE POLICY operational_acceptance_tenant ON operational_acceptances FOR ALL USING (
 workspace_id = nullif(current_setting('app.workspace_id',true),'') AND
 tenant_id = nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=operational_acceptances.workspace_id AND m.tenant_id=operational_acceptances.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
) WITH CHECK (
 workspace_id = nullif(current_setting('app.workspace_id',true),'') AND
 tenant_id = nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=operational_acceptances.workspace_id AND m.tenant_id=operational_acceptances.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
);
REVOKE ALL ON operational_tasks, operational_acceptances FROM PUBLIC;
-- Deployment owner must grant SELECT,INSERT,UPDATE on operational_tasks and
-- SELECT,INSERT on operational_acceptances to the non-BYPASSRLS runtime role.
