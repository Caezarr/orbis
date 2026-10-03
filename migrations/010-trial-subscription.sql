-- V1 Phase 3: free trial + subscription plans with draft quotas.
-- Independent of 009 (applies with or without it). See docs/product/billing-v1.md.
--
-- 1. Plan keys: 'solo' / 'equipe' replace 'Solo' / 'Business' (same Stripe
--    price env for Solo; Equipe falls back to the Business base price env).
-- 2. billing_trials: one insert-only row per workspace, created at the first
--    mailbox batch. Same tenant contract as 007/008 (FORCE RLS + membership).
-- 3. inbox_batches.status gains 'quota_reached' and 'plan_inactive'.
-- 4. Plan cap sync: SECURITY DEFINER function owned by the existing NOLOGIN,
--    NOBYPASSRLS role orbis_inbox_cap_admin (008). Unlike
--    orbis_set_workspace_inbox_cap (operator-only, any value), this one is
--    executable by the runtime role so the signature-verified webhook and the
--    trial start can apply plan caps, but it CLAMPS every value to a per-plan
--    ceiling stored in billing_plan_caps, which the runtime role can neither
--    write nor read. A compromised runtime role can therefore never raise a
--    workspace cap above the highest plan ceiling set by the operator.

-- 1. Plan keys --------------------------------------------------------------
ALTER TABLE stripe_subscriptions DROP CONSTRAINT IF EXISTS stripe_subscriptions_plan_check;
UPDATE stripe_subscriptions SET plan = CASE plan WHEN 'Solo' THEN 'solo' WHEN 'Business' THEN 'equipe' ELSE plan END;
ALTER TABLE stripe_subscriptions ADD CONSTRAINT stripe_subscriptions_plan_check CHECK (plan IN ('solo','equipe'));
ALTER TABLE stripe_checkout_attempts DROP CONSTRAINT IF EXISTS stripe_checkout_attempts_plan_check;
UPDATE stripe_checkout_attempts SET plan = CASE plan WHEN 'Solo' THEN 'solo' WHEN 'Business' THEN 'equipe' ELSE plan END;
ALTER TABLE stripe_checkout_attempts ADD CONSTRAINT stripe_checkout_attempts_plan_check CHECK (plan IN ('solo','equipe'));

-- 2. Trials -----------------------------------------------------------------
CREATE TABLE billing_trials (
  workspace_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  -- Limits recorded at start: later config changes never shorten a running trial.
  draft_limit INTEGER NOT NULL CHECK (draft_limit > 0),
  config_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE,
  CHECK (ends_at > started_at)
);
ALTER TABLE billing_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_trials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON billing_trials FOR ALL USING (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=billing_trials.workspace_id AND m.tenant_id=billing_trials.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
) WITH CHECK (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=billing_trials.workspace_id AND m.tenant_id=billing_trials.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
);
REVOKE ALL ON billing_trials FROM PUBLIC;
-- scripts/migrate.ts grants the runtime role SELECT, INSERT only (no UPDATE/DELETE).

-- 3. Batch states -----------------------------------------------------------
ALTER TABLE inbox_batches DROP CONSTRAINT IF EXISTS inbox_batches_status_check;
ALTER TABLE inbox_batches ADD CONSTRAINT inbox_batches_status_check
  CHECK (status IN ('queued','running','completed','failed','budget_exhausted','quota_reached','plan_inactive'));

-- 4. Plan cap ceilings + sync function -------------------------------------
-- Operator-owned. Values are estimated model-cost cents per workspace and month.
-- Raise them (as the migration owner) before raising ORBIS_*_CAP_CENTS above.
CREATE TABLE billing_plan_caps (
  plan_key TEXT PRIMARY KEY CHECK (plan_key IN ('trial','solo','equipe','none')),
  max_monthly_cap_cents INTEGER NOT NULL CHECK (max_monthly_cap_cents >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO billing_plan_caps(plan_key, max_monthly_cap_cents) VALUES
  ('trial', 1500), ('solo', 5000), ('equipe', 25000), ('none', 0);
REVOKE ALL ON billing_plan_caps FROM PUBLIC;

GRANT SELECT ON billing_plan_caps TO orbis_inbox_cap_admin;
GRANT SELECT (tenant_id, plan, status) ON stripe_subscriptions TO orbis_inbox_cap_admin;

CREATE FUNCTION orbis_sync_workspace_plan_cap(p_tenant_id text, p_plan text, p_cents integer)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v_workspace text; v_ceiling integer; v_cap integer;
BEGIN
  IF p_cents IS NULL OR p_cents < 0 THEN RAISE EXCEPTION 'cap must be >= 0'; END IF;
  SELECT c.max_monthly_cap_cents INTO v_ceiling FROM public.billing_plan_caps c WHERE c.plan_key = p_plan;
  IF v_ceiling IS NULL THEN RAISE EXCEPTION 'unknown plan'; END IF;
  SELECT w.id INTO v_workspace FROM public.workspaces w WHERE w.tenant_id = p_tenant_id;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'unknown tenant'; END IF;
  -- A paid cap needs a synced subscription of that plan (defense in depth:
  -- stripe_subscriptions is only written by the signature-verified webhook).
  IF p_plan IN ('solo','equipe') AND NOT EXISTS (
    SELECT 1 FROM public.stripe_subscriptions s
    WHERE s.tenant_id = p_tenant_id AND s.plan = p_plan AND s.status IN ('active','trialing','past_due','unpaid')
  ) THEN RAISE EXCEPTION 'no matching subscription'; END IF;
  v_cap := least(p_cents, v_ceiling);
  INSERT INTO public.inbox_settings(workspace_id, tenant_id, monthly_cap_cents)
  VALUES (v_workspace, p_tenant_id, v_cap)
  ON CONFLICT (workspace_id) DO UPDATE SET monthly_cap_cents = EXCLUDED.monthly_cap_cents, updated_at = now();
  RETURN v_cap;
END
$fn$;
REVOKE ALL ON FUNCTION orbis_sync_workspace_plan_cap(text, text, integer) FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO orbis_inbox_cap_admin;
ALTER FUNCTION orbis_sync_workspace_plan_cap(text, text, integer) OWNER TO orbis_inbox_cap_admin;
REVOKE CREATE ON SCHEMA public FROM orbis_inbox_cap_admin;
DO $$ DECLARE migrator TEXT := current_user; BEGIN
 SET LOCAL ROLE orbis_inbox_cap_admin;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.orbis_sync_workspace_plan_cap(text, text, integer) TO %I', migrator);
 RESET ROLE;
END $$;
-- scripts/migrate.ts grants DATABASE_APP_ROLE EXECUTE on this function (never on
-- orbis_set_workspace_inbox_cap) and no privilege at all on billing_plan_caps.
