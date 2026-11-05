# Browser E2E tests of `/start`

Status: built on branch `feat/start-e2e`. Local only, not in CI (there is no CI workflow that runs the app yet).

## What they prove

Four Playwright tests in `e2e/start.spec.ts` (plus one demo-model test, below), run in Chromium against the real app (`next dev`), the local Supabase (Auth + Postgres with RLS, runtime role without `BYPASSRLS`), Mailpit and the demo mailbox:

| Test | What it checks |
|---|---|
| Golden path, Gmail | Step 1 by description (no site fetched) → instant preview with only « À confirmer » answers, never pointing at a site that does not exist → sign-up by magic link read from Mailpit → session works (`GET /api/v1/inbox` = 200) → « Connecter Gmail » → demo consent page labelled fake → back on `/start`, « Gmail vérifié côté serveur » → step 4 shows « Aucun modèle d’IA n’est configuré », with no « Préparer » button and no simulated draft → a reload lands on the same step (state is server-side) → the demo mailbox holds 0 draft written by Orbis. |
| Refused consent, Outlook | « Refuser » on the consent page brings the user back to step 3, not verified, step 4 not opened. |
| Magic link in another browser | The link opened in a fresh browser context (no PKCE verifier) does not open a session: `GET /api/v1/inbox` = 401. |
| Signed-out visitor | `GET /api/v1/inbox` = 401; the demo consent POST is refused (401/403). |

A fifth test, `e2e/drafts.spec.ts`, runs only with `E2E_DEMO_MODEL=1` (see « Step 4 with the demo model » below):

| Test | What it checks |
|---|---|
| Step 4, demo model | Same path up to « Gmail vérifié côté serveur » → step 4 announces « Modèle factice local » and « Mode test » before anything runs → « Préparer mes premiers brouillons » → scheduler pass (`POST /api/cron/inbox` with the local `CRON_SECRET`) → « N brouillons prêts à relire », each opening with the demo notice → the relayed site form is listed under « À vérifier par vous » → the demo mailbox still holds 0 draft (test mode). |

## Step 4 with the demo model

`ORBIS_AI_PROVIDER=demo` replaces the model calls of the inbox mission with deterministic code (`src/lib/runtime/demo-model.ts`): keyword triage, template drafts quoting one company source verbatim, verbatim request extraction, template follow-ups, an empty company sheet. Usage is 0 tokens; nothing leaves the machine. The real pipeline still runs around it: guard, citations check, Reply-To rule, ledger, mailbox broker.

Fail closed:

- refused on any production runtime (`NODE_ENV=production` or `VERCEL_ENV=production`);
- active only with `ORBIS_DEMO_MAILBOX=true`: a template draft can never land in a real mailbox;
- `providerStatus().configured` stays false: the /start profile and preview, missions and Orbi guidance keep saying no model is configured instead of running on fake output;
- every draft opens with « (Brouillon de démonstration : modèle factice local, aucun appel à une IA.) » and step 4 shows « Modèle factice local » — it says nothing about Orbi's real quality.

```bash
E2E_DEMO_MODEL=1 pnpm test:e2e   # starts `next dev` with ORBIS_AI_PROVIDER=demo (stop any running dev server first)
```

In this mode the no-model golden-path test is skipped (it asserts the opposite state).

## What they do not cover

- **Real drafting quality.** No real model is ever called (no paid call, ever). The demo model proves the plumbing, not the wording. Drafting rules, follow-ups, injection handling and the Reply-To rule are covered by `pnpm test` (`src/lib/integrations/demo-mailbox/demo-mailbox.test.ts`, `src/lib/runtime/demo-model.test.ts`).
- **Step 1 from a website.** Reading a site means fetching a public page; tests never call a live site. The crawl is covered by unit tests on fixtures (`src/lib/start/__fixtures__`).
- **Google / Microsoft sign-in and real OAuth.** Not configured locally.
- **Mobile layout, Safari, Firefox.** Chromium desktop only for now.

## Run them

```bash
pnpm local:up && pnpm local:env > .env.local   # Supabase in Docker, migrations, env block
pnpm demo:reset                                # fake Gmail/Outlook mailbox
pnpm exec playwright install chromium          # once, on your machine
pnpm test:e2e                                  # starts `next dev` on 127.0.0.1:3000 if not running
```

Requirements for the server under test (all are in the `pnpm local:env` block):

- `ORBIS_DEMO_MAILBOX=true`, `ORBIS_INBOX_DRAFTS_ENABLED=true`, `ORBIS_OPERATIONS_MONTHLY_CAP_CENTS` set;
- `ORBIS_INBOX_MODE=test` (the default);
- **no AI model configured** (`ORBIS_AI_MODEL` or the provider key unset). With a model, step 4 shows the « Préparer » button instead and the golden-path test fails on purpose: it asserts the honest no-model state.

Options:

- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome` to use a pre-installed browser (cloud sandboxes: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). `@playwright/test` is pinned to 1.56.1 to match it.
- `E2E_BASE_URL` (default `http://127.0.0.1:3000`), `E2E_MAILPIT_URL` (default `http://127.0.0.1:54324`).

Failures keep a trace and a screenshot in `test-results/` (`pnpm exec playwright show-trace …`).

## Design notes

- **Each test uses a fresh e-mail** (`e2e-…@orbis.example`) because the local stack keeps accounts between runs.
- **Rate limit of step 1** (6 reads per 10 min per client, shared in Postgres) would trip after a few runs, since locally every request comes from client key `unknown`. Each test sends its own `X-Forwarded-For` from the RFC 5737 documentation range. This does not weaken the limiter: in production that header is set by the platform, not by the browser.
- **Selectors are roles and visible French text**, the same text the user reads. A copy change that breaks a test is a prompt to check the promise, not just the selector.
- The demo mailbox file is shared by all workspaces on the machine: the « 0 draft » assertion holds in test mode only.

## Found by these tests

- In the description path, every unanswered preview question said « Orbi ne trouve pas la réponse **sur votre site** », although the user has no site. Fixed: `NOT_FOUND_LABEL_DESCRIPTION` (« dans votre description »), unit-tested in `preview.test.ts`.
