# Follow-ups, request pipeline and measured weekly report

Status: built on branch `feat/followups-pipeline-report` (stacked on `feat/v1-integration`), behind the existing `ORBIS_INBOX_DRAFTS_ENABLED` flag. No live mailbox, Composio, Stripe or model call has been made. Concept: levels 6, 7 and 8 of [18-orbi-inbox-concept.md](../strategy/18-orbi-inbox-concept.md). It builds on [inbox-drafts.md](inbox-drafts.md), [company-brain.md](company-brain.md) and [billing-v1.md](billing-v1.md). Updated 2026-10-02.

## What it does

| Level | Experience | Code |
|---|---|---|
| 6. Relances | When the owner's last message in a request thread is a quote, offer or answer that awaits the customer, and the customer has not replied for N business days, Orbi prepares a follow-up **draft** in that thread, addressed to that customer only. There are at most 2 stages per thread. The owner can pause a request for 7 days, stop its follow-ups, mark it « gagné » / « perdu », or reopen it. | `src/lib/followups/detect.ts`, `calendar.ts`, `tracker.ts`, `model.ts` |
| 7. Demandes | Every message classified `customer_request` / `quote_request` becomes one pipeline line per thread. A line has the contact, a short need summary, and the budget and deadline when the customer stated them. Its status updates on its own: nouveau → répondu → relancé. Only the owner sets gagné / perdu. The line links to the thread, its drafts and its follow-ups. The **Demandes** page (`/demandes`) has filters, search and a CSV export. | `tracker.ts` (`trackRequest`), `request.ts`, `service.ts`, `components/followups/Requests*` |
| 8. Rapport mesuré | The weekly in-app report (`/rapport`) and a summary card on Today show measured counts only. The JSON from `GET /api/v1/report` is the data for a later email digest. | `report.ts`, `components/followups/Report*`, `WeekCard.tsx` |

## Level 6: follow-up rules (decided in code)

- **When.** After an **incremental** (continuous) inbox batch that finished cleanly, still under that batch's lease, Orbi reads due request threads. It reads at most `ORBIS_FOLLOWUP_MAX_THREADS` (10) threads per batch, inside the scheduler time budget. Each thread read is one existing `read_thread` mailbox call. No new tool slug was added. **Follow-ups therefore need continuous drafting to be on** (opt-in, Phase 2). A workspace without it still gets its pipeline lines, but nobody re-reads its threads.
- **Who is the customer.** The pipeline contact is the original sender of the first request message in the thread. Only messages from that address count as customer replies; drafts, cc'd colleagues and suppliers are ignored.
- **Waiting.** The owner wrote last (owner's latest sent message > customer's latest message).
- **Delay.** The default is 5 business days, configurable per workspace from 1 to 30. A business day is Monday to Friday in Europe/Paris, excluding the 11 metropolitan French public holidays (Easter-based ones computed). The follow-up is due at 00:00 Paris on the Nth business day after the Paris date of the owner's message. Example: a message sent Friday with N=5 is due the next Friday.
- **Is it a quote/offer/answer?** Code decides first, on the owner's own text with quoted history removed:
  - an amount or the words devis / offre / proposition / tarif → `quote`;
  - a question mark → `question`;
  - a short thank-you or closing → `closing`, so no follow-up.
  Anything else goes to the cheap classifier model (`awaitingReply`, budgeted).
- **Stages.** Stage 1 is created when the owner has waited N business days. Stage 2 comes only after the owner actually **sent** something after the stage-1 draft (otherwise the first follow-up is still waiting in the mailbox), then another N business days without a reply. The hard maximum is 2 stages, and the workspace setting can lower it to 1.
- **Idempotency.** `UNIQUE(pipeline_item_id, stage)`, and the draft idempotency key is `sha256(followup, tenant, workspace, account, thread, stage)`. It uses the same ledger contract as inbox drafts: `none → claimed → created | simulated | uncertain`, with reconciliation before any retry. A stage row that produced no draft can be reclaimed: `failed` on the next check, and `not_needed` only for a newer owner message. A drafted row is never redone.
- **Recipient.** Computed by code: `replyRecipient(customer's latest message)`, and it must equal the pipeline contact. The draft replies to the customer's own message (`messageId`), because Outlook `createReply` targets that message's sender. The result is **needs review with no draft** when:
  - the owner's last message went to someone else;
  - Reply-To diverges;
  - the provider reports other recipients (`recipient_mismatch`).
