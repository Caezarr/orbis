# Launch checklist — Orbis V1 self-serve

Updated 2026-10-02 (branch `feat/launch-hardening`). This is the operator's list: every account, variable, decision and test needed before the public opening from the landing page. Status values:

- **Code ✅**: built and tested locally.
- **À faire**: owner/operator action.
- **Décision**: owner choice.
- **Bloquant**: no-go until done.

Nothing below has been verified against live services.

## 1. Environment variables (all features)

Set them in Vercel per environment (Preview ≠ Production). Mark the secret ones « Sensitive ». Never put a server secret in a `NEXT_PUBLIC_*` variable.

### Platform, auth, database

| Variable | Required | Notes | Status |
|---|---|---|---|
| `APP_ORIGIN`, `ORBIS_APP_URL` | yes | the same public HTTPS origin (CSRF origin check, Stripe return URLs, auth callbacks) | À faire |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | public; also allowed in CSP `connect-src` | À faire |
| `SUPABASE_SERVICE_ROLE_KEY` | recommended | server-only; deletes the Auth identity on account deletion. Without it, identities stay until deleted by hand | À faire |
| `DATABASE_URL` | yes | runtime role: non-superuser, NO BYPASSRLS (the app refuses otherwise in production) | À faire |
| `MIGRATION_DATABASE_URL` | for migrations | migration owner with **CREATEROLE** (008, 010, 012 create NOLOGIN roles); owns schema `public` | À faire |
| `DATABASE_APP_ROLE` | for migrations | name of the runtime role, so `migrate.ts` grants it | À faire |
| `ORBIS_AUTH_PASSWORD` / `ORBIS_AUTH_MAGIC_LINK` | optional | default true / true | Code ✅ |
| `ORBIS_AUTH_GOOGLE` / `ORBIS_AUTH_MICROSOFT` | optional | set `true` only once the provider is configured in Supabase | À faire |
| `ORBIS_SHARED_LIMITS` | default true | `false` = memory-only limits (local work only) | Code ✅ |
| `ORBIS_RATE_LIMIT_SECRET` | recommended | random ≥32 chars; HMAC for limiter key hashes | À faire |
| `CRON_SECRET` | yes | ≥32 chars; `/api/cron/inbox`, `/api/cron/retention`, detailed `/api/health` | À faire |
| `SENTRY_DSN` | recommended | server errors and browser errors (relayed same-origin by `/api/client-errors`), scrubbed; no browser SDK, the DSN stays server-side | À faire |
| `ORBIS_OFFLINE` | never in prod | local demo only | — |

### Model

| Variable | Required | Notes | Status |
|---|---|---|---|
| `ORBIS_AI_PROVIDER`, `ORBIS_AI_MODEL`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | yes | one provider; set a spending limit at the provider; check zero-retention / no-training options | À faire |
| `ORBIS_AI_CLASSIFIER_MODEL` | optional | same provider, cheaper model | Décision |

### Inbox, company brain, follow-ups

| Variable | Notes | Status |
|---|---|---|
| `ORBIS_INBOX_DRAFTS_ENABLED=true` | the main flag | À faire |
| `ORBIS_INBOX_MODE` | `test` (simulated drafts) → `scoped_autonomy` (real drafts) after staging | À faire |
| `ORBIS_INBOX_FIRST_RUN_MAX_DRAFTS`, `ORBIS_INBOX_CONTINUOUS_MAX_DRAFTS`, `ORBIS_INBOX_POLL_MINUTES` | defaults 5 / 10 / 15 | Code ✅ |
| `ORBIS_INBOX_EST_CENTS_CLASSIFY` / `_DRAFT`, `ORBIS_BRAIN_EST_CENTS_EXTRACT` / `_EXPLAIN`, `ORBIS_PIPELINE_EST_CENTS_EXTRACT` | set from the measured real cost | Décision |
| `ORBIS_FOLLOWUP_MAX_THREADS` | default 10 | Code ✅ |
| `ORBIS_SCHEDULER_BUDGET_MS`, `_RESERVE_MS`, `_MAX_BATCHES`, `_MAX_PER_WORKSPACE`, `_MAX_WORKSPACES` | defaults are fine on Vercel Pro (60 s) | Code ✅ |
| `ORBIS_OPERATIONS_MONTHLY_CAP_CENTS` | hard per-workspace ceiling; must be ≥ the highest plan cap | À faire |
| `ORBIS_WORKSPACE_MONTHLY_CAP_CENTS` | optional default | Décision |
| `ORBIS_DIGEST=true` | daily digest opt-in on Today ([daily-digest.md](daily-digest.md)); off by default | Décision |
| `ORBIS_DIGEST_DELIVERY` | only `simulated` exists (composed + recorded, nothing sent). A real transport needs a provider decision first | Décision |

