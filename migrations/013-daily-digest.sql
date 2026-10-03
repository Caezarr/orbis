-- Daily digest e-mail (V1 Phase 2, backlog item 1).
-- 1. digest_subscriptions: explicit per-user opt-in (default off). The recipient
--    is the subscriber's own verified account e-mail, copied server-side from the
--    authenticated session at opt-in; it is never taken from a request body or
--    from mail content. Turning the digest off nulls it.
-- 2. digest_deliveries: one ledger row per (workspace, user, Paris day). It is
--    the idempotency claim of the send: a second pass the same day inserts
--    nothing and sends nothing. Counts only: no recipient, no subject, no names.
-- 3. Discovery: orbis_digest_due_subscriptions(), SECURITY DEFINER, owned by the
--    existing ids-only discovery role orbis_inbox_dispatch (as 008/009). It reads
--    scheduling columns only and returns ids; the counts and the recipient are
--    then read under the subscriber's own RLS context.
-- 4. Erasure: both tables join orbis_tenant_tables() (012).
-- Same tenant contract as 007/008: FORCE RLS, transaction-local app.* settings.

CREATE TABLE digest_subscriptions (
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  recipient TEXT CHECK (recipient IS NULL OR (char_length(recipient) BETWEEN 3 AND 254 AND position('@' IN recipient) > 1)),
  -- Europe/Paris calendar day of the last handled digest (sent, simulated or empty).
  last_day DATE,
  last_window_end TIMESTAMPTZ,
  enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE,
  CHECK (enabled = (recipient IS NOT NULL))
);
CREATE INDEX digest_subscriptions_due ON digest_subscriptions(last_day) WHERE enabled;

CREATE TABLE digest_deliveries (
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (char_length(idempotency_key) = 64),
  policy_hash TEXT NOT NULL CHECK (char_length(policy_hash) = 64),
  payload_hash TEXT CHECK (payload_hash IS NULL OR char_length(payload_hash) = 64),
  outcome TEXT NOT NULL DEFAULT 'claimed' CHECK (outcome IN ('claimed','skipped_empty','simulated','sent','refused','failed')),
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  counts JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counts) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id, day),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE,
  CHECK (window_start <= window_end)
);

ALTER TABLE digest_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE digest_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_deliveries FORCE ROW LEVEL SECURITY;
-- Private to the user as well as scoped to the workspace (same shape as inbox_visits).
CREATE POLICY tenant_access ON digest_subscriptions FOR ALL USING (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 user_id=nullif(current_setting('app.user_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=digest_subscriptions.workspace_id AND m.tenant_id=digest_subscriptions.tenant_id AND m.user_id=digest_subscriptions.user_id)
) WITH CHECK (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 user_id=nullif(current_setting('app.user_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=digest_subscriptions.workspace_id AND m.tenant_id=digest_subscriptions.tenant_id AND m.user_id=digest_subscriptions.user_id)
);
CREATE POLICY tenant_access ON digest_deliveries FOR ALL USING (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 user_id=nullif(current_setting('app.user_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=digest_deliveries.workspace_id AND m.tenant_id=digest_deliveries.tenant_id AND m.user_id=digest_deliveries.user_id)
) WITH CHECK (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 user_id=nullif(current_setting('app.user_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=digest_deliveries.workspace_id AND m.tenant_id=digest_deliveries.tenant_id AND m.user_id=digest_deliveries.user_id)
);
REVOKE ALL ON digest_subscriptions, digest_deliveries FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Discovery (ids only). orbis_inbox_dispatch gets column SELECT on scheduling
-- columns only: never recipient, never counts.
-- ---------------------------------------------------------------------------
GRANT SELECT (workspace_id, tenant_id, user_id, enabled, last_day) ON digest_subscriptions TO orbis_inbox_dispatch;
CREATE POLICY digest_dispatch_discover ON digest_subscriptions FOR SELECT TO orbis_inbox_dispatch USING (true);

-- Subscriptions due today: enabled, not handled for the current Europe/Paris
-- day, local time at or after 07:00, and the subscriber still an
-- owner/admin/operator member (a viewer cannot run the worker context).
CREATE FUNCTION orbis_digest_due_subscriptions(p_limit integer)
RETURNS TABLE(tenant_id text, workspace_id text, user_id text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT s.tenant_id, s.workspace_id, s.user_id
  FROM public.digest_subscriptions s
  WHERE s.enabled
    AND (now() AT TIME ZONE 'Europe/Paris')::time >= time '07:00'
    AND (s.last_day IS NULL OR s.last_day < (now() AT TIME ZONE 'Europe/Paris')::date)
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.workspace_id = s.workspace_id AND m.tenant_id = s.tenant_id AND m.user_id = s.user_id
        AND m.role IN ('owner','admin','operator'))
  ORDER BY s.last_day NULLS FIRST, s.workspace_id, s.user_id
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)
$fn$;
REVOKE ALL ON FUNCTION orbis_digest_due_subscriptions(integer) FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO orbis_inbox_dispatch;
ALTER FUNCTION orbis_digest_due_subscriptions(integer) OWNER TO orbis_inbox_dispatch;
REVOKE CREATE ON SCHEMA public FROM orbis_inbox_dispatch;

-- ---------------------------------------------------------------------------
-- Erasure (012): add the two tables, children first, same grants and policy.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION orbis_tenant_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$ SELECT ARRAY[
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
GRANT SELECT (tenant_id), DELETE ON digest_deliveries, digest_subscriptions TO orbis_tenant_eraser;
CREATE POLICY tenant_erase ON digest_deliveries FOR ALL TO orbis_tenant_eraser USING (tenant_id = nullif(current_setting('orbis.erase_tenant', true), ''));
CREATE POLICY tenant_erase ON digest_subscriptions FOR ALL TO orbis_tenant_eraser USING (tenant_id = nullif(current_setting('orbis.erase_tenant', true), ''));

-- scripts/migrate.ts grants DATABASE_APP_ROLE SELECT, INSERT, UPDATE on both
-- tables (never DELETE) and EXECUTE on orbis_digest_due_subscriptions.
