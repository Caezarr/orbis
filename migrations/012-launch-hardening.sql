-- V1 Phase 4 — launch hardening. See docs/product/launch-hardening.md.
--
-- 1. Shared rate limiting / budget counters for public endpoints, usable across
--    serverless instances. NO tenant data: the key is a hash computed by the
--    application (never a raw IP or email; enforced by a CHECK below). Access
--    only through SECURITY DEFINER functions owned by the NOLOGIN, NOBYPASSRLS
--    role orbis_rate_limiter. The runtime role has no privilege on the table.
-- 2. Tenant erasure (GDPR account/workspace deletion): one SECURITY DEFINER
--    function owned by the NOLOGIN, NOBYPASSRLS role orbis_tenant_eraser. That
--    role can DELETE only rows whose tenant_id equals the transaction-local
--    setting orbis.erase_tenant, which the function sets to the single tenant it
--    was asked to erase, after checking that the caller's verified context
--    (app.user_id / app.workspace_id / app.tenant_id) is an OWNER of exactly that
--    workspace. A minimal audit row without personal data is kept.
-- 3. Retention purge across tenants (previews, follow-up previews, request
--    contacts past purge_after) for workspaces with no worker activity: SECURITY
--    DEFINER function owned by the NOLOGIN, NOBYPASSRLS role orbis_retention,
--    whose policies only match rows already past purge_after and whose column
--    grants only cover the columns it nulls.
--
-- The migration owner needs CREATEROLE (like 008). scripts/migrate.ts grants
-- DATABASE_APP_ROLE EXECUTE on the functions below and nothing on the tables.

DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['orbis_rate_limiter','orbis_tenant_eraser','orbis_retention'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION', r);
  END IF;
  IF current_setting('server_version_num')::int >= 160000 THEN
   IF NOT pg_has_role(current_user, r, 'SET') THEN
    EXECUTE format('GRANT %I TO %I WITH INHERIT FALSE, SET TRUE', r, current_user);
   END IF;
  ELSIF NOT pg_has_role(current_user, r, 'MEMBER') THEN
   EXECUTE format('GRANT %I TO %I', r, current_user);
  END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
 END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Rate limit / budget counters (fixed windows)
-- ---------------------------------------------------------------------------
CREATE TABLE rate_limit_counters (
  bucket TEXT NOT NULL CHECK (bucket ~ '^[a-z0-9_.:-]{1,64}$'),
  -- Application-side hash (hex) of the client key, or '*' for a global counter.
  key_hash TEXT NOT NULL CHECK (key_hash ~ '^([a-f0-9]{32,128}|\*)$'),
  window_start TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used INTEGER NOT NULL CHECK (used >= 0),
  PRIMARY KEY (bucket, key_hash, window_start)
);
CREATE INDEX rate_limit_counters_expiry ON rate_limit_counters(expires_at);
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limit_counters FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_counters TO orbis_rate_limiter;
CREATE POLICY rate_limiter_only ON rate_limit_counters FOR ALL TO orbis_rate_limiter USING (true) WITH CHECK (true);

-- Atomic fixed-window take. Returns allowed, used (after the take when allowed)
-- and the milliseconds until the window resets.
CREATE FUNCTION orbis_rate_limit_take(p_bucket text, p_key text, p_window_seconds integer, p_limit integer, p_cost integer)
RETURNS TABLE(allowed boolean, used integer, retry_after_ms bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE v_start timestamptz; v_end timestamptz; v_used integer;
BEGIN
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 172800 THEN RAISE EXCEPTION 'invalid window'; END IF;
  IF p_limit IS NULL OR p_limit < 0 OR p_cost IS NULL OR p_cost < 1 OR p_cost > 1000000 THEN RAISE EXCEPTION 'invalid limit'; END IF;
  v_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_end := v_start + make_interval(secs => p_window_seconds);
  IF p_cost <= p_limit THEN
    INSERT INTO public.rate_limit_counters AS c(bucket, key_hash, window_start, expires_at, used)
    VALUES (p_bucket, p_key, v_start, v_end, p_cost)
    ON CONFLICT (bucket, key_hash, window_start) DO UPDATE SET used = c.used + EXCLUDED.used
      WHERE c.used + EXCLUDED.used <= p_limit
    RETURNING c.used INTO v_used;
    IF FOUND THEN
      RETURN QUERY SELECT true, v_used, 0::bigint;
      RETURN;
    END IF;
  END IF;
  SELECT c.used INTO v_used FROM public.rate_limit_counters c
   WHERE c.bucket = p_bucket AND c.key_hash = p_key AND c.window_start = v_start;
  RETURN QUERY SELECT false, coalesce(v_used, 0), greatest(0, (extract(epoch FROM (v_end - now())) * 1000)::bigint);
END
$fn$;

-- Daily (UTC) budget: reserve p_cost against a per-key cap AND a global cap,
-- atomically (the global row is locked first, so concurrent reservations of any
-- key serialize). Returns 'ok', 'global' or 'key'. Reservations are never refunded.
CREATE FUNCTION orbis_budget_reserve(p_bucket text, p_key text, p_cost integer, p_key_cap integer, p_global_cap integer)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v_start timestamptz; v_end timestamptz; v_global integer; v_key integer;
BEGIN
  IF p_cost IS NULL OR p_cost < 1 OR p_cost > 1000000 OR p_key_cap IS NULL OR p_key_cap < 0 OR p_global_cap IS NULL OR p_global_cap < 0 THEN
    RAISE EXCEPTION 'invalid budget';
  END IF;
  IF p_key = '*' THEN RAISE EXCEPTION 'invalid key'; END IF;
  v_start := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_end := v_start + interval '1 day';
  INSERT INTO public.rate_limit_counters(bucket, key_hash, window_start, expires_at, used)
  VALUES (p_bucket, '*', v_start, v_end, 0) ON CONFLICT DO NOTHING;
  SELECT c.used INTO v_global FROM public.rate_limit_counters c
   WHERE c.bucket = p_bucket AND c.key_hash = '*' AND c.window_start = v_start FOR UPDATE;
  IF v_global + p_cost > p_global_cap THEN RETURN 'global'; END IF;
  SELECT c.used INTO v_key FROM public.rate_limit_counters c
   WHERE c.bucket = p_bucket AND c.key_hash = p_key AND c.window_start = v_start FOR UPDATE;
  IF coalesce(v_key, 0) + p_cost > p_key_cap THEN RETURN 'key'; END IF;
  INSERT INTO public.rate_limit_counters AS c(bucket, key_hash, window_start, expires_at, used)
  VALUES (p_bucket, p_key, v_start, v_end, p_cost)
  ON CONFLICT (bucket, key_hash, window_start) DO UPDATE SET used = c.used + EXCLUDED.used;
  UPDATE public.rate_limit_counters c SET used = c.used + p_cost
   WHERE c.bucket = p_bucket AND c.key_hash = '*' AND c.window_start = v_start;
  RETURN 'ok';
END
$fn$;

-- Cleanup of expired windows (called by the retention cron). Returns rows deleted.
CREATE FUNCTION orbis_rate_limit_purge()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v integer;
BEGIN
  DELETE FROM public.rate_limit_counters c WHERE c.expires_at < now();
  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN v;
END
$fn$;

DO $$ BEGIN
 REVOKE ALL ON FUNCTION orbis_rate_limit_take(text, text, integer, integer, integer) FROM PUBLIC;
 REVOKE ALL ON FUNCTION orbis_budget_reserve(text, text, integer, integer, integer) FROM PUBLIC;
 REVOKE ALL ON FUNCTION orbis_rate_limit_purge() FROM PUBLIC;
END $$;
GRANT CREATE ON SCHEMA public TO orbis_rate_limiter;
ALTER FUNCTION orbis_rate_limit_take(text, text, integer, integer, integer) OWNER TO orbis_rate_limiter;
ALTER FUNCTION orbis_budget_reserve(text, text, integer, integer, integer) OWNER TO orbis_rate_limiter;
ALTER FUNCTION orbis_rate_limit_purge() OWNER TO orbis_rate_limiter;
REVOKE CREATE ON SCHEMA public FROM orbis_rate_limiter;

-- ---------------------------------------------------------------------------
-- 2. Tenant erasure
-- ---------------------------------------------------------------------------
-- Minimal audit: no tenant/workspace/user id in clear, no name, no email.
CREATE TABLE tenant_erasures (
  id UUID PRIMARY KEY,
  tenant_hash TEXT NOT NULL CHECK (tenant_hash ~ '^[a-f0-9]{64}$'),
  erased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_counts JSONB NOT NULL CHECK (jsonb_typeof(row_counts) = 'object')
);
ALTER TABLE tenant_erasures ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_erasures FORCE ROW LEVEL SECURITY;
REVOKE ALL ON tenant_erasures FROM PUBLIC;
GRANT INSERT ON tenant_erasures TO orbis_tenant_eraser;
CREATE POLICY tenant_eraser_audit ON tenant_erasures FOR INSERT TO orbis_tenant_eraser WITH CHECK (true);

-- Children first. Tables are skipped when absent (e.g. 009 not applied).
CREATE FUNCTION orbis_tenant_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $fn$ SELECT ARRAY[
  'brain_question_messages','brain_draft_outcomes','brain_sent_messages','brain_usage',
  'brain_questions','brain_facts','brain_jobs',
  'followups','pipeline_usage','pipeline_items','pipeline_settings',
  'inbox_messages','inbox_batches','inbox_visits','inbox_settings',
  'billing_trials','task_charges','task_payment_batches','task_effort',
  'operational_acceptances','operational_tasks','product_events',
  'stripe_checkout_attempts','stripe_subscriptions','stripe_customers',
  'workspace_state','memberships','workspaces'
]::text[] $fn$;

DO $$ DECLARE t TEXT; rls BOOLEAN; BEGIN
 FOREACH t IN ARRAY orbis_tenant_tables() LOOP
  IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
  EXECUTE format('GRANT SELECT (tenant_id), DELETE ON public.%I TO orbis_tenant_eraser', t);
  SELECT c.relrowsecurity INTO rls FROM pg_class c WHERE c.oid = ('public.' || t)::regclass;
  IF rls THEN
   EXECUTE format('CREATE POLICY tenant_erase ON public.%I FOR ALL TO orbis_tenant_eraser USING (tenant_id = nullif(current_setting(''orbis.erase_tenant'', true), ''''))', t);
  END IF;
 END LOOP;
END $$;
GRANT SELECT (id, workspace_id, user_id, role) ON memberships TO orbis_tenant_eraser;
GRANT SELECT (id) ON workspaces TO orbis_tenant_eraser;

-- Erases every row of ONE tenant. Caller must run with a verified context whose
-- app.user_id is an OWNER of p_workspace_id (the API also requires a recent
-- sign-in and a typed confirmation). Returns per-table counts (no content).
CREATE FUNCTION orbis_erase_tenant(p_workspace_id text, p_tenant_id text, p_confirm text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v_user text := nullif(current_setting('app.user_id', true), '');
        t text; n integer; v_counts jsonb := '{}'::jsonb;
BEGIN
  IF v_user IS NULL OR p_workspace_id IS NULL OR p_tenant_id IS NULL THEN RAISE EXCEPTION 'erasure requires a verified context'; END IF;
  IF p_confirm IS DISTINCT FROM ('erase:' || p_workspace_id) THEN RAISE EXCEPTION 'erasure confirmation mismatch'; END IF;
  IF nullif(current_setting('app.workspace_id', true), '') IS DISTINCT FROM p_workspace_id
     OR nullif(current_setting('app.tenant_id', true), '') IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'erasure target must be the session workspace';
  END IF;
  PERFORM set_config('orbis.erase_tenant', p_tenant_id, true);
  IF NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = p_workspace_id AND w.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'unknown workspace';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.workspace_id = p_workspace_id AND m.tenant_id = p_tenant_id AND m.user_id = v_user AND m.role = 'owner') THEN
    RAISE EXCEPTION 'only the workspace owner can erase it';
  END IF;
  -- Serialize with workers/claims of this tenant.
  PERFORM pg_advisory_xact_lock(hashtextextended('orbis-erase:' || p_tenant_id, 0));
  FOREACH t IN ARRAY public.orbis_tenant_tables() LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', t) USING p_tenant_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN v_counts := v_counts || jsonb_build_object(t, n); END IF;
  END LOOP;
  INSERT INTO public.tenant_erasures(id, tenant_hash, row_counts)
  VALUES (gen_random_uuid(), encode(sha256(convert_to(p_tenant_id, 'UTF8')), 'hex'), v_counts);
  PERFORM set_config('orbis.erase_tenant', '', true);
  RETURN v_counts;
END
$fn$;
REVOKE ALL ON FUNCTION orbis_erase_tenant(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION orbis_tenant_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orbis_tenant_tables() TO orbis_tenant_eraser;
GRANT CREATE ON SCHEMA public TO orbis_tenant_eraser;
ALTER FUNCTION orbis_erase_tenant(text, text, text) OWNER TO orbis_tenant_eraser;
REVOKE CREATE ON SCHEMA public FROM orbis_tenant_eraser;

-- ---------------------------------------------------------------------------
-- 3. Retention purge (cross-tenant, expired rows only, nulling columns only)
-- ---------------------------------------------------------------------------
-- The tenant policies of these tables (PUBLIC, OR-ed) reference memberships:
-- the role needs column SELECT to evaluate them; without app.* settings they
-- match no row, so this grants no tenant visibility.
GRANT SELECT (workspace_id, tenant_id, user_id) ON memberships TO orbis_retention;
GRANT SELECT (id, purge_after, subject_preview, draft_preview), UPDATE (subject_preview, draft_preview, updated_at) ON inbox_messages TO orbis_retention;
CREATE POLICY retention_expired ON inbox_messages FOR ALL TO orbis_retention USING (purge_after < now()) WITH CHECK (purge_after < now());
DO $$ BEGIN
 IF to_regclass('public.brain_jobs') IS NOT NULL THEN
  GRANT SELECT (id, purge_after, draft_preview), UPDATE (draft_preview) ON brain_jobs TO orbis_retention;
  CREATE POLICY retention_expired ON brain_jobs FOR ALL TO orbis_retention USING (purge_after < now()) WITH CHECK (purge_after < now());
 END IF;
 IF to_regclass('public.pipeline_items') IS NOT NULL THEN
  GRANT SELECT (id, purge_after, contact_erased_at, contact_name, contact_email, need_summary, budget_text, deadline_text),
        UPDATE (contact_name, contact_email, contact_domain, need_summary, budget_text, deadline_text, contact_erased_at, updated_at) ON pipeline_items TO orbis_retention;
  CREATE POLICY retention_expired ON pipeline_items FOR ALL TO orbis_retention USING (purge_after < now()) WITH CHECK (purge_after < now());
  GRANT SELECT (id, purge_after, draft_preview), UPDATE (draft_preview, questions, updated_at) ON followups TO orbis_retention;
  CREATE POLICY retention_expired ON followups FOR ALL TO orbis_retention USING (purge_after < now()) WITH CHECK (purge_after < now());
 END IF;
END $$;

CREATE FUNCTION orbis_retention_purge()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE a integer := 0; b integer := 0; c integer := 0; d integer := 0;
BEGIN
  UPDATE public.inbox_messages SET subject_preview = NULL, draft_preview = NULL, updated_at = now()
   WHERE purge_after < now() AND (subject_preview IS NOT NULL OR draft_preview IS NOT NULL);
  GET DIAGNOSTICS a = ROW_COUNT;
  IF to_regclass('public.brain_jobs') IS NOT NULL THEN
    UPDATE public.brain_jobs SET draft_preview = NULL WHERE purge_after < now() AND draft_preview IS NOT NULL;
    GET DIAGNOSTICS b = ROW_COUNT;
  END IF;
  IF to_regclass('public.pipeline_items') IS NOT NULL THEN
    UPDATE public.followups SET draft_preview = NULL, questions = '[]'::jsonb, updated_at = now()
     WHERE purge_after < now() AND draft_preview IS NOT NULL;
    GET DIAGNOSTICS c = ROW_COUNT;
    UPDATE public.pipeline_items SET contact_name = NULL, contact_email = NULL, contact_domain = NULL, need_summary = NULL,
           budget_text = NULL, deadline_text = NULL, contact_erased_at = now(), updated_at = now()
     WHERE purge_after < now() AND contact_erased_at IS NULL;
    GET DIAGNOSTICS d = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('inbox_previews', a, 'brain_previews', b, 'followup_previews', c, 'request_contacts', d);
END
$fn$;
REVOKE ALL ON FUNCTION orbis_retention_purge() FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO orbis_retention;
ALTER FUNCTION orbis_retention_purge() OWNER TO orbis_retention;
REVOKE CREATE ON SCHEMA public FROM orbis_retention;

-- scripts/migrate.ts grants DATABASE_APP_ROLE EXECUTE on orbis_rate_limit_take,
-- orbis_budget_reserve, orbis_rate_limit_purge, orbis_erase_tenant and
-- orbis_retention_purge (acting as each owner role), and no table privilege on
-- rate_limit_counters or tenant_erasures.
