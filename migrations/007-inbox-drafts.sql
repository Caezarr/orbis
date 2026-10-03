-- Inbox reply drafts: mailbox batches (worker jobs) and per-message receipts.
-- Same tenant contract as 004/005: transaction-local app.* settings + membership,
-- FORCE RLS, no BYPASSRLS runtime role. Email BODIES ARE NEVER STORED: only
-- provider ids, a content hash, the classification, the generated draft preview
-- (our own text) and a truncated subject, both purged after `purge_after`.
CREATE TABLE inbox_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'first_run' CHECK(kind IN ('first_run','incremental')),
  provider TEXT NOT NULL CHECK(provider IN ('gmail','outlook')),
  connected_account_id TEXT NOT NULL,
  mission_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('test','scoped_autonomy')),
  window_days INTEGER NOT NULL CHECK(window_days BETWEEN 1 AND 31),
  max_messages INTEGER NOT NULL CHECK(max_messages BETWEEN 1 AND 50),
  max_drafts INTEGER NOT NULL CHECK(max_drafts BETWEEN 0 AND 50),
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','budget_exhausted')),
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token TEXT,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(workspace_id, request_key),
  UNIQUE(id, workspace_id, tenant_id),
  FOREIGN KEY(workspace_id,tenant_id) REFERENCES workspaces(id,tenant_id) ON DELETE CASCADE,
  CHECK ((status = 'running') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX inbox_batches_queue ON inbox_batches(workspace_id, available_at, created_at) WHERE status IN ('queued','running');

CREATE TABLE inbox_messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('gmail','outlook')),
  connected_account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  mission_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  received_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK(status IN ('seen','skipped','classified','drafting','drafted','needs_review','uncertain','failed')),
  classification TEXT CHECK(classification IN ('customer_request','quote_request','supplier','admin','noise')),
  skip_reason TEXT,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Short-lived display data. Subject truncated to 120 chars; draft preview is
  -- Orbis-generated text (max 1200 chars), never the inbound body.
  subject_preview TEXT CHECK(char_length(subject_preview) <= 120),
  draft_preview TEXT CHECK(char_length(draft_preview) <= 1200),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Draft receipt / idempotency ledger (one draft per account+message+version).
  draft_idempotency_key TEXT UNIQUE,
  draft_state TEXT NOT NULL DEFAULT 'none' CHECK(draft_state IN ('none','claimed','uncertain','created','simulated')),
  draft_payload_hash TEXT,
  draft_policy_hash TEXT,
  draft_id TEXT,
  draft_attempts INTEGER NOT NULL DEFAULT 0 CHECK(draft_attempts BETWEEN 0 AND 3),
  draft_claimed_at TIMESTAMPTZ,
  drafted_at TIMESTAMPTZ,
  draft_reconciled BOOLEAN NOT NULL DEFAULT false,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0),
  est_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK(est_cost_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_after TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
  UNIQUE(workspace_id, connected_account_id, message_id, mission_version),
  FOREIGN KEY(batch_id,workspace_id,tenant_id) REFERENCES inbox_batches(id,workspace_id,tenant_id) ON DELETE CASCADE,
  CHECK (draft_state NOT IN ('created','simulated') OR draft_id IS NOT NULL)
);
CREATE INDEX inbox_messages_batch ON inbox_messages(batch_id, created_at);
CREATE INDEX inbox_messages_month_cost ON inbox_messages(workspace_id, created_at) WHERE est_cost_cents > 0;
CREATE INDEX inbox_messages_purge ON inbox_messages(purge_after) WHERE subject_preview IS NOT NULL OR draft_preview IS NOT NULL;

DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['inbox_batches','inbox_messages'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_access ON %I FOR ALL USING (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''') AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=%I.workspace_id AND m.tenant_id=%I.tenant_id AND m.user_id=nullif(current_setting(''app.user_id'',true),''''))) WITH CHECK (workspace_id=nullif(current_setting(''app.workspace_id'',true),'''') AND tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') AND EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=%I.workspace_id AND m.tenant_id=%I.tenant_id AND m.user_id=nullif(current_setting(''app.user_id'',true),'''')))',t,t,t,t,t);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
-- Deployment owner grants SELECT,INSERT,UPDATE on both tables to the runtime role
-- (scripts/migrate.ts does this when DATABASE_APP_ROLE is set). No DELETE grant:
-- retention is enforced by nulling previews after purge_after (see inbox store).