### /start

| Variable | Notes | Status |
|---|---|---|
| `ORBIS_START_AI_PROFILE` | AI profile on step 1 | Décision |
| `ORBIS_START_PREVIEW` (+ `_EST_CENTS`, `_IP_DAILY_CAP_CENTS`, `_DAILY_CAP_CENTS`) | level-1 preview; budgets shared in Postgres since Phase 4 | Décision |

### Plans and Stripe

| Variable | Notes | Status |
|---|---|---|
| `STRIPE_SECRET_KEY` (restricted key), `STRIPE_WEBHOOK_SECRET` | test first, then live | À faire |
| `STRIPE_PRICE_SOLO_MONTHLY`, `STRIPE_PRICE_EQUIPE_MONTHLY` | Price ids from the **same** Stripe account/mode | À faire |
| `ORBIS_TRIAL_DAYS`, `ORBIS_TRIAL_DRAFTS`, `ORBIS_TRIAL_CAP_CENTS`, `ORBIS_PLAN_SOLO_*`, `ORBIS_PLAN_EQUIPE_*` | see billing-v1.md | Décision |
| `ORBIS_ENTITLEMENTS_ENFORCED` | must stay `true` in self-serve | Code ✅ |
| `ORBIS_TASK_BILLING_ENABLED` | `false` in V1 | Code ✅ |

### Composio (mailboxes)

| Variable | Notes | Status |
|---|---|---|
| `COMPOSIO_API_KEY` | server-only | À faire |
| `COMPOSIO_AUTH_CONFIG_GMAIL`, `COMPOSIO_TOOLKIT_GMAIL=gmail`, `COMPOSIO_TOOL_VERSION_GMAIL` | scopes exactly `gmail.readonly` + `gmail.compose` | À faire |
| `COMPOSIO_AUTH_CONFIG_OUTLOOK`, `COMPOSIO_TOOLKIT_OUTLOOK=outlook`, `COMPOSIO_TOOL_VERSION_OUTLOOK` | delegated `Mail.ReadWrite`, `User.Read`, `offline_access`; **not** `Mail.Send`. Also covers Outlook categories (visible triage): no new scope | À faire |

### Calendar-aware drafts and visible triage ([inbox-calendar-labels.md](inbox-calendar-labels.md), migration 014)

