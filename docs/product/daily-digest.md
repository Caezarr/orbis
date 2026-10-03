# Daily digest (V1 Phase 2)

Doc 17, Phase 2: « Digest quotidien par email : brouillons prêts, questions en attente. » This page describes what is built, and what is not.

## Status

| Part | Status |
|---|---|
| Per-user opt-in on Today (`ORBIS_DIGEST=true`) | built, off by default |
| Counts-only content, fixed French text, one link to `/today` | built |
| Once per Europe/Paris day, from 07:00, ledger claim before delivery | built (migration 013) |
| Broker step `orbis.digest.send` with policy hash + idempotency key | built |
| **Real e-mail transport** | **not built.** `ORBIS_DIGEST_DELIVERY` only accepts `simulated`. The digest is composed and recorded, nothing leaves the server. Any other value is refused. |

The Today toggle says so on screen: « L’envoi n’est pas encore branché sur ce déploiement… ». Do not enable `ORBIS_DIGEST` in production before a transport exists, unless that sentence is acceptable to users.

## What the e-mail contains

Counts since the previous digest (window: last digest → now, at most 7 days back; the first digest covers what happened after opt-in):

- drafts prepared (inbox), of which drafts that carry a highlighted question;
- follow-ups to review (same definition as the Today card);
- messages left for a human check (`needs_review`, `uncertain`);
- open « Questions d’Orbi ».

No customer name, address, subject, excerpt or draft text. The only link is `${APP_ORIGIN}/today` (https only, else the canonical site). Mail content and the model never reach the digest: it is built from counts in the database. No e-mail on a day with nothing to decide (`skipped_empty`).

« Rien n’a été envoyé à vos clients » is a true statement: Orbis never sends from the customer's mailbox.

## Recipient

The subscriber's own account address: at opt-in, the route reads the provider-validated session (`authenticatedUser()`), requires `email_confirmed_at`, and stores the address in `digest_subscriptions.recipient`. The request body is strictly `{enabled: boolean}`: no address field exists. Turning the digest off nulls the stored address. If the account e-mail changes, turn the digest off and on again.

Roles: owner, admin and operator can subscribe (the daily pass runs under the subscriber's own worker context, which requires one of these roles). Anyone can turn their own digest off.

## Data (migration 013)

| Table | Content | Access |
|---|---|---|
| `digest_subscriptions` | enabled, recipient (≤254, required iff enabled), last handled Paris day, window end | FORCE RLS, private to the user within the workspace |
| `digest_deliveries` | one row per (workspace, user, Paris day): idempotency key, policy hash, payload hash, outcome, window, counts | same; no recipient, no content |

- Runtime role: SELECT/INSERT/UPDATE, never DELETE (`scripts/migrate.ts`).
- Discovery: `orbis_digest_due_subscriptions(limit)`, SECURITY DEFINER, owned by the ids-only role `orbis_inbox_dispatch`. Column SELECT on `(workspace_id, tenant_id, user_id, enabled, last_day)` only: never the recipient, never deliveries. Returns `(tenant_id, workspace_id, user_id)`.
- Erasure: both tables are in `orbis_tenant_tables()` (deleted with the workspace). The eraser cannot read `recipient`.
- Export: the user's own subscription and delivery rows are in the account ZIP.

`scripts/check-platform.ts --database` checks isolation, no DELETE, the user-private policy (a member cannot subscribe another user), the recipient `CHECK`, one delivery per day, the dispatcher's column limits, ids-only discovery and erasure.

## Pass

`GET|POST /api/cron/digest` (CRON_SECRET bearer, `maxDuration` 60). Suggested cron: `5 6 * * *` (06:05 UTC = 07:05 or 08:05 Paris). A disabled feature answers `{skipped:"disabled"}`. Response: counts only (`due, simulated, sent, skippedEmpty, refused, failed, errors`).

Per subscriber, in one transaction under their RLS context: lock the subscription → compute counts → insert the ledger row (`ON CONFLICT DO NOTHING`: a concurrent or repeated pass the same day does nothing) → deliver through the broker → record the outcome and the day. A failed delivery is recorded as `failed` and not retried that day.

## Adding a real transport (owner decision first)

1. Choose a provider (EU region), a sending domain, and set SPF/DKIM/DMARC.
2. Add the mode in `src/lib/digest/delivery.ts`, behind the same policy hash, passing the ledger idempotency key as the provider's idempotency key (the send happens inside the DB transaction: a rollback after a send must not resend).
3. Add the provider to the subprocessor list and the privacy policy.
4. Replace the « pas encore branché » sentence in `DigestToggle.tsx` for that mode.

## Verification (2026-10-02)

- `tsc`, `pnpm test` (new: `src/lib/digest/digest.test.ts`: content has no address or foreign link, plurals, empty day, https-only origin, simulated-only delivery, refusals, one claim per day, failed delivery recorded, pass aggregation, cron flag), `next build --webpack`, eslint on changed files.
- Throwaway PostgreSQL 16: migrations 001–013 on a fresh database with a non-superuser migration owner; `check-platform --database` PASS. A scratch run with two tenants through the real discovery and `scoped()`: tenant A `simulated` with `{draftsReady:2, draftsWithQuestions:1}`, tenant B `skipped_empty`, a second pass found nothing due, each tenant saw only its own ledger row.
