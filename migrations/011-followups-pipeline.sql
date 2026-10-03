-- Concept levels 6 (follow-ups) and 7 (request pipeline); level 8 (measured
-- weekly report) is computed from existing tables + these. See
-- docs/product/followups-pipeline-report.md.
--
-- Same tenant contract as 007/008/009/010: FORCE RLS, transaction-local app.*
-- settings + verified membership, runtime role gets SELECT/INSERT/UPDATE and
-- never DELETE (scripts/migrate.ts). Everything cascades from `workspaces`, so
-- deleting a workspace deletes its pipeline, follow-ups and usage rows.
--
-- Personal data (GDPR): pipeline_items keeps the customer's display name and
-- email address of a request thread, for the workspace owner's own customer
-- follow-up (legitimate interest, Art. 6(1)(f)). No inbound email body is
-- stored: only a short model summary of the need whose supporting quote was
-- verified in memory, and budget/deadline as VERBATIM short excerpts. Contact
-- fields are nulled at `purge_after` (24 months after the last activity) or on
-- request (`contact_erased_at`).

CREATE TABLE pipeline_settings (
  workspace_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  followups_enabled BOOLEAN NOT NULL DEFAULT true,
  -- Business days (Europe/Paris weekends + French public holidays) without a
  -- customer reply before a follow-up draft is proposed.
  followup_business_days INTEGER NOT NULL DEFAULT 5 CHECK (followup_business_days BETWEEN 1 AND 30),
  followup_max_stages INTEGER NOT NULL DEFAULT 2 CHECK (followup_max_stages BETWEEN 1 AND 2),
  -- Manual baseline entered by the owner (minutes to write one reply by hand).
  -- NULL = no time estimate is ever shown in the weekly report.
  reply_baseline_minutes INTEGER CHECK (reply_baseline_minutes BETWEEN 1 AND 240),
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE pipeline_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gmail','outlook')),
  connected_account_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  first_message_row_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('customer_request','quote_request')),
  contact_name TEXT CHECK (char_length(contact_name) <= 120),
  contact_email TEXT CHECK (char_length(contact_email) <= 254),
  contact_domain TEXT CHECK (char_length(contact_domain) <= 253),
  contact_erased_at TIMESTAMPTZ,
  need_summary TEXT CHECK (char_length(need_summary) <= 160),
  budget_text TEXT CHECK (char_length(budget_text) <= 80),
  deadline_text TEXT CHECK (char_length(deadline_text) <= 80),
  extraction_state TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_state IN ('pending','done','unverified','budget','failed')),
  status TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','repondu','relance','gagne','perdu')),
  first_customer_at TIMESTAMPTZ,
  last_customer_at TIMESTAMPTZ,
  first_replied_at TIMESTAMPTZ,
  last_owner_at TIMESTAMPTZ,
  relance_at TIMESTAMPTZ,
  awaiting_customer BOOLEAN NOT NULL DEFAULT false,
  next_check_at TIMESTAMPTZ,
  checks INTEGER NOT NULL DEFAULT 0 CHECK (checks >= 0),
  snoozed_until TIMESTAMPTZ,
  followups_dismissed BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_after TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 months',
  UNIQUE (workspace_id, connected_account_id, thread_id),
  UNIQUE (id, workspace_id, tenant_id),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE,
  -- Manual outcomes only: gagné/perdu always carry who decided and when.
  CHECK (status NOT IN ('gagne','perdu') OR (closed_at IS NOT NULL AND closed_by IS NOT NULL)),
  CHECK (contact_erased_at IS NULL OR (contact_name IS NULL AND contact_email IS NULL))
);
CREATE INDEX pipeline_items_due ON pipeline_items (workspace_id, next_check_at) WHERE next_check_at IS NOT NULL;
CREATE INDEX pipeline_items_list ON pipeline_items (workspace_id, first_customer_at DESC);

CREATE TABLE followups (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  pipeline_item_id TEXT NOT NULL,
  stage INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 2),
  status TEXT NOT NULL DEFAULT 'drafting' CHECK (status IN ('drafting','drafted','needs_review','uncertain','failed','not_needed','dismissed')),
  -- Owner message this follow-up follows up on, and when it became due.
  owner_message_at TIMESTAMPTZ NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  reason TEXT CHECK (char_length(reason) <= 40),
  draft_idempotency_key TEXT UNIQUE,
  draft_state TEXT NOT NULL DEFAULT 'none' CHECK (draft_state IN ('none','claimed','uncertain','created','simulated')),
  draft_payload_hash TEXT,
  draft_policy_hash TEXT,
  draft_id TEXT,
  draft_attempts INTEGER NOT NULL DEFAULT 0 CHECK (draft_attempts BETWEEN 0 AND 3),
  draft_claimed_at TIMESTAMPTZ,
  drafted_at TIMESTAMPTZ,
  draft_reconciled BOOLEAN NOT NULL DEFAULT false,
  draft_preview TEXT CHECK (char_length(draft_preview) <= 1200),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array'),
  flags JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(flags) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_after TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
  -- Idempotent: one follow-up per thread and stage, at most 2 stages.
  UNIQUE (pipeline_item_id, stage),
  FOREIGN KEY (pipeline_item_id, workspace_id, tenant_id) REFERENCES pipeline_items(id, workspace_id, tenant_id) ON DELETE CASCADE,
  CHECK (draft_state NOT IN ('created','simulated') OR draft_id IS NOT NULL)
);
CREATE INDEX followups_week ON followups (workspace_id, drafted_at) WHERE drafted_at IS NOT NULL;

-- Estimated model spend of levels 6/7, summed into the same per-workspace
-- monthly cap as tasks, inbox drafts and the company brain.
CREATE TABLE pipeline_usage (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('request_extract','followup_classify','followup_draft')),
  ref_id TEXT NOT NULL,
  est_cost_cents INTEGER NOT NULL CHECK (est_cost_cents >= 0),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, tenant_id) REFERENCES workspaces(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX pipeline_usage_month ON pipeline_usage (workspace_id, created_at);

DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['pipeline_settings','pipeline_items','followups','pipeline_usage'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_access ON %I FOR ALL USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''') AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=%I.workspace_id AND m.tenant_id=%I.tenant_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''') AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=%I.workspace_id AND m.tenant_id=%I.tenant_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',t,t,t,t,t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
-- scripts/migrate.ts grants SELECT, INSERT, UPDATE on these four tables to the
-- runtime role (no DELETE). The dispatcher role gets nothing: follow-ups run
-- inside the existing inbox batches, under the workspace's own RLS context.