| Variable | Notes | Status |
|---|---|---|
| `ORBIS_INBOX_CALENDAR=true` | meeting requests get 2–3 code-computed slots (or ask the customer); off = unchanged drafts | Décision |
| `COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR`, `COMPOSIO_TOOLKIT_GOOGLECALENDAR=googlecalendar`, `COMPOSIO_TOOL_VERSION_GOOGLECALENDAR=20261001_00` | scope exactly `https://www.googleapis.com/auth/calendar.freebusy` (non-sensitive). Not `calendar.readonly`, not `calendar`/`calendar.events` | À faire |
| `COMPOSIO_AUTH_CONFIG_OUTLOOK_CALENDAR`, optional `COMPOSIO_TOOLKIT_OUTLOOK_CALENDAR=outlook`, `COMPOSIO_TOOL_VERSION_OUTLOOK_CALENDAR` | **separate** Outlook auth config with delegated `Calendars.ReadBasic`, `User.Read`, `offline_access`. Not `Calendars.Read`/`ReadWrite`. Version falls back to `COMPOSIO_TOOL_VERSION_OUTLOOK`; check `OUTLOOK_GET_CALENDAR_VIEW` exists in the pinned version | À faire |
| `ORBIS_CALENDAR_VISIT_MINUTES` / `_CALL_MINUTES` / `_BUFFER_MINUTES` / `_MIN_LEAD_HOURS` / `_HORIZON_DAYS` | defaults 60 / 30 / 30 / 18 / 10 | Code ✅ |
| `ORBIS_INBOX_LABELS=true` | Orbis categories on Outlook messages (opt-in per workspace, removable) | Décision |
| `ORBIS_INBOX_LABELS_GMAIL=true` | Gmail labels too. **Requires adding `https://www.googleapis.com/auth/gmail.modify` (restricted) to the Gmail auth config**; `gmail.labels` cannot label messages. Only after our own Gmail OAuth app is verified with it (CASA) | Décision (après CASA) |

### Analytics and pilot-only

| Variable | Notes | Status |
|---|---|---|
| `POSTHOG_ENABLED`, `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST` | optional funnel export (`scripts/export-posthog.ts`); EU host recommended | Décision |
| `ORBIS_OPERATIONS_ENABLED`, `ORBIS_WORKER_*`, `HOSTAWAY_*`, `HF_*`, other `COMPOSIO_AUTH_CONFIG_*` | frozen V1 features; leave unset | — |

## 2. Supabase

| Step | Status |
|---|---|
| Project in an **EU region**; record the region in `/legal/sous-traitants` | À faire |
| Roles: migration owner (CREATEROLE, owns `public`), runtime role (LOGIN, no superuser, **NOBYPASSRLS**); connect the runtime through the pooler with that role | À faire |
| `node --import tsx scripts/migrate.ts` (001–014) then `node --import tsx scripts/check-platform.ts --database` → **PASS** | Bloquant |
| Auth → URL config: Site URL = `APP_ORIGIN`; redirect allowlist = `APP_ORIGIN/api/auth/callback` (exact) | À faire |
| Auth → Email: keep « Confirm email » ON (anti-enumeration relies on it); enable email OTP / magic link; set link expiry (≤1 h) | À faire |
| Custom SMTP sender on your domain (SPF/DKIM/DMARC); the default Supabase sender is rate-limited and not for production. Translate the email templates to French | Bloquant |
| Google provider: Google Cloud OAuth client (web), consent screen with basic scopes only (`openid email profile`), redirect `https://<project>.supabase.co/auth/v1/callback`; then `ORBIS_AUTH_GOOGLE=true` | Décision |
| Microsoft (`azure`) provider: Entra app (multi-tenant + personal accounts), redirect as above, publisher verification; then `ORBIS_AUTH_MICROSOFT=true` | Décision |
| Auth rate limits reviewed (emails/hour, OTP) | À faire |
| Backups (PITR if available) + one **restore test**; record the backup retention in the privacy policy | Bloquant |
| Service role key stored server-only (`SUPABASE_SERVICE_ROLE_KEY`) | À faire |

## 3. Composio and Google CASA

