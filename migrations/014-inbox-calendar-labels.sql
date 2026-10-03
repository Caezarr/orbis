-- Calendar-aware drafts + visible triage (docs/product/inbox-calendar-labels.md).
-- 1. inbox_features: per-workspace opt-ins, both default OFF (calendar slots,
--    Orbis labels/categories) and the slot timezone (Paris or Brussels only).
-- 2. inbox_messages.proposed_slots: the code-computed slots offered in a draft
--    (instants + French label, no event id: no event is ever created). Used to
--    render the draft and to hold those slots for other customers for 7 days.
-- 3. inbox_labels: one ledger row per labelled message (account + message id),
--    with idempotency key, payload hash and policy hash (mailbox-labels-v1). It
--    is the exact list the cleanup removes from; nothing else is ever unlabelled.
-- Same tenant contract as 007/008: FORCE RLS, transaction-local app.* settings,
-- membership check; runtime role gets SELECT/INSERT/UPDATE, never DELETE.
-- The dispatcher role (008) gets nothing here.

CREATE TABLE inbox_features (
  workspace_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  calendar_enabled BOOLEAN NOT NULL DEFAULT false,
  labels_enabled BOOLEAN NOT NULL DEFAULT false,
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris' CHECK (timezone IN ('Europe/Paris','Europe/Brussels')),
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE
);

ALTER TABLE inbox_messages ADD COLUMN proposed_slots JSONB
  CHECK (proposed_slots IS NULL OR (jsonb_typeof(proposed_slots) = 'array' AND jsonb_array_length(proposed_slots) <= 3));

CREATE TABLE inbox_labels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gmail','outlook')),
  connected_account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  inbox_message_id TEXT,
  -- Orbis label keys only (quote, client, supplier, admin, draft_ready).
  label_keys JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(label_keys) = 'array' AND jsonb_array_length(label_keys) <= 5),
  mode TEXT NOT NULL CHECK (mode IN ('test','scoped_autonomy')),
  state TEXT NOT NULL CHECK (state IN ('applied','simulated','uncertain','removed')),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) = 64),
  payload_hash TEXT NOT NULL CHECK (char_length(payload_hash) = 64),
  policy_hash TEXT NOT NULL CHECK (char_length(policy_hash) = 64),
  attempts INTEGER NOT NULL DEFAULT 0,
  applied_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, connected_account_id, message_id),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX inbox_labels_open ON inbox_labels(workspace_id, updated_at) WHERE state IN ('applied','simulated','uncertain');

ALTER TABLE inbox_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_features FORCE ROW LEVEL SECURITY;
ALTER TABLE inbox_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_labels FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON inbox_features FOR ALL USING (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=inbox_features.workspace_id AND m.tenant_id=inbox_features.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
) WITH CHECK (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=inbox_features.workspace_id AND m.tenant_id=inbox_features.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
);
CREATE POLICY tenant_access ON inbox_labels FOR ALL USING (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=inbox_labels.workspace_id AND m.tenant_id=inbox_labels.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
) WITH CHECK (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=inbox_labels.workspace_id AND m.tenant_id=inbox_labels.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
);
REVOKE ALL ON inbox_features, inbox_labels FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Erasure (012): add both tables, children first, same grants and policy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION orbis_tenant_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$ SELECT ARRAY[
  'inbox_labels','inbox_features',
  'digest_deliveries','digest_subscriptions',
  'brain_question_messages','brain_draft_outcomes','brain_sent_messages','brain_usage',
  'brain_questions','brain_facts','brain_jobs',
  'followups','pipeline_usage','pipeline_items','pipeline_settings',
  'inbox_messages','inbox_batches','inbox_visits','inbox_settings',
  'billing_trials','task_charges','task_payment_batches','task_effort',
  'operational_acceptances','operational_tasks','product_events',
  'stripe_checkout_attempts','stripe_subscriptions','stripe_customers',
  'workspace_state','memberships','workspaces'
]::text[] $fn$;
GRANT SELECT (tenant_id), DELETE ON inbox_labels, inbox_features TO orbis_tenant_eraser;
CREATE POLICY tenant_erase ON inbox_labels FOR ALL TO orbis_tenant_eraser USING (tenant_id = nullif(current_setting('orbis.erase_tenant', true), ''));
CREATE POLICY tenant_erase ON inbox_features FOR ALL TO orbis_tenant_eraser USING (tenant_id = nullif(current_setting('orbis.erase_tenant', true), ''));

-- scripts/migrate.ts grants DATABASE_APP_ROLE SELECT, INSERT, UPDATE on both
-- tables (never DELETE).
