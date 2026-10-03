-- 015 Supabase hosting hardening.
--
-- Orbis reaches PostgreSQL only through its own roles (DATABASE_URL = runtime
-- role, migrations = owner). Supabase is used for Auth, never for its Data API
-- (PostgREST). Two Supabase defaults conflict with that design:
--
-- 1. The public schema grants table/sequence/function privileges to the API
--    roles `anon` and `authenticated` by default. Nothing in Orbis needs them,
--    so they are revoked, now and for objects created later by this owner.
-- 2. The `ensure_rls` event trigger enables row level security on every new
--    table. Server-only tables below are deliberately without RLS (access is
--    limited by grants; see 002, 003, 006, 010 and scripts/migrate.ts). With RLS
--    on and no policy they look empty to the runtime and definer roles, which
--    breaks plan caps (010) and the Stripe webhook. RLS is turned back off on
--    exactly those tables. Tenant tables keep ENABLE + FORCE RLS.
--
-- Safe on plain PostgreSQL: the API roles may not exist, and DISABLE on a table
-- without RLS is a no-op. A future table meant to have no RLS must also be
-- listed in a later migration when hosted on Supabase.

-- Grants on an object can only be revoked by its owner. Definer functions are
-- owned by NOLOGIN roles (008-013) that the migration owner can SET ROLE to
-- (it assigned that ownership), so each revoke runs as the object's owner.
DO $$
DECLARE
  me text := current_user;
  api text;
  obj record;
BEGIN
  FOREACH api IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api) THEN
      CONTINUE;
    END IF;
    FOR obj IN
      SELECT 'TABLE' AS kind, format('public.%I', c.relname) AS name, pg_get_userbyid(c.relowner) AS owner
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p','f')
      UNION ALL
      SELECT 'SEQUENCE', format('public.%I', c.relname), pg_get_userbyid(c.relowner)
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'S'
      UNION ALL
      SELECT 'FUNCTION', format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)), pg_get_userbyid(p.proowner)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prokind IN ('f','p')
    LOOP
      BEGIN
        IF obj.owner <> me THEN
          EXECUTE format('SET LOCAL ROLE %I', obj.owner);
        END IF;
        EXECUTE format('REVOKE ALL ON %s %s FROM %I', obj.kind, obj.name, api);
        EXECUTE format('SET LOCAL ROLE %I', me);
      EXCEPTION WHEN insufficient_privilege THEN
        -- Objects owned by a role we cannot act as (extension objects owned by
        -- the platform) are left alone; the error rolls the SET ROLE back.
        RAISE NOTICE 'skipped % % owned by %', obj.kind, obj.name, obj.owner;
      END;
    END LOOP;
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api);
  END LOOP;
END
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing_plan_caps',
    'stripe_customers',
    'stripe_subscriptions',
    'stripe_events',
    'stripe_checkout_attempts',
    'task_payment_batches',
    'schema_migrations'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END
$$;
