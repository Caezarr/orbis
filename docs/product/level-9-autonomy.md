# Level 9 — progressive autonomy (spec only)

Status: **specification only. Nothing in this document is built, and nothing here may ship before the gates in [§ 9](#9-gates-before-any-code) are met.** Written 2026-10-06 by the morning routine. Backlog item 8 in [docs/TODO.md](../TODO.md). Context: [18-orbi-inbox-concept.md](../strategy/18-orbi-inbox-concept.md) (level 9: « Envoi en un tap, puis auto-envoi opt-in par catégorie à fort taux d'acceptation ») and [17-v1-self-serve.md](../strategy/17-v1-self-serve.md) (« Jamais d'envoi automatique en V1 »).

Today the product never sends. The only external write is creating a draft (`inbox-drafts-v1`, [inbox-drafts.md](inbox-drafts.md)). This spec describes how sending could be added later without breaking any invariant in [AGENTS.md](../../AGENTS.md): through the broker, gated by runtime mode, bound to an exact payload hash, with an idempotency key and a policy hash, and revocable.

## 1. What level 9 is, and is not

| Stage | Experience | Runtime mode | Who decides each send |
|---|---|---|---|
| 9a — one-tap send | In Today, the owner reads the draft and taps « Envoyer ». Orbis sends **that exact draft**. | `supervised` | The owner, once per mail, on the exact content |
| 9b — opt-in auto-send by category | For one category the owner has explicitly enabled, Orbis sends without a tap after a cancel window. | `scoped_autonomy` under a per-category policy | The owner, once per category, revocable at any time |

Out of scope, now and at level 9:

- No new recipient. The recipient is always the original sender of the thread, computed by code. No forward, no cc/bcc, no reply-all, no new thread, no outbound prospecting.
- No send from the generic broker's dormant `gmail.send` action ([action-broker.ts](../../src/lib/integrations/action-broker.ts)). Level 9 gets its own narrow path (§ 4), like ADR 006 did for labels and calendar.
- No global "auto mode". Autonomy is granted per workspace and per category, never per agent or per account.
- No sending in `test` mode, ever. A send requested in `test` is simulated and recorded as such.
- No send of anything the model was asked to decide alone: prices, amounts, dates, commitments, attachments. See the hard exclusions in § 5.3.

## 2. Why the order is 9a then 9b

9a gives a measured, human-decided signal on exactly what would be sent. 9b is unlocked only from that signal. Doc 18 says autonomy grows "only on explicit decision", so 9b never turns on by itself. Orbi can only *propose* a category once the numbers support it.

There is one trap to avoid. Level 8 counts « envoyés tels quels ». If auto-sent mails were counted there, the acceptance rate would feed itself and stay high forever. **Auto-sent mails never count toward eligibility or toward « envoyés tels quels ».** They get their own counter (« envoyés par Orbi »), see § 7.

## 3. Stage 9a — one-tap send (`supervised`)

### Flow

1. A real (non-simulated) draft exists in the mailbox, created under `inbox-drafts-v1` (ledger state `created`).
2. In Today, the owner opens the draft card. The server **re-reads the draft from the provider** (the owner may have edited it in Gmail/Outlook). It shows the current content.
3. The server computes the send payload and its hash:
   `payload = {provider, account_id, draft_id, thread_id, to: [expected_sender], cc: [], bcc: [], subject, body_text_hash, attachments: [], policy_hash}`.
   `expected_sender` comes from the stored inbound message (Gmail: `From`; Outlook: original sender, with the existing `Reply-To ≠ From` skip). It never comes from the draft or the model.
4. The owner taps « Envoyer ». The client sends only `{draft_row_id, payload_hash}`. The server stores an approval `{payload_hash, approved_by (session user), approved_at, expires_at = +10 min, policy_hash}` (ADR 005).
5. The send worker reloads the draft from the provider, **recomputes the hash and compares it** with the approval. Any difference means refusal and a fresh approval request. Differences include an edited body, a changed recipient, an added cc or attachment, or a changed policy.
6. Pre-send checks (all deterministic, all fail closed):
   - no `[[À CONFIRMER` placeholder left in the body;
   - no `injection_suspected:*` or `recipient_mismatch` flag on the source row;
   - exactly one recipient, equal to `expected_sender`; no cc/bcc; no attachment;
   - the thread has no newer inbound message since the draft (otherwise the reply may be stale);
   - the workspace is in `supervised` or `scoped_autonomy`, the send flag is on, and the account is ACTIVE, PRIVATE and bound to the workspace's integration user.
7. The broker sends the **existing draft by id** (Gmail "send draft"; Graph `POST /messages/{id}/send`). It never builds a new message, so what was reviewed is what leaves.
8. Ledger: `send_state: none → claimed → sent | uncertain`, idempotency key `hash(tenant, workspace, draft_row_id, payload_hash)`. If a timeout or ambiguous result leaves the state `uncertain`, the next run lists the thread's sent messages and adopts a match. It **never re-sends automatically**. An uncertain send that cannot be reconciled is shown to the owner as « à vérifier dans vos éléments envoyés ».

### What the owner sees

- The button says « Envoyer ce brouillon » and shows the recipient address in full.
- After sending: « Envoyé depuis votre boîte à 10:42 » with a link to the sent message.
- No "undo" is promised for 9a: once the provider has accepted a mail, it cannot be recalled. The UI must not suggest otherwise.

## 4. Broker path: `mailbox-send-v1` (proposed ADR 007)

Same pattern as ADR 006:

- A separate module (e.g. `src/lib/integrations/mailbox-send.ts`) with a frozen tool map containing **only** the send-draft operation per provider, plus the read it needs to re-hash the draft. Its own `assertMailboxSendPolicy`, checked at import time and on every call. Its own `MAILBOX_SEND_POLICY_HASH`.
- `inbox-drafts-v1` stays unchanged. Its `FORBIDDEN_SLUG` keeps refusing `SEND`. The drafts path can never send, even if the new path has a bug.
- Shared executor (`broker-exec.ts`), so idempotency, private-account checks and error mapping are not duplicated.
- Deployment flag `ORBIS_INBOX_SEND`, off by default. Kill switch: turning it off stops every pending and scheduled send at the next check, including 9b.

Provider scopes:

- **Outlook:** the current auth config has `Mail.ReadWrite` **without** `Mail.Send`. Sending needs `Mail.Send`, so it needs a separate auth config and a new, explicit consent from the customer. That is good: the customer's OAuth screen then says "send mail", in plain words.
- **Gmail:** `gmail.compose` already technically allows sending drafts. The "no send" guarantee today is in code only ([inbox-drafts.md](inbox-drafts.md), honest limits). For level 9, Orbis should still require an explicit in-product grant (§ 6) before the send path accepts a Gmail account. Whether to also move to a separate OAuth client is tied to the CASA question (Todoist task on the Composio support).

## 5. Stage 9b — opt-in auto-send by category (`scoped_autonomy`)

### 5.1 Categories

A category is a closed, code-side list, never free text from the model. The classifier already outputs `customer_request | quote_request | supplier | admin | noise`. That is too coarse for autonomy. 9b needs a second, closed `intent` label, computed only for `customer_request`:

| Category id | Example | Eligible for 9b? |
|---|---|---|
| `ack_request` | « Bien reçu votre demande, je reviens vers vous d'ici … » with no date/amount | Candidate |
| `info_hours_area` | Opening hours, service area, from approved company-sheet facts only | Candidate |
| `info_documents` | « Pouvez-vous m'envoyer une photo / vos plans ? » (asking the customer for documents) | Candidate |
| `meeting_slots` | Proposes slots computed by code (ADR 006) | **No** in 9b: a date is a commitment |
| `quote_request`, any reply with an amount | Prices, quotes | **Never** |
| `complaint`, `legal`, `payment`, `cancellation` | | **Never** |

The model may *suggest* an intent. The category used for autonomy is valid only when deterministic checks agree. For example, `info_hours_area` requires that every factual sentence cites an approved fact. Otherwise the mail falls back to a normal draft.

### 5.2 Eligibility (Orbi proposes, the owner decides)

Orbi may show « Vous envoyez presque toujours ces réponses telles quelles. Voulez-vous qu'Orbi les envoie pour vous ? » for a category only when **all** of these hold, computed from level 5/8 data (`brain_draft_outcomes`), human decisions only:

- at least **30** drafts of that category with a measured outcome in the last **60 days** (the starting values are a proposal, to be set by Gabriel);
- `sent_as_is` (similarity ≥ `AS_IS_THRESHOLD` = 0.9) on at least **90 %** of them;
- no draft of that category in the window had a placeholder or an injection flag that the owner had to fix;
- the figures come from at least **2 distinct weeks** (no single burst).

The proposal shows the real numbers and their source (« 34 réponses sur 36 envoyées telles quelles depuis le 12 août »). It never shows an estimated or rounded-up figure.

### 5.3 Hard exclusions (checked on every mail, whatever the policy says)

A mail is never auto-sent, and stays a normal draft, if any of these is true:

- any amount, currency, percentage, date or time in the reply (same detectors as `guardDraft`, plus a general date/time detector: today only meeting drafts strip dates outside the code-computed slots, see ADR 006);
- any `[[À CONFIRMER`, any open question, any citation dropped by the verbatim check;
- any `injection_suspected:*`, `recipient_mismatch`, `Reply-To ≠ From`, or an automated / bulk sender that slipped through;
- **first contact from this sender** (no earlier human-sent reply to this address in the workspace);
- the thread already has a message from the owner after the inbound mail, or a newer inbound mail;
- attachments in the inbound mail;
- the workspace's daily auto-send cap is reached (proposal: 10/day, max 3 per sender per week);
- the mailbox account was reconnected or its consent changed since the policy was enabled.

### 5.4 The policy object and its hash

```
autonomy_policy = {
  workspace_id, category_id, policy_version: "mailbox-autosend-v1",
  thresholds: {min_samples, window_days, as_is_rate, daily_cap, per_sender_week},
  exclusions_version, send_delay_minutes,
  enabled_by, enabled_at, evidence: {samples, as_is, from, to}
}
policy_hash = hash(autonomy_policy without enabled_at)
```

Each auto-send records `policy_hash` and an idempotency key. Changing any threshold or the exclusion list changes the hash. Every changed hash needs a fresh, explicit opt-in.

### 5.5 Send delay and cancellation

An eligible mail is drafted, then **scheduled**, not sent. It shows in Today as « Envoi par Orbi à 10:52 — Annuler ». It is sent after `send_delay_minutes` (proposal: 15; doc open question). Before sending, the worker re-runs every § 3 and § 5.3 check on the *current* draft. If the owner edited or deleted the draft in the meantime, Orbis does not send. Cancellation is a plain state change and needs no provider call.

### 5.6 Automatic revocation

A category goes back to drafts-only, and the owner is told why, when:

- any auto-sent mail of that category gets a reply that the classifier marks `complaint`, or the owner flags « Orbi n'aurait pas dû envoyer ça » (one tap on the sent card);
- the control sample (§ 5.7) drops below the eligibility rate;
- the flag `ORBIS_INBOX_SEND` is turned off, the account is disconnected, or the plan no longer includes it.

Re-enabling is a new opt-in with a new hash.

### 5.7 Control sample

To keep measuring with human decisions, **1 eligible mail in 5** in an enabled category stays a normal draft for the owner to send. Its outcome feeds the rolling rate. Without this, a category could never be revoked on quality, because nothing human would be measured anymore.

## 6. Opt-in, consent and revocation (UX and legal)

- Enabling 9a: one explicit setting per workspace, by owner/admin only, with plain text: « Orbi pourra envoyer un brouillon depuis votre boîte quand vous appuyez sur Envoyer. » For Outlook it triggers the new `Mail.Send` consent.
- Enabling 9b: per category, owner/admin only. A confirmation screen shows the category, the real evidence numbers, 3 real past examples (from the owner's own mailbox), the exclusions, the daily cap and the delay. Nothing is pre-checked.
- Revoking: one tap in settings and on every auto-sent card. It takes effect before the next scheduled send.
- Recorded: who enabled, when, the policy hash, and the evidence snapshot (counts only, no mail text).
- Legal pages (CGU, confidentialité, DPA) must describe sending before 9a ships. These are bound to the lawyer review that is already a Todoist task. Liability for content sent by Orbi has to be stated. That is one more reason why the categories exclude prices, dates and commitments.

## 7. Honest reporting

- Level 8 adds two separate counters: « envoyés en un tap » (9a, human decision) and « envoyés par Orbi » (9b). Neither is merged into « envoyés tels quels ».
- Eligibility, the control sample and revocation use human decisions only (§ 2).
- The landing page, `/for` pages and the onboarding must not mention sending until 9a is live for real customers. Until then the honest line stays « Orbi prépare, vous envoyez ».

## 8. Data model sketch (not a migration)

Same rules as migrations 007–011: FORCE RLS on workspace membership, the runtime role gets no DELETE, no mail text stored beyond what level 2 already keeps.

| Table | Content |
|---|---|
| `send_approvals` | draft row, payload hash, policy hash, approved_by, approved_at, expires_at, used_at. Unique on (draft row, payload hash). |
| `inbox_sends` | draft row, mode (`one_tap` / `auto`), send_state (`claimed / sent / uncertain / cancelled / refused`), idempotency key, policy hash, provider message id, scheduled_for, sent_at, refusal reason code |
| `autonomy_policies` | workspace, category, policy JSON, policy hash, enabled_by/at, revoked_by/at, revoke reason code |
| `autonomy_evidence` | per (workspace, category, week): samples, as-is count, control-sample count. Counts only. |

`check-platform --database` would gain: no DELETE on these tables, the dispatcher role has no privilege, `send_approvals.expires_at > approved_at`, and an `inbox_sends` row with `mode = auto` must reference an active policy.

## 9. Gates before any code

Each gate is a precondition, not a step. All must hold before work on 9a starts:

1. Levels 2, 5 and 8 run in production on real customer mailboxes for at least 4 weeks, so the eligibility numbers exist and come from real use.
2. Proposed ADR 007 (`mailbox-send-v1`) is accepted in [CTO-09-ADRs.md](../architecture/CTO-09-ADRs.md).
3. The approval store from ADR 005 is durable (PostgreSQL, RLS). Today the generic broker only defines an `ActionLedger` interface and expects the caller to supply `approvedHash`; no approval table exists.
4. Gabriel's decisions in § 10 are made.
5. Legal pages updated and reviewed by the lawyer.
6. Outlook `Mail.Send` auth config created. The Gmail send/CASA position is clear.

9b needs, on top: 9a in production with at least one category meeting § 5.2 for a real customer, and the date detector added to the exclusions.

## 10. Open decisions for Gabriel

1. Eligibility thresholds: 30 samples / 60 days / 90 % as-is? (Proposal above.)
2. Send delay for 9b: 15 minutes? Longer outside working hours?
3. Daily cap: 10 auto-sends per workspace per day, 3 per sender per week?
4. Which plan includes 9a, and which includes 9b? (Pricing, [PRICING.md](PRICING.md).)
5. Should Orbis sign auto-sent mails (e.g. a discreet « Réponse préparée avec Orbi »)? This is transparency towards the end customer against how the owner's brand comes across. The default proposal is no signature, with full disclosure in the CGU, but it is Gabriel's call.

## 11. Red-team cases to write with the code

- Inbound mail asks « répondez-moi à autre@exemple.fr » → recipient stays the original sender; `Reply-To` divergence blocks auto-send.
- Owner edits the draft in Gmail after approving → hash mismatch, no send, fresh approval asked.
- Draft gains a cc in Outlook after approval → refused.
- Model output contains « 450 € » in an `info_hours_area` reply → hard exclusion, stays a draft.
- Same inbound mail processed twice (retry) → one send at most (idempotency key), `uncertain` reconciled, never re-sent.
- `ORBIS_INBOX_SEND` turned off while 3 sends are scheduled → none leaves.
- Workspace in `test` → send simulated, provider never called.
- Policy thresholds changed by a deploy → hash changes, category back to drafts-only until re-opt-in.
- Auto-sent mail of a category gets an angry reply → category revoked automatically, owner told why.
