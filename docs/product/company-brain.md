# Company brain: company sheet, ask-once questions, learning from edits

Status: built on branch `feat/company-brain` (stacked on `feat/inbox-scheduler`), behind the existing `ORBIS_INBOX_DRAFTS_ENABLED` flag. No live mailbox, Composio or model call has been made. Concept: levels 3, 4 and 5 of [18-orbi-inbox-concept.md](../strategy/18-orbi-inbox-concept.md). It builds on [inbox-drafts.md](inbox-drafts.md). Updated 2026-10-02.

## What it does

| Level | Experience | Code |
|---|---|---|
| 3. Living company sheet | After the first completed inbox run of a mailbox, Orbi reads the owner's **sent** replies once (90 days, at most 200 messages, read-only) and proposes candidate facts: prices and ranges, lead times, service area, conditions (deposit, warranty, payment), hours, offering, tone and signature. Each fact carries short quotes from the owner's own mail, with the message date. The owner validates each fact (approve, edit then approve, or reject) on **Fiche entreprise** (`/fiche`). Only approved facts are used to draft replies. | `src/lib/brain/extract.ts`, `candidates.ts`, `text.ts`, `worker.ts` |
| 4. One question, asked once | Every `[[À CONFIRMER : X]]` placeholder in a draft, plus the model's matching question, becomes one deduplicated question per workspace (**Questions d'Orbi** on Today). The answer, or a « ça dépend » conditional answer, becomes an approved fact sourced from the user's answer and dated. The same question is not asked again: a reworded duplicate is linked to the answered question. If the fact is later rejected or expires, the question reopens. Drafts that asked it are listed as « nouvelle info disponible » with a one-click regeneration. | `questions.ts`, `store.ts`, `service.ts` |
| 5. Learning from edits | On later incremental batches, up to 5 real (non-simulated) drafts per batch are compared with what the owner actually sent in that thread (`list_thread_sent`). The outcome is `sent_as_is`, `sent_edited`, `not_used` or `pending`, and is stored as counts and a ratio only. For edited replies the model proposes at most 2 rules or fact corrections, each with an exact quote from the sent reply. They go to the same validation queue and are never applied automatically. | `diff.ts`, `outcomes.ts` |

## Safety model (enforced in code)

- **Untrusted mail.** Sent and received mail are serialized as JSON inside a random per-call boundary. The model has no tools, and its output schema is strict (zod). Quoted history (`> …`, « Le … a écrit : », Outlook headers) is removed before extraction, so text written by the customer can never be quoted as an owner fact.
- **Exact quotes.** A fact is kept only when at least one quote is a verbatim substring of the owner-written text the model received. Paraphrased, invented or unknown-ref quotes are dropped (`rejectedQuotes` in job stats).
- **Third-party data.** Before storage, quotes, statements and question labels are redacted. This removes greeting and title names (« Bonjour Claire », « Madame Leroy »), name tokens derived from recipient addresses, email addresses other than the owner's, and phone numbers that are not on the confirmed website profile. Redaction is conservative and pattern-based. It can miss an unusual name format; the owner sees every quote before approving it.
- **No automatic approval.** Extraction and diff learning only insert `candidate` rows. `approved` requires a reviewer (database `CHECK (status <> 'approved' OR reviewed_by IS NOT NULL)`) and is set only by `PATCH /api/v1/brain/facts/:id` (owner/admin) or by answering a question (owner/admin). Approving a fact supersedes the other versions of the same topic, so exactly one version is used.
- **Conflicts.** Different statements with the same category and topic are both kept and shown first, newest evidence first, with a « Conflit » badge. A statement the owner already rejected is never proposed again. A repeated statement only adds quotes (max 3).
- **Mailbox policy unchanged.** No new tool slug, no new write. `list_sent` accepts up to 90 days and 200 messages (inbound stays 31/50). Regeneration creates a **new** draft through the existing idempotent `createReplyDraft` (test mode = simulated). Deleting the old draft would be a mailbox write outside policy, so it stays in the mailbox and the UI says so.
- **Costs.** Every model call reserves an estimated cost first: extraction chunk `ORBIS_BRAIN_EST_CENTS_EXTRACT` (3¢, up to 6 messages per call, ~34 calls max), edit explanation `ORBIS_BRAIN_EST_CENTS_EXPLAIN` (1¢), regeneration `ORBIS_INBOX_EST_CENTS_DRAFT` (5¢). The reservation goes to `brain_usage`, which is summed into the **same per-workspace monthly cap** as tasks and inbox drafts (`workspaceBudgetAllows`, per-tenant advisory lock). When the cap is reached, the job ends `budget_exhausted` with no model call, and unprocessed messages stay `pending` for a later run.
- **Jobs.** `brain_jobs` (`extract_sent`, `regenerate_draft`) use the inbox lease/backoff/yield contract: 5-min lease renewed per chunk, at most 3 attempts, back-off of 1 then 4 min, a yield on the deadline that does not consume an attempt, and one running job per workspace. Extraction is resumable through `brain_sent_messages` (processed or skipped messages are never re-billed). The dispatcher discovers due jobs through `orbis_brain_due_workspaces()` (ids only, same NOLOGIN definer-role model as 008). It runs at most one brain job per workspace per pass, counted in `ORBIS_SCHEDULER_MAX_BATCHES`.

