-- Company brain (concept levels 3–5): living company sheet extracted from the
-- owner's SENT mail, ask-once questions, and learning from draft-vs-sent diffs.
-- Same tenant contract as 004/007/008: transaction-local app.* settings +
-- verified membership, FORCE RLS, no BYPASSRLS runtime role, no DELETE grant.
--
-- Data minimization:
--  * No mail body is stored. Sent messages are tracked by provider id, date and
--    a SHA-256 hash only (resumability + dedup).
--  * A fact keeps at most 3 supporting quotes of <= 240 chars each, taken from
--    the owner's own sent mail, with third-party names/emails/phones redacted
--    before storage. Quotes are the provenance the owner needs to validate the
--    fact; they are cleared when a fact is rejected.
--  * Draft outcomes store counts and a similarity ratio only (no text).

CREATE TABLE brain_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  request_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('extract_sent','regenerate_draft')),
  provider TEXT NOT NULL CHECK(provider IN ('gmail','outlook')),
  connected_account_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('test','scoped_autonomy')),
  window_days INTEGER NOT NULL DEFAULT 90 CHECK(window_days BETWEEN 1 AND 90),
  max_messages INTEGER NOT NULL DEFAULT 200 CHECK(max_messages BETWEEN 1 AND 200),
  -- regenerate_draft only: the inbox_messages row whose thread gets a NEW draft.
  inbox_message_id TEXT REFERENCES inbox_messages(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','budget_exhausted')),
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token TEXT,
  lease_until TIMESTAMPTZ,
  -- Draft receipt of a regeneration (same ledger states as inbox_messages).
  draft_idempotency_key TEXT UNIQUE,
  draft_state TEXT NOT NULL DEFAULT 'none' CHECK(draft_state IN ('none','claimed','uncertain','created','simulated')),
  draft_payload_hash TEXT,
  draft_policy_hash TEXT,
  draft_id TEXT,
  draft_attempts INTEGER NOT NULL DEFAULT 0 CHECK(draft_attempts BETWEEN 0 AND 3),
  draft_claimed_at TIMESTAMPTZ,
  drafted_at TIMESTAMPTZ,
  draft_reconciled BOOLEAN NOT NULL DEFAULT false,
  draft_preview TEXT CHECK(char_length(draft_preview) <= 1200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  purge_after TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
  UNIQUE(workspace_id, request_key),
  UNIQUE(id, workspace_id, tenant_id),
  FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE,
  CHECK ((status = 'running') = (lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK (kind <> 'regenerate_draft' OR inbox_message_id IS NOT NULL),
  CHECK (draft_state NOT IN ('created','simulated') OR draft_id IS NOT NULL)
);
CREATE INDEX brain_jobs_due ON brain_jobs(available_at, created_at) WHERE status IN ('queued','running');

-- One row per sent message examined (resumable, never re-billed). No text.
CREATE TABLE brain_sent_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  connected_account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','processed','skipped')),
  skip_reason TEXT CHECK(char_length(skip_reason) <= 60),
  facts_found INTEGER NOT NULL DEFAULT 0 CHECK(facts_found >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, connected_account_id, message_id),
  FOREIGN KEY(job_id,workspace_id,tenant_id) REFERENCES brain_jobs(id,workspace_id,tenant_id) ON DELETE CASCADE
);

CREATE TABLE brain_facts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('pricing','lead_time','service_area','terms','hours','offering','tone','rule','other')),
  -- Short normalized topic: two facts with the same category+topic and a
  -- different statement are a conflict (both kept, newest shown first).
  topic_key TEXT NOT NULL CHECK(char_length(topic_key) BETWEEN 1 AND 120),
  statement TEXT NOT NULL CHECK(char_length(statement) BETWEEN 1 AND 400),
  -- "Ça dépend": conditional answer text.
  condition TEXT CHECK(char_length(condition) <= 400),
  status TEXT NOT NULL CHECK(status IN ('candidate','approved','rejected','superseded')),
  origin TEXT NOT NULL CHECK(origin IN ('sent_mail','question_answer','edit_diff')),
  -- [{quote (<=240, redacted), messageId, sentAt}] — at most 3.
  quotes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(quotes)='array' AND jsonb_array_length(quotes) <= 3),
  evidence_at TIMESTAMPTZ,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5 CHECK(confidence BETWEEN 0 AND 1),
  valid_until TIMESTAMPTZ,
  question_id TEXT,
  job_id TEXT,
  inbox_message_id TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE,
  -- Nothing becomes approved without a human reviewer.
  CHECK (status <> 'approved' OR reviewed_by IS NOT NULL)
);
CREATE INDEX brain_facts_topic ON brain_facts(workspace_id, category, topic_key);
CREATE INDEX brain_facts_status ON brain_facts(workspace_id, status);

