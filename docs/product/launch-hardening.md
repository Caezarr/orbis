# Launch hardening (V1 Phase 4)

Status: built on branch `feat/launch-hardening` (stacked on `feat/followups-pipeline-report`). No live Supabase, Stripe, Composio, Sentry or model call has been made. Updated 2026-10-02. Plan: Phase 4 of `docs/strategy/17-v1-self-serve.md` (branch `docs/v1-self-serve-plan`). Operator steps: [launch-checklist.md](launch-checklist.md).

## 1. Shared rate limits and budgets (migration 012)

| Endpoint | Bucket | Limit | Shared store unreachable |
|---|---|---|---|
| `POST /api/v1/start/site` | `start_site` | 6 / 10 min / IP | open (in-memory limit still applies) |
| `POST /api/v1/start/preview` | `start_preview` | 3 / h / IP | **closed** (quote-only preview) |
| preview daily budget | `start_preview_budget` | `ORBIS_START_PREVIEW_IP_DAILY_CAP_CENTS` per IP, `ORBIS_START_PREVIEW_DAILY_CAP_CENTS` global, UTC day | **closed** |
| `POST /api/auth/*` | `auth_ip` | 30 / 10 min / IP | open |
| sign-in / sign-up per address | `auth_email` | 8 / 10 min / email | open |
| magic link sends | `auth_otp` | 3 / 15 min / email | open |
| `/api/cron/*` failed bearer | `cron_denied` | 20 / 10 min / IP (authorized calls never limited) | open |

- `src/lib/platform/limits.ts`: in-memory pre-check per instance (a denial never touches the database), then `orbis_rate_limit_take` / `orbis_budget_reserve`. Fixed windows (simpler and atomic; a burst of up to 2× the limit is possible across a window boundary).
- Keys are hashed in the app: HMAC-SHA-256 with `ORBIS_RATE_LIMIT_SECRET`, else SHA-256. The table `CHECK` refuses anything that is not a hex digest (or `*` for the global row). No raw IP or email in the database.
- Privileges: table `rate_limit_counters` has FORCE RLS and no grant to the runtime role. Only the NOLOGIN, NOBYPASSRLS role `orbis_rate_limiter` touches it, through three SECURITY DEFINER functions with a pinned `search_path`. The runtime role gets EXECUTE only.
- Atomicity: `INSERT … ON CONFLICT DO UPDATE … WHERE used + cost <= limit`. The budget locks the global row first, so concurrent reservations serialize. Verified on PostgreSQL 16 with 4 pools × 40 concurrent calls: exactly 5 of 40 allowed for a limit of 5, exactly 10 reservations for a 150¢ cap at 15¢.
- Cleanup: `orbis_rate_limit_purge()` (expired windows), run by the daily retention cron. Counters live at most 2 days.
- `clientKey()` trusts `x-forwarded-for`, which Vercel sets. On another host, put a proxy that overwrites it.
- `ORBIS_SHARED_LIMITS=false` disables the shared layer (memory only). This is for local work only.

## 2. Authentication

- Methods: password (kept), **magic link** (Supabase email OTP, PKCE; `ORBIS_AUTH_MAGIC_LINK`, on by default), **Google** / **Microsoft** (Supabase `google` / `azure` providers). The OAuth buttons render **only** when `ORBIS_AUTH_GOOGLE=true` / `ORBIS_AUTH_MICROSOFT=true`. Set these flags only after the provider is configured in Supabase. These logins request identity only: mailbox access stays a separate Composio consent.
- Shared UI: `src/components/auth/AuthPanel.tsx`, used by `/login` and `/start` step 2.
- CGU consent: every account creation (password, magic link with `intent: "sign-up"`, OAuth sign-up) requires `acceptTerms: true`. A checkbox links to `/legal/cgu` and `/legal/confidentialite`. The version (`TERMS_VERSION`) and timestamp go to Supabase user metadata (`terms_version`, `terms_accepted_at`). For OAuth, a 10-minute httpOnly cookie carries the acceptance through the provider redirect, and `/api/auth/callback` writes it.
- A magic link from `/login` uses `shouldCreateUser: false`. Only an explicit sign-up with consent creates an account.
- Anti-enumeration: magic link always answers « Si cette adresse peut se connecter, un lien vient de lui être envoyé… », whatever happened (except a 429). Sign-in errors are generic. Sign-up relies on Supabase's obfuscated response when confirmations are on (keep « Confirm email » enabled).
- `returnTo`: relative paths only, under an allowlist of top-level app routes (`RETURN_TO_ALLOWLIST` in `auth.ts`). Control characters, backslashes, `//`, `/api`, `/login` and unknown routes fall back to `/today`. The destination after email/OAuth comes only from an httpOnly cookie, never from the provider URL.
- The OAuth redirect URL must be https and on the Supabase project origin.
- Callback: PKCE `code` or `token_hash` + `type ∈ {email, magiclink, signup}`. A magic link must be opened in the browser that requested it (PKCE verifier cookie). The login page says so on failure.

