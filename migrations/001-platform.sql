-- Run with the migration owner. Runtime DATABASE_URL must use a non-superuser,
-- non-BYPASSRLS role granted table access below by the deployment operator.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(id, tenant_id)
);
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('owner','admin','operator','expert')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id),
  FOREIGN KEY(workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON memberships(user_id);
CREATE TABLE IF NOT EXISTS workspace_state (
  workspace_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  state JSONB NOT NULL CHECK(jsonb_typeof(state) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK(version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE,
  CHECK(COALESCE(state->'workspace'->>'id' = workspace_id, false)),
  CHECK(COALESCE(state->'workspace'->>'tenantId' = tenant_id, false))
);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_state FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_read ON memberships FOR SELECT USING (user_id = nullif(current_setting('app.user_id', true), ''));
-- Only bootstrap the authenticated user's own owner membership. Team changes
-- require a separately privileged, audited membership service, not JSON edits.
CREATE POLICY membership_bootstrap ON memberships FOR INSERT WITH CHECK (
 user_id = nullif(current_setting('app.user_id', true), '') AND role = 'owner'
 AND EXISTS (SELECT 1 FROM workspaces w WHERE w.id = workspace_id AND w.created_by = user_id)
);
CREATE POLICY workspace_read ON workspaces FOR SELECT USING (
 created_by = nullif(current_setting('app.user_id', true), '') OR
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id = workspaces.id AND m.user_id = nullif(current_setting('app.user_id', true), ''))
);
CREATE POLICY workspace_bootstrap ON workspaces FOR INSERT WITH CHECK (created_by = nullif(current_setting('app.user_id', true), ''));
CREATE POLICY workspace_snapshot ON workspace_state FOR ALL USING (
 workspace_id = nullif(current_setting('app.workspace_id', true), '') AND
 tenant_id = nullif(current_setting('app.tenant_id', true), '') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id = workspace_state.workspace_id AND m.user_id = nullif(current_setting('app.user_id', true), ''))
) WITH CHECK (
 workspace_id = nullif(current_setting('app.workspace_id', true), '') AND
 tenant_id = nullif(current_setting('app.tenant_id', true), '') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id = workspace_state.workspace_id AND m.user_id = nullif(current_setting('app.user_id', true), ''))
);
REVOKE ALL ON workspaces, memberships, workspace_state FROM PUBLIC;
