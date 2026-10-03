-- Multi-tenant inbox scheduler (V1 Phase 2).
-- 1. Per-workspace inbox settings: continuous-drafting opt-in, incremental
--    cursor, poll schedule and an optional monthly cost cap.
-- 2. "Today" visit markers (per user and workspace).
-- 3. A discovery-only dispatcher path: SECURITY DEFINER function owned by a
--    dedicated NOLOGIN, NOBYPASSRLS role that can read ONLY scheduling columns
--    (ids, status, timestamps) and returns ids only. All content is then read by
--    the worker under the workspace's own RLS context (app.* settings + a
--    verified owner/admin/operator membership), exactly like 004/007.
-- Same tenant contract as 004/007: FORCE RLS, transaction-local app.* settings.

ALTER TABLE inbox_batches ADD COLUMN since_at TIMESTAMPTZ;
COMMENT ON COLUMN inbox_batches.since_at IS 'Incremental batches only: list messages received at or after this instant (cursor minus overlap).';
CREATE INDEX inbox_batches_due ON inbox_batches(available_at, created_at) WHERE status IN ('queued','running');

CREATE TABLE inbox_settings (
  workspace_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  -- Explicit opt-in, default off. Turned on by an owner/admin after a completed first run.
  continuous_enabled BOOLEAN NOT NULL DEFAULT false,
  provider TEXT CHECK(provider IN ('gmail','outlook')),
  connected_account_id TEXT,
  interval_minutes INTEGER NOT NULL DEFAULT 15 CHECK(interval_minutes BETWEEN 5 AND 1440),
  -- Newest received_at fully handled for this account; incremental batches list after it.
  cursor_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  -- NULL = deployment default. Never writable by the runtime role (column grants
  -- in scripts/migrate.ts); set via orbis_set_workspace_inbox_cap() below.
  monthly_cap_cents INTEGER CHECK(monthly_cap_cents >= 0),
  enabled_by TEXT,
  enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE,
  CHECK (NOT continuous_enabled OR (provider IS NOT NULL AND connected_account_id IS NOT NULL AND next_run_at IS NOT NULL))
);
CREATE INDEX inbox_settings_due ON inbox_settings(next_run_at) WHERE continuous_enabled;

CREATE TABLE inbox_visits (
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id, user_id),
  FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE
);

