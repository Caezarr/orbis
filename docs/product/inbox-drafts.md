# Inbox reply drafts (V1 Phase 1 backend)

Status: backend built behind `ORBIS_INBOX_DRAFTS_ENABLED=false`. Not activated. No live Composio, Gmail, Outlook or model call has been made. Updated 2026-10-02. Context: [17-v1-self-serve.md](../strategy/17-v1-self-serve.md) (branch `docs/v1-self-serve-plan`).

## What it does

For one connected Gmail or Outlook mailbox of a workspace:

1. Lists recent **inbound** mail (default 14 days, at most 50 messages).
2. Drops noise with deterministic rules, before any model call: no sender, own/sent messages, drafts, `no-reply`/`mailer-daemon`/`newsletter` senders, `List-Unsubscribe`/`List-Id`/`Precedence: bulk`, `Auto-Submitted`/`X-Autoreply`, "Automatic reply / Réponse automatique / Out of office" subjects, Gmail promotions/social/updates/forums categories.
3. Classifies the rest with a cheap model call: `customer_request`, `quote_request`, `supplier`, `admin`, `noise`.
4. For `customer_request` and `quote_request` only (max 5 per first run): skips threads the owner already answered, then generates a reply grounded in the confirmed website profile, approved workspace rules/memory, imported knowledge (BM25 over ready sources) and up to 3 of the owner's recent sent mails (tone only, never facts).
5. Creates the reply as a **draft** in the same thread, addressed to the original sender. **Never sends.**

