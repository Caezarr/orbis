ALTER TABLE operational_tasks ADD COLUMN started_at TIMESTAMPTZ;
ALTER TABLE operational_tasks ADD COLUMN execution_ms BIGINT NOT NULL DEFAULT 0 CHECK(execution_ms>=0);
ALTER TABLE operational_tasks ADD COLUMN baseline_minutes INTEGER CHECK(baseline_minutes BETWEEN 1 AND 10080);
CREATE TABLE task_effort (
 task_id TEXT NOT NULL, workspace_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
 user_id TEXT NOT NULL, session_id UUID NOT NULL, active_ms INTEGER NOT NULL CHECK(active_ms BETWEEN 0 AND 14400000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(task_id,user_id,session_id),
 FOREIGN KEY(task_id,workspace_id,tenant_id) REFERENCES operational_tasks(id,workspace_id,tenant_id) ON DELETE CASCADE
);
CREATE TABLE product_events (
 id UUID PRIMARY KEY, workspace_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, event TEXT NOT NULL, properties JSONB NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(), exported_at TIMESTAMPTZ,
 FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE
);
CREATE INDEX product_events_pending ON product_events(workspace_id,occurred_at) WHERE exported_at IS NULL;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['task_effort','product_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_access ON %I FOR ALL USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''') AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=%I.workspace_id AND m.tenant_id=%I.tenant_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',t,t,t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