## Data stored (migration 009)

FORCE RLS with the same membership policy as 007/008 on every table. The runtime role gets SELECT/INSERT/UPDATE and never DELETE. The dispatch role can read only the scheduling columns of `brain_jobs`.

| Table | Content | Retention rationale |
|---|---|---|
| `brain_jobs` | job state, stats (counts), regeneration draft receipt, draft preview ≤1,200 chars (Orbis text) | Preview nulled after `purge_after` (30 days), like inbox previews. |
| `brain_sent_messages` | provider message id, sent date, SHA-256 hash, status, skip reason, number of facts found. **No text.** | Needed for resumability and to avoid re-billing. |
| `brain_facts` | category, topic, statement ≤400, conditional text, status, origin, ≤3 redacted quotes ≤240 chars each (with message id and date), confidence, review history | Quotes are the provenance the owner needs to validate a fact. They are **cleared when a fact is rejected**. Approved and candidate facts keep them so the evidence stays visible. |
| `brain_questions`, `brain_question_messages` | canonical key, redacted label ≤200, counts, answered fact; links to `inbox_messages` rows | Dedup and « nouvelle info disponible ». |
| `brain_draft_outcomes` | outcome, similarity ratio, char counts, proposal count. **No text.** | Weekly measured report (level 8). |
| `brain_usage` | kind, estimated cents, tokens | Budget enforcement. |

## API (session-scoped, same-origin, 503 when the flag is off or offline)

| Endpoint | Role | Contract |
|---|---|---|
| `GET /api/v1/brain` | member | Facts (with `active`, `conflictKey`), counts, `/start` profile facts, last extraction. |
| `POST /api/v1/brain/extractions` | owner/admin | `Idempotency-Key` required. Manual re-run for the first-run mailbox; 409 while one is pending. |
| `PATCH /api/v1/brain/facts/:id` | owner/admin | `{action: "approve"\|"reject", statement?, expectedVersion}` (strict; 409 on a stale version). |
| `POST /api/v1/brain/questions/:id` | owner/admin | `{answer, conditional?}` → approved fact, question closed, affected drafts returned. |
| `POST /api/v1/brain/questions/:id/dismiss` | owner/admin | « Pas pertinent ». |
| `POST /api/v1/brain/regenerations` | owner/admin/operator | `{inboxMessageId}`. Queues a new draft; max 3 per message, one at a time. |
| `GET /api/v1/inbox/today` | member | Now also returns `mode`, `questions`, `newInfo`, `canAnswer`. |

## UI

- **Fiche entreprise** (`/fiche`, workspace nav and ⌘K): last extraction and a re-run button, « À valider » grouped by category (conflicts first), « Validé », « Depuis votre site » (confirmed `/start` profile facts), and « Écartés ou remplacés ».
- **Today**: a « Mode test » banner whenever `ORBIS_INBOX_MODE` is not `scoped_autonomy`, « Questions d'Orbi » (count, list, answer / ça dépend / pas pertinent), and « Nouvelle info disponible » with « Préparer un nouveau brouillon ».

## Verification done (2026-10-02)

- `tsc`, `pnpm test` (46 files, 469 tests, including 59 new brain/worker/dispatcher tests), `next build --webpack`, eslint on changed files.
- Throwaway PostgreSQL 16 container: migrations 001–009 applied with a non-superuser migration owner and `DATABASE_APP_ROLE`. `scripts/check-platform.ts --database` passes (it now also covers brain tables, DELETE privileges, the reviewer check, and the dispatcher column grants and definer function).
- Scratch run with a fake mailbox and fake models across two tenants, through the real dispatcher and RLS:
  - first runs drafted, extraction was auto-queued and ran;
  - candidates were redacted, the fabricated fact was dropped and non-replies/internal mail were skipped;
  - the 40 €/45 € conflict was detected, and approving the newest version superseded the other;
  - the question was answered once and not asked again on a new similar email, and the approved fact reached the draft model;
  - a regeneration produced a new simulated draft;
  - an edited sent reply was classified `sent_edited` and produced one candidate rule;
  - rejecting the answer fact reopened the question;
  - a tiny cap ended a re-run `budget_exhausted` with zero model calls;
  - no cross-tenant rows were visible. The container was then removed.

## Known limits / open questions

- Prompts and extraction quality have not been measured on real mail. Redaction is pattern-based, so a name without a greeting, a title or a matching recipient address can pass. The owner reviews every quote.
- Question dedup is lexical (token Jaccard ≥ 0.6, with a small FR/EN synonym map). Two semantically identical questions with no shared content words stay separate, and two different ones that share most words may merge.
- Outcome detection compares against the stored draft preview (≤1,200 chars), runs only for real drafts created in the last 14 days, and decides on the first owner reply after the draft. When the budget is reached, `sent_edited` is recorded without proposals and is not retried.
- An `uncertain` regeneration draft (provider timeout) completes the job as `uncertain` and does not reconcile automatically. The UI does not yet show regeneration errors in detail.
- The sent-mail list is one provider page (no pagination). Gmail/Outlook may return fewer than 200 messages.
- Facts have no expiry set by the UI yet (`valid_until` exists and is honored).
