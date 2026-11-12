-- 016 Retention: Orbi's questions on a reply draft, and request contact domains.
--
-- 1. inbox_messages.questions holds the model's questions about one reply draft
--    (« Quel prix confirmer à M. Dupont pour la pose ? »). Like the draft preview
--    they can name the contact, but the 30-day purge (012 + the inbox worker) only
--    nulled subject_preview and draft_preview: questions stayed for the life of
--    the workspace, visible in Today and in the export. They are now emptied with
--    the previews. Follow-up questions were already purged (012).
-- 2. pipeline_items.contact_domain: the workers' own purge (src/lib/followups/
--    store.ts) and « Effacer le contact » set contact_erased_at without nulling
--    the domain, and the cross-tenant purge below skipped rows already marked
--    erased. Rows past purge_after that still hold a domain are now cleared.
--
-- Same model as 012: orbis_retention (NOLOGIN, NOBYPASSRLS) only sees rows past
-- purge_after and only gets column grants on what it nulls (plus what its WHERE
-- clauses read). The function is replaced as its owner.

GRANT SELECT (questions), UPDATE (questions) ON inbox_messages TO orbis_retention;
DO $$ BEGIN
 IF to_regclass('public.pipeline_items') IS NOT NULL THEN
  GRANT SELECT (contact_domain) ON pipeline_items TO orbis_retention;
 END IF;
END $$;

DROP INDEX IF EXISTS inbox_messages_purge;
CREATE INDEX inbox_messages_purge ON inbox_messages(purge_after)
 WHERE subject_preview IS NOT NULL OR draft_preview IS NOT NULL OR questions <> '[]'::jsonb;

GRANT CREATE ON SCHEMA public TO orbis_retention;
SET LOCAL ROLE orbis_retention;
CREATE OR REPLACE FUNCTION orbis_retention_purge()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE a integer := 0; b integer := 0; c integer := 0; d integer := 0;
BEGIN
  UPDATE public.inbox_messages SET subject_preview = NULL, draft_preview = NULL, questions = '[]'::jsonb, updated_at = now()
   WHERE purge_after < now() AND (subject_preview IS NOT NULL OR draft_preview IS NOT NULL OR questions <> '[]'::jsonb);
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
           budget_text = NULL, deadline_text = NULL, contact_erased_at = COALESCE(contact_erased_at, now()), updated_at = now()
     WHERE purge_after < now() AND (contact_erased_at IS NULL OR contact_domain IS NOT NULL);
    GET DIAGNOSTICS d = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('inbox_previews', a, 'brain_previews', b, 'followup_previews', c, 'request_contacts', d);
END
$fn$;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM orbis_retention;