CREATE TABLE brain_questions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  canonical_key TEXT NOT NULL CHECK(char_length(canonical_key) BETWEEN 1 AND 200),
  label TEXT NOT NULL CHECK(char_length(label) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','dismissed')),
  occurrences INTEGER NOT NULL DEFAULT 1 CHECK(occurrences >= 1),
  answered_fact_id TEXT,
  answered_by TEXT,
  answered_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, canonical_key),
  UNIQUE(id, workspace_id, tenant_id),
  FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE,
  CHECK (status <> 'answered' OR answered_fact_id IS NOT NULL)
);
CREATE INDEX brain_questions_open ON brain_questions(workspace_id, last_seen_at) WHERE status = 'open';

-- Which drafts raised which question (to offer "nouvelle info disponible").
CREATE TABLE brain_question_messages (
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  inbox_message_id TEXT NOT NULL REFERENCES inbox_messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(question_id, inbox_message_id),
  FOREIGN KEY(question_id,workspace_id,tenant_id) REFERENCES brain_questions(id,workspace_id,tenant_id) ON DELETE CASCADE
);

-- Outcome of each real (non-simulated) Orbis draft. Counts only, no text.
CREATE TABLE brain_draft_outcomes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  inbox_message_id TEXT NOT NULL UNIQUE REFERENCES inbox_messages(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK(outcome IN ('pending','sent_as_is','sent_edited','not_used')),
  similarity NUMERIC(4,3) CHECK(similarity BETWEEN 0 AND 1),
  draft_chars INTEGER CHECK(draft_chars >= 0),
  sent_chars INTEGER CHECK(sent_chars >= 0),
  proposals INTEGER NOT NULL DEFAULT 0 CHECK(proposals BETWEEN 0 AND 2),
  checks INTEGER NOT NULL DEFAULT 0 CHECK(checks >= 0),
  checked_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE
);
CREATE INDEX brain_draft_outcomes_month ON brain_draft_outcomes(workspace_id, decided_at);

-- Model spend of brain jobs, counted in the same per-workspace monthly budget
-- as tasks and inbox drafts (see reserveWorkspaceBudget).
CREATE TABLE brain_usage (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('extract','explain_edit','regenerate')),
  ref_id TEXT NOT NULL,
  est_cost_cents INTEGER NOT NULL CHECK(est_cost_cents >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE
);
CREATE INDEX brain_usage_month ON brain_usage(workspace_id, created_at);

DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['brain_jobs','brain_sent_messages','brain_facts','brain_questions','brain_question_messages','brain_draft_outcomes','brain_usage'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_access ON %I FOR ALL USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''') AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=%I.workspace_id AND m.tenant_id=%I.tenant_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''') AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=%I.workspace_id AND m.tenant_id=%I.tenant_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',t,t,t,t,t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Dispatcher discovery for brain jobs: same privilege model as 008. The NOLOGIN,
-- NOBYPASSRLS role orbis_inbox_dispatch gets column-level SELECT on scheduling
-- columns of brain_jobs only and owns a SECURITY DEFINER function returning ids.
-- ---------------------------------------------------------------------------
GRANT SELECT (workspace_id, tenant_id, status, available_at, attempts, lease_until, created_at) ON brain_jobs TO orbis_inbox_dispatch;
CREATE POLICY inbox_dispatch_discover ON brain_jobs FOR SELECT TO orbis_inbox_dispatch USING (true);
CREATE FUNCTION orbis_brain_due_workspaces(p_limit integer)
RETURNS TABLE(tenant_id text, workspace_id text, worker_user_id text, due_jobs integer, due_since timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $fn$
  WITH due AS (
    SELECT j.workspace_id, j.tenant_id, count(*)::int AS jobs, min(j.available_at) AS since
    FROM public.brain_jobs j
    WHERE (j.status = 'queued' AND j.attempts < 3 AND j.available_at <= now())
       OR (j.status = 'running' AND j.lease_until < now())
    GROUP BY j.workspace_id, j.tenant_id
  )
  SELECT d.tenant_id, d.workspace_id, m.user_id, d.jobs, d.since
  FROM due d
  CROSS JOIN LATERAL (
    SELECT mm.user_id FROM public.memberships mm
    WHERE mm.workspace_id = d.workspace_id AND mm.tenant_id = d.tenant_id AND mm.role IN ('owner','admin','operator')
    ORDER BY CASE mm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, mm.created_at, mm.user_id
    LIMIT 1
  ) m
  ORDER BY d.since, d.workspace_id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200)
$fn$;
REVOKE ALL ON FUNCTION orbis_brain_due_workspaces(integer) FROM PUBLIC;
GRANT CREATE ON SCHEMA public TO orbis_inbox_dispatch;
ALTER FUNCTION orbis_brain_due_workspaces(integer) OWNER TO orbis_inbox_dispatch;
REVOKE CREATE ON SCHEMA public FROM orbis_inbox_dispatch;

-- scripts/migrate.ts grants DATABASE_APP_ROLE SELECT, INSERT, UPDATE on the
-- brain_* tables (no DELETE) and EXECUTE on orbis_brain_due_workspaces.
