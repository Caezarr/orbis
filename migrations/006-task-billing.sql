ALTER TABLE stripe_subscriptions ADD COLUMN current_period_start TIMESTAMPTZ;
CREATE TABLE task_payment_batches (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
 customer_id TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 session_id TEXT UNIQUE, session_url TEXT, expires_at TIMESTAMPTZ,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','paid','expired')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), paid_at TIMESTAMPTZ,
 FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id)
);
-- Like stripe_events, this table is used by the signature-verified webhook without
-- browser membership. API access always resolves tenant + workspace from session.
REVOKE ALL ON task_payment_batches FROM PUBLIC;
CREATE TABLE task_charges (
 task_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
 quoted_cents INTEGER NOT NULL CHECK(quoted_cents>=0), due_cents INTEGER NOT NULL CHECK(due_cents>=0 AND due_cents<=quoted_cents),
 disposition TEXT NOT NULL CHECK(disposition IN ('preview','included','payable')),
 period_key TEXT, batch_id TEXT REFERENCES task_payment_batches(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(task_id,workspace_id,tenant_id) REFERENCES operational_tasks(id,workspace_id,tenant_id),
 CHECK((disposition='payable') OR due_cents=0)
);
ALTER TABLE task_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_charges FORCE ROW LEVEL SECURITY;
CREATE POLICY task_charge_tenant ON task_charges FOR ALL USING (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=task_charges.workspace_id AND m.tenant_id=task_charges.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
);
REVOKE ALL ON task_charges FROM PUBLIC;