| Step | Status |
|---|---|
| Gmail and Outlook auth configs with the exact scopes above; pinned tool versions | À faire |
| Validate the response shapes with real test accounts (inbox-drafts.md, « must be validated ») | Bloquant |
| Revocation: connect a test account, delete the Orbis workspace, and check that the Composio connected account is gone. Check whether the Google/Microsoft grant disappears from the user's security page. If not, add that instruction to the deletion copy | Bloquant |
| Revocation **during a run**: revoke mid-batch and check the batch fails cleanly and continuous drafting pauses | À faire |
| **Google CASA question**: ask Composio support in writing whether their managed Gmail app is verified for `gmail.readonly` + `gmail.compose` and whether using it removes the restricted-scope security assessment on our side. If not, either launch **Outlook only + Gmail « en vérification »** (allowed by the definition of done) and start the Google verification/CASA with our own OAuth app, or budget the assessment | Bloquant (Gmail) |
| Production: switch to our own OAuth credentials in Composio, so the consent screen shows Orbis, not Composio | À faire |
| Calendar (optional): Google Calendar auth config with `calendar.freebusy` only; Outlook calendar auth config with `Calendars.ReadBasic` only; validate `GOOGLECALENDAR_FREE_BUSY_QUERY` / `OUTLOOK_GET_CALENDAR_VIEW` response shapes with test accounts; confirm no event is ever created | À faire |
| Visible triage: validate `OUTLOOK_GET_MESSAGE` / `OUTLOOK_UPDATE_EMAIL` (categories only) on a test mailbox, then cleanup. Gmail labels only after `gmail.modify` is in the verified app (CASA scope list) | À faire |
| Microsoft publisher verification for the Outlook app; expect admin consent in some tenants | À faire |

## 4. Stripe test → live

| Step | Status |
|---|---|
| Test mode: products « Orbis Essentiel » / « Orbis Équipe », one monthly licensed price each; webhook `/api/v1/billing/webhook` with the 5 events (billing-v1.md); Customer Portal (cancel at period end, payment method, invoices, only the 2 V1 prices) | À faire |
| Stripe CLI: subscribe during trial, renewal (test clock), failed payment `4000 0000 0000 0341` → `past_due` → recovery, portal cancellation, replayed / out-of-order events | Bloquant |
| Account deletion with an active test subscription → subscription **cancelled immediately**, workspace gone | Bloquant |
| Live: the legal entity that bills, VAT registrations and `automatic_tax` decision, refund policy (deletion = immediate cancellation **without** pro-rata refund in code: confirm or change), live restricted key, live webhook secret, live price ids | Bloquant |

## 5. Vercel, domain, DNS

| Step | Status |
|---|---|
| Vercel Pro: not required for scheduling any more (see next row). Still worth it for function limits and team features | Décision |
| Scheduling is committed: `vercel.json` runs retention (03:17 UTC) and digest (06:05 UTC) daily, which Hobby allows; `.github/workflows/inbox-scheduler.yml` triggers `/api/cron/inbox` every 5 min. It stays a no-op until the repo secret `CRON_SECRET` (same value as Vercel) and repo variable `ORBIS_APP_URL` are set. On Vercel Pro, the inbox cron can move into `vercel.json` instead | À faire (secrets) |
| Own domain replacing `orbis-omega-ashen.vercel.app`; DNS A/CNAME; HTTPS; set `APP_ORIGIN`/`ORBIS_APP_URL`; update Supabase redirect URLs and the Stripe webhook URL | Bloquant |
| Email DNS for the auth sender (SPF, DKIM, DMARC) | Bloquant |
| HSTS is sent automatically on HTTPS; add `preload` only once the domain is final | Décision |
| Edge/WAF rate limit on `/api/v1/start/*` and `/api/auth/*` (in addition to the shared limits) | À faire |
| Preview deployments use test Stripe, a separate Supabase project and `ORBIS_INBOX_MODE=test` | À faire |
| Uptime monitor on `GET /api/health` (expects 200 `{"status":"ok"}`) | À faire |
| Sentry project in the EU region, `SENTRY_DSN` set; trigger a server error and a browser error (e.g. `setTimeout(() => { throw new Error("test a@b.test") })` in the console) and check that no PII appears | À faire |

## 6. Legal