Results (classification, draft preview, open questions, citations, draft id, link to the mailbox's drafts folder) are returned by `GET /api/v1/inbox`.

## Safety model — enforced in code, not in the prompt

| Risk                                                           | Control                                                                                                                                                                                                                                                                                                                                                                          | Where                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Sending / forwarding                                           | Closed, frozen tool map (read + create-draft slugs only). `assertMailboxPolicy` refuses any slug outside the allowlist or matching `SEND                                                                                                                                                                                                                                         | FORWARD                                                       | REPLY_TO_THREAD                 | REPLY_ALL | DELETE | TRASH | MOVE | RULE | FILTER | …`, at import time and on every call. Slugs never come from env, API input or the model. | `src/lib/integrations/mailbox.ts` |
| Changed recipients                                             | Arguments are built by code from typed inputs through strict zod schemas: no cc/bcc/extra-recipient field exists. Gmail `recipient_email` = original `From` address. Outlook uses Graph `createReply` (sender only), is skipped when `Reply-To` diverges from `From`, and the returned recipients are checked against the expected sender (`recipient_mismatch` → needs review). | `mailbox.ts`, `runtime/inbox-replies.ts`, `inbox/pipeline.ts` |
| Prompt injection                                               | Email is serialized as JSON inside a random per-call `<ORBIS_DATA_…>` boundary. The model gets **no tools**. Its output schema has only `body`, `questions`, `citations`. Heuristic injection signals are recorded as flags (`injection_suspected:*`) for the UI; they are a signal, not the defense.                                                                            | `runtime/inbox-replies.ts`                                    |
| Invented prices / contacts                                     | After generation, amounts, email addresses, links and phone numbers absent from trusted sources are replaced with `[[À CONFIRMER : …]]` placeholders and turned into questions. Citations whose excerpt is not verbatim in the named source are dropped.                                                                                                                         | `guardDraft`                                                  |
| Duplicate drafts                                               | One draft per `(tenant, workspace, account, message id, mission version)`: unique row + idempotency key + ledger states `none → claimed → created                                                                                                                                                                                                                                | uncertain`.                                                   | `inbox/store.ts`, migration 007 |
| Ambiguous provider result (timeout, `successful:false`, no id) | Marked `uncertain`, never reported as success. Next run lists drafts in the thread first (Gmail `GMAIL_LIST_DRAFTS`, Outlook drafts folder filtered by `conversationId`) and adopts a found draft; retries only after 10 min, max 3 attempts.                                                                                                                                    | `createReplyDraft`                                            |
| Cross-tenant access                                            | Tenant/workspace from session only (`withWorkspaceRequest`); Composio user id is `integrationUser(tenant, workspace)`; account must be ACTIVE, PRIVATE and bound to that user; new tables use FORCE RLS + membership policies; worker runs as a verified member.                                                                                                                 | migration 007, `service.ts`, `inbox-worker.ts`                |
| Runaway model cost                                             | Before every model call, an estimated cost (default 1¢ classify, 5¢ draft) is reserved against the **existing** `ORBIS_OPERATIONS_MONTHLY_CAP_CENTS`, summed with task reservations, under a per-tenant advisory lock. Cap reached → batch ends `budget_exhausted`.                                                                                                              | `reserveInboxBudget`                                          |
| Test mode                                                      | `ORBIS_INBOX_MODE` defaults to `test`: reads happen, drafts are simulated (`simulated:` id), the provider is never asked to write. `scoped_autonomy` writes drafts under policy `inbox-drafts-v1` (hash recorded per draft).                                                                                                                                                     | `mailbox.ts`, `service.ts`                                    |

Honest limits of these controls: Gmail `gmail.compose` and Graph `Mail.ReadWrite` would technically allow sending or modifying mail if someone called those endpoints; the no-send guarantee is that this code path cannot call them. The money/phone/link guard is pattern-based (it does not catch an invented date or a verbal commitment); human review of every draft remains the final gate.

## Composio tools used

Verified on [docs.composio.dev/toolkits/gmail](https://docs.composio.dev/toolkits/gmail) (toolkit version `20260915_00`) and [docs.composio.dev/toolkits/outlook](https://docs.composio.dev/toolkits/outlook) (`20260929_00`), 2026-10-02.

| Operation    | Gmail                                                                                                                                                             | Outlook                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| List inbound | `GMAIL_FETCH_EMAILS` `{query:"in:inbox -in:chats -in:sent -in:drafts newer_than:14d", max_results, verbose:true, include_payload:true, include_spam_trash:false}` | `OUTLOOK_LIST_MESSAGES` `{folder:"inbox", top, received_date_time_ge, select}`                        |
| Read thread  | `GMAIL_FETCH_MESSAGE_BY_THREAD_ID` `{thread_id}` (SENT label = owner)                                                                                             | `OUTLOOK_LIST_MESSAGES` `{folder:"allfolders", filter:"conversationId eq '…'"}` + same on `sentitems` |
| Tone samples | `GMAIL_FETCH_EMAILS` `{query:"in:sent newer_than:31d", max_results:3}`                                                                                            | `OUTLOOK_LIST_MESSAGES` `{folder:"sentitems", top:3}`                                                 |
| Reconcile    | `GMAIL_LIST_DRAFTS` `{verbose:true, max_results:100}` filtered by `threadId`                                                                                      | `OUTLOOK_LIST_MESSAGES` `{folder:"drafts", filter:"conversationId eq '…'"}`                           |
| Create draft | `GMAIL_CREATE_EMAIL_DRAFT` `{thread_id, recipient_email, body, is_html:false}` — subject left empty to stay in the thread (per Composio doc)                      | `OUTLOOK_CREATE_DRAFT_REPLY` `{message_id, comment}` — replies to sender only                         |

Never used and refused by policy: `GMAIL_SEND_EMAIL`, `GMAIL_SEND_DRAFT`, `GMAIL_REPLY_TO_THREAD`, `GMAIL_FORWARD_MESSAGE`, `OUTLOOK_SEND_EMAIL`, `OUTLOOK_SEND_DRAFT`, `OUTLOOK_SEND_REPLY`, `OUTLOOK_CREATE_FORWARD_DRAFT`, `OUTLOOK_CREATE_REPLY_ALL_DRAFT`.

The docs type every tool output as `data`. Response parsing is defensive (`mailbox-normalize.ts`) and **must be validated with a real account** before enabling: Gmail message fields (`messageId`, `threadId`, `sender`, `messageText`, `labelIds`, `payload`), draft id field (`id` vs `draft_id`), Outlook list envelope (`value` vs `response_data.value`), and whether `OUTLOOK_CREATE_DRAFT_REPLY` returns the draft message resource with `toRecipients`.

## Data stored (migration 007)

`inbox_batches`: one row per worker job (provider, connected account id, mode, window, caps, status, aggregate stats, lease).
`inbox_messages`: per processed message — provider message/thread ids, SHA-256 content hash, classification, skip reason, flags, Orbis-generated draft preview (≤1,200 chars), open questions, citations (excerpts of the company's own sources), truncated subject (≤120 chars), draft receipt (draft id, payload/policy hash, state, attempts), token counts and estimated cost.

**No inbound email body is stored.** Bodies are held in memory during processing and sent to the model provider only. Justification: idempotency needs only ids + hash; the results screen needs our draft, not the customer's text (the user opens the thread in Gmail/Outlook). The subject preview and draft preview are nulled after `purge_after` (30 days) by the worker; rows keep only ids, hashes and receipts. The runtime role has no DELETE grant; tenant deletion cascades from `workspaces`.

## API

| Endpoint                       | Contract                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/inbox`           | Same-origin, owner/admin/operator. Body `{provider:"gmail"                                                                                                                              | "outlook", connectedAccountId?, windowDays?=14, maxMessages?=50}`(strict: no tenant/workspace field).`Idempotency-Key` header required; replay returns the same batch, reuse with a different body → 409. Account must be an active private account of the session workspace (exactly one, or chosen). Returns 202 with the queued batch. |
| `GET /api/v1/inbox[?batchId=]` | Latest 20 batches + messages of the selected (default latest) batch: status, classification, skip reason, flags, draft preview, questions, citations, draft `{id, simulated, openUrl}`. |

Both return 503 when the flag is off. Processing is asynchronous: the worker must run.

## Worker

`scripts/operations-worker.ts` now runs one task job and one inbox batch per invocation (`ORBIS_WORKER_JOB=all|tasks|inbox`). Inbox batch: lease 5 min renewed per message, max 3 attempts, transient failure → re-queued after 1 min, connection/policy failure → `failed` with a generic message, lease lost → stops without finalizing. Model calls happen outside DB transactions. Events: `inbox_batch_queued`, `inbox_batch_completed`, `first_draft_ready` (ids only).

The existing worker is still single-workspace (`ORBIS_WORKER_*_ID`). A multi-tenant scheduler (Phase 2) must iterate workspaces with queued batches; that is not built here.

## Activation steps

1. Review and merge; back up the database; run `scripts/migrate.ts` with `DATABASE_APP_ROLE` (grants `inbox_batches`, `inbox_messages`). Run `scripts/check-platform.ts --database` (now also checks inbox RLS).
2. **Gmail auth config** in Composio with exactly `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.compose` (Composio: pass scopes in the auth config `credentials.scopes`). Do not add `gmail.send`, `gmail.modify` or `https://mail.google.com/`. Set `COMPOSIO_AUTH_CONFIG_GMAIL`, `COMPOSIO_TOOLKIT_GMAIL=gmail`, `COMPOSIO_TOOL_VERSION_GMAIL=20260915_00` (or the version you validate).
3. **Outlook auth config** with delegated `Mail.ReadWrite`, `User.Read`, `offline_access` — **not** `Mail.Send`. Microsoft has no compose-only scope; creating a draft reply needs `Mail.ReadWrite`. Expect tenant admin consent for some business tenants (Composio Outlook FAQ). Set `COMPOSIO_AUTH_CONFIG_OUTLOOK`, `COMPOSIO_TOOLKIT_OUTLOOK=outlook`, `COMPOSIO_TOOL_VERSION_OUTLOOK=20260929_00`.
4. Set `ORBIS_OPERATIONS_MONTHLY_CAP_CENTS`, model provider env, optionally `ORBIS_AI_CLASSIFIER_MODEL` (same provider) and the cost estimates once real per-call cost is measured.
5. Enable `ORBIS_INBOX_DRAFTS_ENABLED=true` with `ORBIS_INBOX_MODE=test` on staging; connect a test mailbox; `POST /api/v1/inbox`; run the worker; check classifications and simulated drafts, and validate the response shapes listed above.
6. Switch staging to `ORBIS_INBOX_MODE=scoped_autonomy`; verify drafts appear in the right thread, addressed to the sender, nothing in Sent; kill the worker mid-draft and re-run to observe reconciliation; revoke the connection mid-batch.
7. Only then production.

## Google verification / CASA — what Composio documents

- Gmail toolkit page: "Composio-managed OAuth available? Yes". Adding scopes beyond the defaults can trigger Google's "App is blocked" screen; the documented fix is to remove the extra scopes or "create your own OAuth app and submit the scopes for verification".
- Gmail KB guide: `gmail.send` "is a granular sensitive scope and requires Google verification" (we do not request it).
- [Managed vs custom auth](https://docs.composio.dev/docs/custom-app-vs-managed-app): managed apps suit development; for production, switch to your own credentials (consent screen shows "Composio" otherwise; managed apps share rate-limit quota).
- Composio's docs that were reviewed **do not state** which default scopes the managed Gmail app requests, whether that app is verified for `gmail.readonly`/`gmail.compose`, or whether using it removes the need for a CASA assessment on our side. This is an open question for Composio support; do not assume coverage. Google's own policy on restricted Gmail scopes should be checked directly before launch.

## Known limits / follow-ups

- Response shapes are untested against real accounts (see above). Gmail reconciliation scans one page of 100 drafts.
- A message whose draft is `uncertain` is regenerated on the next run before reconciliation (one extra model call) because the full draft text is not stored.
- Rows already terminal are not re-attached to a later batch, so `GET` for a new batch shows only messages processed in that batch.
- Contact-form notifications (sender `no-reply@…` with customer in `Reply-To`) are skipped by design; supporting them needs a verified form-sender allowlist.
- No HTML drafts (Outlook `comment` is plain text); placeholders are `[[…]]` text markers rather than color highlighting.
- Classification and draft quality are unmeasured; no live model run has been done.
