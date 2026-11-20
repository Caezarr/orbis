-- 018 Company sheet: no quote of the owner's sent mail on a replaced fact.
--
-- brain_facts.quotes holds short verbatim excerpts (<= 240 chars, third parties
-- masked) of the owner's own sent mail. A rejected fact already loses them
-- (src/lib/brain/service.ts). A fact *replaced* on the same topic (status
-- 'superseded': the owner approved another version, or answered Orbi's question
-- on that topic) kept them for the life of the workspace — candidates the owner
-- never reviewed included — and each new reading of the sent mail kept adding
-- fresh quotes to it. The owner could not erase them either: a superseded fact
-- can no longer be rejected. The code now empties the quotes when a fact is
-- replaced and never merges new ones into it; this clears the rows stored
-- before that change.
--
-- brain_facts has FORCE ROW LEVEL SECURITY and its policy needs a session
-- workspace: the owner lifts FORCE for this one statement, inside the
-- migration's transaction, and restores it before commit.

ALTER TABLE brain_facts NO FORCE ROW LEVEL SECURITY;
UPDATE brain_facts SET quotes = '[]'::jsonb, updated_at = now()
 WHERE status = 'superseded' AND quotes <> '[]'::jsonb;
ALTER TABLE brain_facts FORCE ROW LEVEL SECURITY;