## 3. Account lifecycle (GDPR)

**Export**: `GET /api/v1/account/export` (owner/admin) returns a ZIP of JSON + CSV files, written by a dependency-free STORE zip writer (`src/lib/account/zip.ts`, tested with CRC checks):

- workspace + confirmed profile and workspace snapshot;
- members visible to the user;
- facts and questions;
- requests, follow-ups and their settings;
- inbox batches and drafts metadata (classification, states, dates, our previews while retained);
- inbox settings, the weekly report and billing status (trial, plan, subscription status, entitlement).

Not exported: inbound bodies (never stored), Composio/Stripe tokens (never held by Orbis), idempotency/payload hashes, lease tokens and connected-account ids. CSV cells are protected against formula injection.

**Deletion**: `POST /api/v1/account/delete` `{confirm:"SUPPRIMER"}`. It requires the owner role (403 otherwise) and a sign-in less than 15 minutes old (`last_sign_in_at`). Otherwise it answers 401 `reauth_required` and the UI links to `/login?returnTo=/settings`. Order, inside the request transaction:

1. **Composio**: `revokeWorkspaceConnections` (broker, `action-broker.ts`) lists every connected account of `integrationUser(tenant, workspace)`, all toolkits and statuses, and deletes each one. Composio documents `connectedAccounts.delete` as permanent and as revoking the stored tokens. Whether it also revokes the upstream Google/Microsoft grant is **not documented**. Open item: verify with a test account, and otherwise tell users to remove « Composio » from their account security page. If the listing or a deletion fails, the request aborts and nothing is erased (retry is safe).
2. **Stripe**: the subscription is cancelled **immediately** (`invoice_now:false, prorate:false`, idempotency key `orbis-erase:<tenant>:<sub>`), through the existing Stripe client. Reason: the data the service runs on is gone, so the service cannot continue to period end. **No automatic refund.** The refund policy is an owner decision. The Stripe customer and invoices stay at Stripe (accounting retention). A live subscription with Stripe not configured, or a Stripe error, aborts the deletion.
3. **Rows**: `orbis_erase_tenant(workspace, tenant, 'erase:'||workspace)`, SECURITY DEFINER, owned by NOLOGIN/NOBYPASSRLS `orbis_tenant_eraser`. It checks:
   - the caller's verified `app.*` context is this workspace;
   - `app.user_id` is its **owner**;
   - the confirmation token matches.

   It then sets the transaction-local `orbis.erase_tenant` and deletes children-first across all tenant tables (`orbis_tenant_tables()`). The eraser role's RLS policies only match `tenant_id = orbis.erase_tenant`, and it has no SELECT on any content column. It writes the audit row `tenant_erasures(sha256(tenant_id), erased_at, per-table counts)`: no ids in clear, no name, no email.
4. **After commit**: the Supabase Auth identity is deleted through the admin API when `SUPABASE_SERVICE_ROLE_KEY` is set and the user belongs to no other workspace. Otherwise it is kept (`not_configured` is logged), and the operator deletes it on request. Then sign-out and the `orbis_workspace` cookie is cleared.

Drafts already created in the user's mailbox stay there: deleting mail is outside the mailbox policy.

**Retention**: `GET|POST /api/cron/retention` (CRON_SECRET, daily) calls `orbis_retention_purge()`:

- it nulls inbox subject/draft previews, regeneration previews, follow-up previews/questions and request contacts once past `purge_after` (30 days / 30 days / 30 days / 24 months);
- it covers every workspace, including inactive ones, which the per-worker purges never reached;
- the `orbis_retention` role's policies only match `purge_after < now()`, and its column grants cover only the nulled columns.

It also calls `orbis_rate_limit_purge()`. The response holds counts only.

## 4. Prompt-injection red team

See « Prompt-injection red team (Phase 4) » in [inbox-drafts.md](inbox-drafts.md): corpus `src/lib/security/redteam/fixtures.ts`, tests `src/lib/security/redteam/*.test.ts`, shared helper `src/lib/security/untrusted-text.ts`.

## 5. Observability