ALTER TABLE inbox_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE inbox_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_visits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON inbox_settings FOR ALL USING (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=inbox_settings.workspace_id AND m.tenant_id=inbox_settings.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
) WITH CHECK (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=inbox_settings.workspace_id AND m.tenant_id=inbox_settings.tenant_id AND m.user_id=nullif(current_setting('app.user_id',true),''))
);
-- Visits are private to the user as well as scoped to the workspace.
CREATE POLICY tenant_access ON inbox_visits FOR ALL USING (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 user_id=nullif(current_setting('app.user_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=inbox_visits.workspace_id AND m.tenant_id=inbox_visits.tenant_id AND m.user_id=inbox_visits.user_id)
) WITH CHECK (
 workspace_id=nullif(current_setting('app.workspace_id',true),'') AND tenant_id=nullif(current_setting('app.tenant_id',true),'') AND
 user_id=nullif(current_setting('app.user_id',true),'') AND
 EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=inbox_visits.workspace_id AND m.tenant_id=inbox_visits.tenant_id AND m.user_id=inbox_visits.user_id)
);
REVOKE ALL ON inbox_settings, inbox_visits FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Dispatcher privilege model
-- orbis_inbox_dispatch: NOLOGIN, NOBYPASSRLS, NOINHERIT. It owns exactly one
-- function and holds column-level SELECT on scheduling columns only. RLS stays
-- FORCEd; the policies below apply to this role only and only for SELECT, so it
-- can never read subjects, drafts, stats, errors, workspace_state or any other
-- tenant content, and can never write anything. The runtime role is granted
-- EXECUTE on the function and must NOT be a member of this role
-- (scripts/check-platform.ts --database asserts it).
-- ---------------------------------------------------------------------------
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['orbis_inbox_dispatch','orbis_inbox_cap_admin'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION', r);
  END IF;
  -- The migration owner must be able to SET ROLE to assign function ownership.
  -- PostgreSQL 16+: grant without inheritance so the owner does not pick up
  -- these roles' policies on its own queries.
  IF current_setting('server_version_num')::int >= 160000 THEN
   IF NOT pg_has_role(current_user, r, 'SET') THEN
    EXECUTE format('GRANT %I TO %I WITH INHERIT FALSE, SET TRUE', r, current_user);
   END IF;
  ELSIF NOT pg_has_role(current_user, r, 'MEMBER') THEN
   EXECUTE format('GRANT %I TO %I', r, current_user);
  END IF;
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO orbis_inbox_dispatch;
GRANT SELECT (workspace_id, tenant_id, status, available_at, attempts, lease_until, created_at) ON inbox_batches TO orbis_inbox_dispatch;
GRANT SELECT (workspace_id, tenant_id, continuous_enabled, next_run_at) ON inbox_settings TO orbis_inbox_dispatch;
GRANT SELECT (workspace_id, tenant_id, user_id, role, created_at) ON memberships TO orbis_inbox_dispatch;
CREATE POLICY inbox_dispatch_discover ON inbox_batches FOR SELECT TO orbis_inbox_dispatch USING (true);
CREATE POLICY inbox_dispatch_discover ON inbox_settings FOR SELECT TO orbis_inbox_dispatch USING (true);
CREATE POLICY inbox_dispatch_discover ON memberships FOR SELECT TO orbis_inbox_dispatch USING (true);

-- Returns at most p_limit (1..200) workspaces with due inbox work, oldest due
-- first, and ONE acting member id (owner > admin > operator, oldest membership)
-- under which the worker processes that workspace. Ids, counts and timestamps
-- only. A workspace without an eligible member is never returned.
CREATE FUNCTION orbis_inbox_due_workspaces(p_limit integer)
RETURNS TABLE(tenant_id text, workspace_id text, worker_user_id text, due_batches integer, poll_due boolean, due_since timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  WITH due AS (
    SELECT b.workspace_id, b.tenant_id, count(*)::int AS batches, false AS poll, min(b.available_at) AS since
    FROM public.inbox_batches b
    WHERE (b.status = 'queued' AND b.attempts < 3 AND b.available_at <= now())
       OR (b.status = 'running' AND b.lease_until < now())
    GROUP BY b.workspace_id, b.tenant_id
    UNION ALL
    SELECT s.workspace_id, s.tenant_id, 0, true, s.next_run_at
    FROM public.inbox_settings s
    WHERE s.continuous_enabled AND s.next_run_at <= now()
  ), agg AS (
    SELECT d.workspace_id, d.tenant_id, sum(d.batches)::int AS batches, bool_or(d.poll) AS poll, min(d.since) AS since
    FROM due d GROUP BY d.workspace_id, d.tenant_id
  )
  SELECT a.tenant_id, a.workspace_id, m.user_id, a.batches, a.poll, a.since
  FROM agg a
  CROSS JOIN LATERAL (
    SELECT mm.user_id FROM public.memberships mm
    WHERE mm.workspace_id = a.workspace_id AND mm.tenant_id = a.tenant_id AND mm.role IN ('owner','admin','operator')
    ORDER BY CASE mm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, mm.created_at, mm.user_id
    LIMIT 1
  ) m
  ORDER BY a.since, a.workspace_id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
$fn$;
-- Privileges are set BEFORE the ownership transfer (a non-owner cannot revoke
-- the new owner's implicit PUBLIC grant afterwards). PostgreSQL requires the new
-- owner to hold CREATE on the schema at ALTER OWNER time only: granted for that
-- statement, then revoked immediately.
REVOKE ALL ON FUNCTION orbis_inbox_due_workspaces(integer) FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO orbis_inbox_dispatch;
ALTER FUNCTION orbis_inbox_due_workspaces(integer) OWNER TO orbis_inbox_dispatch;
REVOKE CREATE ON SCHEMA public FROM orbis_inbox_dispatch;

-- ---------------------------------------------------------------------------
-- Per-workspace cap administration (operator / later plan entitlements).
-- The runtime role can never write monthly_cap_cents (column grants). An
-- operator connected as the migration owner sets it with:
--   SELECT orbis_set_workspace_inbox_cap('<workspace id>', <cents or NULL>);
-- The function is owned by the NOLOGIN, NOBYPASSRLS role orbis_inbox_cap_admin,
-- which can only touch (workspace_id, tenant_id, monthly_cap_cents, updated_at).
-- EXECUTE is granted to the migration owner only, never to the runtime role.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO orbis_inbox_cap_admin;
GRANT SELECT (id, tenant_id) ON workspaces TO orbis_inbox_cap_admin;
GRANT SELECT (workspace_id, tenant_id, monthly_cap_cents) ON inbox_settings TO orbis_inbox_cap_admin;
GRANT INSERT (workspace_id, tenant_id, monthly_cap_cents) ON inbox_settings TO orbis_inbox_cap_admin;
GRANT UPDATE (monthly_cap_cents, updated_at) ON inbox_settings TO orbis_inbox_cap_admin;
CREATE POLICY inbox_cap_admin_lookup ON workspaces FOR SELECT TO orbis_inbox_cap_admin USING (true);
CREATE POLICY inbox_cap_admin_read ON inbox_settings FOR SELECT TO orbis_inbox_cap_admin USING (true);
CREATE POLICY inbox_cap_admin_insert ON inbox_settings FOR INSERT TO orbis_inbox_cap_admin WITH CHECK (true);
CREATE POLICY inbox_cap_admin_update ON inbox_settings FOR UPDATE TO orbis_inbox_cap_admin USING (true) WITH CHECK (true);
CREATE FUNCTION orbis_set_workspace_inbox_cap(p_workspace_id text, p_cents integer)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE v_tenant text;
BEGIN
  IF p_cents IS NOT NULL AND p_cents < 0 THEN RAISE EXCEPTION 'cap must be >= 0 or NULL'; END IF;
  SELECT w.tenant_id INTO v_tenant FROM public.workspaces w WHERE w.id = p_workspace_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unknown workspace'; END IF;
  INSERT INTO public.inbox_settings(workspace_id, tenant_id, monthly_cap_cents)
  VALUES (p_workspace_id, v_tenant, p_cents)
  ON CONFLICT (workspace_id) DO UPDATE SET monthly_cap_cents = EXCLUDED.monthly_cap_cents, updated_at = now();
END
$fn$;
REVOKE ALL ON FUNCTION orbis_set_workspace_inbox_cap(text, integer) FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO orbis_inbox_cap_admin;
ALTER FUNCTION orbis_set_workspace_inbox_cap(text, integer) OWNER TO orbis_inbox_cap_admin;
REVOKE CREATE ON SCHEMA public FROM orbis_inbox_cap_admin;
-- Only the new owner can grant EXECUTE now: act as it for this one statement.
DO $$ DECLARE migrator TEXT := current_user; BEGIN
 SET LOCAL ROLE orbis_inbox_cap_admin;
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.orbis_set_workspace_inbox_cap(text, integer) TO %I', migrator);
 RESET ROLE;
END $$;

-- scripts/migrate.ts grants DATABASE_APP_ROLE EXECUTE on orbis_inbox_due_workspaces
-- only (never on orbis_set_workspace_inbox_cap), and column-scoped
-- INSERT/UPDATE on inbox_settings (never monthly_cap_cents) plus SELECT,INSERT,UPDATE
-- on inbox_visits. No DELETE grant.