| Step | Status |
|---|---|
| Fill every `[[À COMPLÉTER : …]]` in `/legal/*` (list in legal-templates.md) | Bloquant |
| **A lawyer reviews the CGU/CGV, privacy policy, subprocessor list and legal notice.** These pages are templates, not legal advice | Bloquant |
| DPA (Orbis as processor for customers' mail data) available online and signable | Bloquant |
| Subprocessor DPAs signed (Supabase, Vercel, OpenAI or Anthropic, Composio, Stripe, Sentry, PostHog if used); transfer safeguards recorded | Bloquant |
| Record of processing (registre des traitements) | À faire |
| Wonka/WonkaChat contract check: non-compete, exclusivity, IP (doc 17 risk) | Bloquant |
| Bump `TERMS_VERSION` in `src/lib/platform/auth.ts` when the CGU change | À faire |

## 7. Beta plan

1. **Internal** (week 1): 3 own mailboxes (Gmail + Outlook) in `ORBIS_INBOX_MODE=test`, then `scoped_autonomy`. Run each item of section 3 and 4 once.
2. **Closed beta, 20–30 companies** (weeks 2–3): invited from the network, landing CTA still pointing to a waitlist or invite link.
   - Measure: time to first draft (median < 3 min target), % of drafts used, real cost per draft, support tickets.
   - Fix the top issues weekly.
3. **Public**: switch the landing CTA to `/start` only when the go/no-go below is all green.

## 8. Go / no-go (definition of done, doc 17)

| Definition of done | Evidence required | Status |
|---|---|---|
| Public sign-up from the landing, without a human | `/start` → magic link/password/OAuth → mailbox → first drafts, done by an external tester on production | Code ✅ · test À faire |
| Median < 3 min from URL to first useful draft (measured) | `site_analyzed → first_draft_ready` funnel on ≥10 beta users | À faire |
| Outlook **and** Gmail in production (or Outlook + Gmail « en vérification », shown) | section 3, CASA answer | Bloquant |
| Continuous drafts on new mail, daily digest | continuous drafting ✅. Daily digest: opt-in, counts-only content, once per Paris day, ledger and broker step ✅ (migration 013). **Delivery is simulated: no e-mail transport is built** (provider decision) | Décision: transport (provider, sending domain) or in-app Today only for launch |
| Trial → live Stripe subscription, cost caps active | section 4, `billing_plan_caps` set | À faire |
| Tenant isolation tested on the real database; server-only secrets; effective revocation | `check-platform --database` on the production database (PASS); revocation test of section 3 | Code ✅ (throwaway PG16) · prod À faire |
| CGU, privacy, DPA, account deletion online | `/legal/*` templates ✅, deletion + export ✅; lawyer review + DPA À faire | Bloquant |
| Error monitoring + PostHog funnel | Sentry transport ✅ (DSN À faire); funnel events ✅, PostHog export À faire | À faire |
| Prompt-injection red team | `src/lib/security/redteam` suite green; re-run against the real model on staging with the same corpus | Code ✅ · live À faire |
| Retention purge runs | `/api/cron/retention` scheduled daily; check the response counts | À faire |

## Local production-like stack

`pnpm local:up` starts Supabase in Docker (Postgres 17, Auth, Mailpit), creates a runtime role without BYPASSRLS, and applies every migration as the owner. `pnpm local:env` prints the `.env.local` block. Verified 2026-10-03: all 13 migrations apply, `check-platform.ts --database` passes (cross-tenant RLS), and `/start` runs through account creation by magic link (read the link in Mailpit, http://127.0.0.1:54324).

## Auth e-mails in French

Supabase sends English e-mails by default. The French template lives in `supabase/templates/magic_link.html` (used locally by `supabase/config.toml`). In the production project, paste it in Authentication → Email Templates for « Magic Link » and « Confirm signup », subjects « Votre lien de connexion Orbis » / « Confirmez votre adresse pour Orbis ». For deliverability, configure custom SMTP on the Orbis domain (Supabase's built-in sender is rate limited and not meant for production).