- **Sentry, optional** (`SENTRY_DSN`). `src/instrumentation.ts` `onRequestError` (Node runtime only) sends the event through a minimal server-side transport to Sentry's envelope endpoint (`src/lib/platform/observability.ts`). Every event is rebuilt by `scrubEvent` (`beforeSend` equivalent) from an allowlist: error type, scrubbed message, stack frames, route **template**, method. Request bodies, headers, cookies, query strings, users, emails, phone numbers, JWTs, bearer tokens and `sk_`/`rk_`/`whsec_` keys are removed. Timeout 2 s, never throws.
- **Why not `@sentry/nextjs`?** It would add a dependency and lockfile change, and `withSentryConfig` wraps the webpack build: source-map upload needs `SENTRY_AUTH_TOKEN` and changes the Vercel build. This change keeps the build untouched.
- **Browser errors** (no SDK, no lockfile change): `src/instrumentation-client.ts` installs `src/lib/platform/browser-errors.ts`, which listens to `error` (this also receives what React/Next report through `window.reportError`) and `unhandledrejection`. It posts `{source, type, message ≤500, stack ≤4000, path}` with `fetch(keepalive)` to the same-origin relay `POST /api/client-errors`; max 5 reports per page load, duplicates dropped; extension errors, opaque `Script error.` and ResizeObserver notices ignored; the path never carries query or fragment. The relay (`src/lib/platform/client-errors.ts`) requires same origin, caps the body at 8 KB, validates a strict schema, rate limits per client (shared limiter `client_errors`, 10 per 10 min), reduces the path to a template (`/workspace/[id]/inbox`), keeps only the path of stack frame URLs, then sends through the same `scrubEvent` transport after the response (`after`). Without `SENTRY_DSN` it returns 204 and drops the report without touching the database. The CSP is unchanged: nothing in the browser talks to Sentry. Limits: stacks are minified (no source maps uploaded, so frames point to chunk files); errors caught by an error boundary that renders a fallback without rethrowing are not reported.
- **Logs**: `logEvent` writes one JSON line that keeps only numbers, booleans and identifier-like strings without `@`. Used for request errors, export, erase, retention.
- **Health**: `GET /api/health`. Public: `{status}`, which is 503 only when a configured database is unreachable (one ping per 10 s per instance). With `Authorization: Bearer $CRON_SECRET`: booleans for database, auth, AI, Stripe, Composio, cron secret, monitoring, shared limits and offline mode. No secret, URL or id.

## 6. Legal pages

French templates under `/legal/{cgu,confidentialite,sous-traitants,mentions}`, public (proxy allowlist), with `[[À COMPLÉTER : …]]` placeholders. They are **not legal advice**: a lawyer must review them before launch. Details and the placeholder list: [legal-templates.md](legal-templates.md). They are linked from:

- `/start` (footer + consent checkbox);
- `/login`;
- `/billing`;
- the workspace shell sidebar.

The landing (`/`, `/for`) is unchanged.

## 7. Security headers

`next.config.ts` → `src/lib/platform/security-headers.ts`, on every route:

- `Content-Security-Policy`:
  - `default-src 'self'`;
  - scripts: `'self' 'unsafe-inline'`, plus Stripe.js and Vercel Speed Insights (`'unsafe-eval'` in dev only);
  - `connect-src`: Supabase (https + wss), Stripe API, Speed Insights, plus PostHog/Sentry hosts only when configured;
  - `frame-src` Stripe;
  - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`;
  - `upgrade-insecure-requests` only when served over HTTPS.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (HTTPS only, no `preload` until the domain is final).
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (no camera/mic/geolocation/topics), `Cross-Origin-Opener-Policy: same-origin`. `poweredByHeader:false`.

Limit: the CSP keeps `'unsafe-inline'` for scripts (Next.js "without nonces" mode). A nonce CSP would make every page dynamic (proxy-generated nonce). This is a possible follow-up.

Smoke-checked on the dev server: landing, `/start`, `/login`, `/legal/*` load without CSP console errors. The first run found Speed Insights blocked in dev; it is now allowed.

## Verification (2026-10-02)

- `tsc`, `pnpm test` (all files, incl. new limits, auth actions, account export/erase/zip/retention, observability/headers/health/cron guard, red team), `next build --webpack`, eslint on changed files.
- Throwaway PostgreSQL 16: migrations 001–012 on a fresh database, with a non-superuser `CREATEROLE` migration owner and `DATABASE_APP_ROLE`. `scripts/check-platform.ts --database` passes. It now also checks:
  - limiter roles (NOLOGIN, no BYPASSRLS, runtime not a member);
  - no runtime privilege on `rate_limit_counters` / `tenant_erasures`;
  - definer owners and `search_path`;
  - fixed-window and budget semantics, and that raw IP keys are refused;
  - the retention purge across tenants;
  - erasure refused for another tenant's owner, a non-member, a wrong confirmation and an empty context;
  - erasing tenant B removes B's rows in every table, including billing, while tenant A's workspace, membership, snapshot and billing rows stay intact.
- Dev server: `/legal/*`, `/start`, `/login` and `/api/health` return 200; headers are present. Screenshots: legal and login at desktop and 390 px, with no horizontal scroll.
