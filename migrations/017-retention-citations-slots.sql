-- 017 Retention: citations and offered slots on a reply draft.
--
-- inbox_messages.citations holds verbatim excerpts of the company sources a
-- draft relied on (website profile, approved rules and memory, owner-approved
-- company sheet facts, imported knowledge). inbox_messages.proposed_slots holds
-- the owner's free calendar slots offered in a meeting draft. Both are copies:
-- they outlived the 30-day purge of the draft they belong to, and outlived the
-- deletion of the source they quote (a deleted document or rejected fact kept
-- living here for the life of the workspace, visible in Today and the export).
-- They are now emptied with the previews. Slot dedup only reads the last 7 days
-- (src/lib/inbox/meetings.ts), so purging at 30 days changes no draft.
--
-- Same model as 012/016: column grants only, function replaced as its owner.

GRANT SELECT (citations, proposed_slots), UPDATE (citations, proposed_slots) ON inbox_messages TO orbis_retention;

DROP INDEX IF EXISTS inbox_messages_purge;
CREATE INDEX inbox_messages_purge ON inbox_messages(purge_after)
 WHERE subject_preview IS NOT NULL OR draft_preview IS NOT NULL OR questions <> '[]'::jsonb
    OR citations <> '[]'::jsonb OR proposed_slots IS NOT NULL;

GRANT CREATE ON SCHEMA public TO orbis_retention;
SET LOCAL ROLE orbis_retention;
CREATE OR REPLACE FUNCTION orbis_retention_purge()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE a integer := 0; b integer := 0; c integer := 0; d integer := 0;
BEGIN
  UPDATE public.inbox_messages SET subject_preview = NULL, draft_preview = NULL, questions = '[]'::jsonb,
         citations = '[]'::jsonb, proposed_slots = NULL, updated_at = now()
   WHERE purge_after < now() AND (subject_preview IS NOT NULL OR draft_preview IS NOT NULL OR questions <> '[]'::jsonb
         OR citations <> '[]'::jsonb OR proposed_slots IS NOT NULL);
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
