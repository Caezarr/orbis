# Orbis

### Your company. Your tools. Your AI team.

Orbis is an **agent harness** for small companies. Each business task becomes a versioned contract that states what the agent may read, what it must produce, what it must never do, and which checks its output has to pass before a human sees it. The model is a component inside that contract. It is never the one in control.

The first mission in production prepares replies to customer and quote requests, directly in the company's own Gmail or Outlook. Orbis never sends: it leaves a draft, cites its sources, and turns every fact it cannot verify into an explicit question.

![Orbis — your company, with a little more capacity](public/brand/orbis-modules.png)

<p align="center">
  <a href="ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/product/INTEGRATIONS-AND-KNOWLEDGE.md">Integrations</a> ·
  <a href="docs/design/LANDING-MOTION.md">Design system</a>
</p>

## Why a harness

A small business cannot review prompts. It needs work that is safe by construction:

- **Versioned capability contracts.** A mission pins a package version and a mission version. Every run is stamped with a hash of the exact context it saw (sources, approved memory, instructions, model), so a result cannot be accepted against a context that has since changed.
- **Eval gates in code.** Model output is schema-checked, then passed through deterministic guards. Prices, dates, contacts and commitments absent from trusted sources become `[[À CONFIRMER]]` placeholders. Citations must appear verbatim in their source. A Reply-To mismatch sends the draft back for review.
- **Scoped retrieval.** An agent only sees the sources selected for its mission version, for its own tenant.
- **Approval-gated memory.** Feedback and facts learned from sent mail are proposals. They reach a prompt only after a human approves them.
- **Idempotent actions.** Every external effect goes through a closed tool allow-list with pinned tool versions and an idempotency ledger. Replaying a batch never duplicates a draft. Nothing can send.
- **Red-team tests.** The test suite feeds an "obeying" model hostile emails and web pages and asserts that nothing the attacker wants gets through.

Read [ARCHITECTURE.md](ARCHITECTURE.md) for components, data flow, trust boundaries and the gates in detail.

## How it works

```text
Website → company profile → connect mailbox → triage → draft with evidence → guards → draft in your mailbox → feedback → approved memory
```

| Surface | Purpose |
| --- | --- |
| `/start` | Four-step onboarding: company, account, mailbox, first drafts |
| `/today` | Drafts prepared, questions to answer, what Orbis learned |
| `/fiche` | Company sheet: profile and facts learned from sent mail, applied only once approved |
| `/demandes`, `/relances` | Open customer requests and follow-ups to review |
| `/rapport` | Weekly report of measured work |
| Mission catalog and lab | Versioned capability packages, test runs with evidence checks (behind `ORBIS_FROZEN_SURFACES_ENABLED`) |

## Stack

Next.js 16 (App Router) and React 19, TypeScript in strict mode, Postgres on Supabase with row-level security, the Vercel AI SDK (OpenAI or Anthropic), Composio for mailbox and calendar access, Stripe for billing, Vitest and Playwright for tests.

## Run locally

Requirements: Node.js 22 and pnpm 10.

```bash
pnpm install
pnpm dev --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000`. The interface works without a provider key.

### Full loop on your machine, no real mailbox

`pnpm local:up` starts Supabase (Postgres, Auth, Mailpit) in Docker. `pnpm local:env` prints the matching `.env.local` block. A demo mailbox stands in for Composio with a fake small-business inbox, so `/start` works end to end:

```bash
pnpm local:up && pnpm local:env   # paste into .env.local, add ORBIS_DEMO_MAILBOX=true and ORBIS_OPERATIONS_MONTHLY_CAP_CENTS=2000
pnpm demo:reset                    # seed or reset the demo mailbox
pnpm dev --hostname 127.0.0.1 --port 3000
```

Open `/start`. Magic links arrive in Mailpit at `http://127.0.0.1:54324`. Watch the inbox and the drafts at `/dev/demo-mailbox`. `ORBIS_DEMO_MAILBOX` is refused in production. See [docs/product/demo-mailbox.md](docs/product/demo-mailbox.md).

### Model configuration

To draft with a real model, add to `.env.local` (git-ignored):

```dotenv
ORBIS_AI_PROVIDER=openai          # or anthropic
ORBIS_AI_MODEL=your-model-id
OPENAI_API_KEY=...                # or ANTHROPIC_API_KEY
```

`ORBIS_AI_PROVIDER=demo` selects a local, deterministic demo model for development and CI. It makes no network call and is refused in production. All variables are documented in [.env.example](.env.example).

## Test

```bash
pnpm typecheck   # next typegen + tsc --noEmit
pnpm lint        # ESLint, zero warnings allowed
pnpm knip        # no unused files, exports or dependencies
pnpm test        # Vitest unit, integration and red-team suites (mocked models, no paid calls)
pnpm test:e2e    # Playwright against the local stack (needs pnpm local:up)
```

CI (`.github/workflows/ci.yml`) runs all of the above. The end-to-end suite runs twice: once with no model configured, once with the demo model.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): the system as built
- [docs/architecture/](docs/architecture/CTO-README.md): target architecture, ADRs, security, reliability and evaluation design (mostly in French)
- [docs/product/](docs/product/): runtime, inbox drafts, billing, launch readiness
- [docs/design/](docs/design/LANDING-MOTION.md): design system, Orbi mascot, landing motion

## License

Proprietary. Copyright (c) 2026 Gabriel Rance. All rights reserved. See [LICENSE](LICENSE). Third-party notices are in [`public/third-party-notices.txt`](public/third-party-notices.txt).