- **Content.** The model has no tools. The owner's and customer's messages are untrusted JSON data inside a random boundary, and the schema is `body/questions/citations` only. Then the same `guardDraft` applies: amounts, emails, links and phones absent from trusted sources become `[[À CONFIRMER : …]]`. The owner's own last message (quoted history removed) is a trusted source, so restating the amount they already quoted is allowed.
- **Owner actions** (`PATCH /api/v1/requests/:id`): `snooze` (1–60 days, the UI uses 7), `dismiss_followups`, `resume_followups`, `won`, `lost`, `reopen`, `erase_contact`. Closing or dismissing a request closes any proposed follow-up that has no draft yet. Drafts already in the mailbox stay there, because deleting mail is outside the mailbox policy.
- **Plan and costs.** A follow-up draft is a draft, so it counts in the draft quota (`countDrafts` adds `followups`). Before each one, the entitlement is reloaded and `brainJobBlock(…, "regenerate_draft")` must pass: active plan and at least 1 draft left. Otherwise the thread is still observed (status, response time) but no follow-up is drafted and no model is called. Classification (1¢) and drafting (5¢, `ORBIS_INBOX_EST_CENTS_*`) are reserved in `pipeline_usage`, summed into the **same monthly cap** (`workspaceBudgetAllows`). A blocked plan stops the batch before any mailbox read, so no follow-up work happens at all.

## Level 7: request pipeline

- **Creation.** It happens in the inbox pipeline, once per actionable message, before drafting. This is best effort: a failure never blocks the reply draft. There is one line per `(workspace, account, thread)`. A later customer message in the same thread updates `last_customer_at` and can upgrade the kind to `quote_request`.
- **Structured line.** One cheap, budgeted model call per **new** line (`ORBIS_PIPELINE_EST_CENTS_EXTRACT`, 1¢; budget refused → `extraction_state=budget`, fields empty). The model proposes:
  - `need` + `needQuote`: the summary is kept only if the quote is a verbatim substring of the email and the summary shares a content word with it;
  - `budgetQuote`: kept only if verbatim, with a digit and a currency/budget word;
  - `deadlineQuote`: kept only if verbatim, with a date/delay word.
  Budget and deadline are stored **as the customer's exact words**. The fields go through `redactThirdParty` before storage. Anything unverified stays empty, and the UI shows « non indiqué ».
- **Status.** Auto status is `relance` if the owner sent after one of our follow-up drafts, else `repondu` if the owner replied after the request, else `nouveau`. It is monotonic: a later customer reply never moves it back. `gagne` / `perdu` are manual only: the database `CHECK` requires `closed_at` + `closed_by`, and observation never overwrites them. `reopen` recomputes the auto status.
- **Tracking schedule.** Threads are read every 6 h before the first owner reply, then every 24 h or at the follow-up due time, whichever comes first. Tracking stops for closed requests and lines older than 60 days.
- **Page « Demandes ».** It has:
  - status chips with counts, « Relances à relire », search (contact, need), and a type filter;
  - for each line: contact, need, budget/deadline with « non indiqué » when missing, received date, first reply, number of drafts, follow-up previews with placeholders highlighted, and the actions;
  - the follow-up settings form (owner/admin);
  - « Exporter en CSV » (owner/admin).
  The export is UTF-8 with a BOM. Every cell is quoted, and cells that start with `= + - @` are prefixed with `'` (no formula injection). It contains only the session workspace's rows.

### Personal data (GDPR)

- **Stored:** the customer's display name (≤120), address (≤254) and domain, a short need summary, and budget/deadline excerpts (≤80, the customer's words). No inbound body is stored. Follow-up previews are our own text, kept ≤1,200 characters and purged after 30 days.
- **Purpose and basis.** The owner's own follow-up of requests addressed to their company (a CRM line), under legitimate interest (Art. 6(1)(f)). The data is necessary to recognise and answer the customer, and limited to what the customer sent the company. Orbis acts as processor for the workspace, and the data is never shared between workspaces.
- **Retention.** Contact and need fields are nulled 24 months after the last activity (`purge_after`, extended on activity; the purge runs in the worker). They are also nulled on request with « Effacer le contact » (owner/admin), which also clears follow-up previews. Deleting the workspace cascades to every table. The runtime role has no DELETE.
- **Logs and analytics.** No contact data in events or errors: errors are generic constants, and `maskEmail()` is available for any diagnostic. Report and Today APIs return counts only.

## Level 8: measured weekly report

The week runs from Monday 00:00 to the next Monday 00:00, Europe/Paris (DST-safe). Every count is a row with a timestamp in the week:

