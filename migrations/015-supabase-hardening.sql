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

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
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