| Figure | Source |
|---|---|
| e-mails entrants lus / classés (by class) | `inbox_messages.received_at` (messages Orbi listed) |
| brouillons préparés | inbox drafts + regenerations (`brain_jobs`) + follow-ups, `draft_state ∈ {created, simulated}`, `drafted_at` |
| envoyés tels quels / modifiés / non utilisés (+ en attente) | level-5 `brain_draft_outcomes.decided_at` |
| questions répondues | `brain_questions.answered_at` |
| faits validés | `brain_facts.reviewed_at`, approved/superseded, reviewer set, excluding answers to questions |
| relances préparées | `followups.drafted_at` |
| nouvelles demandes / gagnées / perdues | `pipeline_items.first_customer_at` / `closed_at` |
| délai médian de 1re réponse | requests received this week: first owner message after the request − request received, **only where both timestamps are known**; shown with coverage « calculé sur X demandes sur Y (Z %) » |

**Time saved** is shown only when the owner entered a manual baseline (« minutes pour écrire une réponse », 1–240, on the Demandes settings). This follows the existing customer-value approach, where `baseline_minutes` is entered by a human. It is computed as « drafts measured as sent as-is × baseline » and always labelled « Estimation … Ce n’est pas une mesure ». Edited drafts are not credited. Without a baseline, the page says why no figure is shown.

The Today card (`GET /api/v1/report/today`) shows this week's drafts prepared, sent as-is (out of measured), questions answered, the median first-reply delay with coverage, and links to « N relances à relire » and the full report.

## Data (migration 011)

FORCE RLS with the same membership policy as 007–010 on all four tables. The runtime role gets SELECT/INSERT/UPDATE, never DELETE (`scripts/migrate.ts`). The dispatcher role gets nothing: follow-ups run inside existing inbox batches under the workspace's own context.

| Table | Content |
|---|---|
| `pipeline_settings` | follow-ups on/off, business days (1–30, default 5), max stages (1–2), optional reply baseline minutes |
| `pipeline_items` | one line per thread: kind, contact (name, email, domain), need/budget/deadline, extraction state, status, first customer / first reply / last owner / last customer / relance timestamps, waiting flag, next check, snooze, dismissal, closure (who/when), erasure, `purge_after` |
| `followups` | one row per (item, stage ≤ 2): status, owner message date, due date, reason, draft ledger, preview ≤1,200 chars (30-day purge), questions, flags |
| `pipeline_usage` | estimated cents and tokens per model call (`request_extract`, `followup_classify`, `followup_draft`), summed into the monthly cap |

`scripts/check-platform.ts --database` now also checks:

- tenant isolation and no DELETE on the 4 tables;
- no dispatcher privilege on them;
- the uniqueness of `(item, stage)` and the stage ≤ 2 cap;
- the gagné/perdu reviewer `CHECK`;
- the erased-contact `CHECK`;
- that a non-member cannot write.

## API (session-scoped, same-origin for mutations, 503 when the flag is off or offline)

| Endpoint | Role | Contract |
|---|---|---|
| `GET /api/v1/requests?status&kind&q&followup=ready` | member | Lines (≤200), counts per status, settings, mode, `canEdit`, `canAdmin` |
| `PATCH /api/v1/requests/:id` | owner/admin/operator (`erase_contact`: owner/admin) | strict `{action}` as listed above |
| `GET /api/v1/requests/export` | owner/admin | CSV |
| `GET/PUT /api/v1/requests/settings` | member / owner/admin | strict `{followupsEnabled, businessDays, maxStages, replyBaselineMinutes}` |
| `GET /api/v1/report?week=YYYY-MM-DD` | member | Week report + previous week (digest data) |
| `GET /api/v1/report/today` | member | Today card |

## Verification (2026-10-02)

- `tsc`, `pnpm test` (new: calendar, detection/stages/idempotency/status, quote verification, tracker with fake store, report math and coverage, quota/cap SQL, CSV/schemas, worker integration with entitlements, pipeline hook), `next build --webpack`, eslint on changed files.
- Throwaway PostgreSQL 16: migrations 001–011 applied on a fresh database with a non-superuser migration owner, and `check-platform --database` passes.
- A scratch run with a fake mailbox and fake models across two tenants went through the real dispatcher, workers and RLS. See the PR description for the exact checks.

## Known limits / open questions

- Follow-ups depend on continuous drafting (incremental batches). Should there be a follow-up-only poll for workspaces that keep continuous drafting off?
- A thread is read in one provider call per check. Gmail threads with many messages are bounded by the provider page.
- The owner-message classification is pattern-based first. A quote sent only as an attachment, with neutral text and no amount, goes to the model. The model is unmeasured on real mail.
- Business days use metropolitan French holidays only: no Alsace-Moselle extras, no regional calendars.
- The response time counts the owner's first message after the request, whatever its content. It is not measured for requests whose threads were never re-read (continuous drafting off).
- « Effacer le contact » cannot remove drafts already in the mailbox or the provider's own copies.
- No email digest yet: the JSON exists, sending needs the action broker (outside this scope).
