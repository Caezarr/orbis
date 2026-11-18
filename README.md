<p align="center">
  <img src="public/brand/orbi/done-256.webp" width="128" alt="Orbi, the Orbis mascot" />
</p>

# Orbis

**An agent harness that lets a small company hand real work to an AI agent: every task is a versioned contract with gates, scoped evidence and human approval, and the model is never the one in control.**

[![CI](https://github.com/Caezarr/orbis/actions/workflows/ci.yml/badge.svg)](https://github.com/Caezarr/orbis/actions/workflows/ci.yml)

![Orbis: your company, with a little more capacity](public/brand/orbis-modules.png)

## The problem

Companies do not trust agents with real work, and they are right. In a typical agent setup the scope is a prompt, the evidence is whatever the model decided to read, memory changes silently, a retry can repeat an external action, and nobody can say which context produced a given output. That is acceptable for a demo. It is not acceptable when the output is an email to a customer quoting a price. A small business cannot review prompts or read traces, so the guarantees have to be built into the system, not into a policy document.

## How Orbis solves it

Each business task becomes a **capability contract**: role, objective, context, tools, what the agent must do and what it cannot do. Code, not the model, enforces it.

- **Versioned contracts.** A mission pins a package version and a mission version. Each run records a hash of the exact context it saw (sources, approved memory, instructions, provider, model); a run whose context changed cannot be accepted.
- **Eval gates before anything reaches a human.** Output is schema-checked, then passed through deterministic guards: prices, dates, contacts and commitments not found in a trusted source become `[[À CONFIRMER]]` questions, citations must appear verbatim in their source, a Reply-To mismatch downgrades the draft to review.
- **Tenant and mission-scoped retrieval.** An agent sees only the sources its mission version allows, for its own tenant (Postgres row-level security, forced).
- **Human-approved memory.** Feedback and facts learned from sent mail are proposals. Only an owner or admin can approve them, and only approved items reach a prompt.
- **Idempotent, bounded actions.** External effects go through a closed tool allow-list with pinned tool versions and an idempotency ledger; spend is reserved against a budget before each model call; nothing can send.

```text
inbound email ──► deterministic skip ──► budget reservation ──► classify
   ──► draft (schema-bound) ──► guardDraft + recipient check ──► optional claim check
   ──► draft in the user's own mailbox (never sent) ──► feedback ──► proposed memory ──► human approval
```

The contract running in production today is `inbox-replies@1`: prepare replies to customer and quote requests as drafts in the company's own Gmail or Outlook, cite sources, and turn every unverifiable fact into an explicit question.

## Try it

Requirements: Node.js 22, pnpm 10. No API key, no database and no network model call are needed for these steps.

```bash
git clone https://github.com/Caezarr/orbis.git && cd orbis
pnpm install --frozen-lockfile
pnpm test
```

Expected (models are mocked, no paid call):

```text
 Test Files  92 passed (92)
      Tests  1158 passed (1158)
```

Run only the red-team suites, which feed an "obeying" model hostile emails and web pages and assert that nothing the attacker wants gets through:

```bash
pnpm exec vitest run src/lib/security/redteam
```

```text
 Test Files  4 passed (4)
      Tests  82 passed (82)
```

Start the app; the interface works without a provider key:

```bash
pnpm dev --hostname 127.0.0.1    # then open http://127.0.0.1:3000 and http://127.0.0.1:3000/start
```

### Full loop with a fake mailbox (Docker)

To run onboarding to drafts end to end without a real mailbox or a paid model, the repo ships a local Supabase stack (Postgres, Auth, Mailpit), a fake in-process mailbox that replaces Composio, and a deterministic demo model. All three are refused in production.

```bash
pnpm local:up                  # Supabase in Docker, runtime role without BYPASSRLS, migrations
pnpm -s local:env > .env.local # throwaway local keys; already sets ORBIS_DEMO_MAILBOX=true
echo "ORBIS_AI_PROVIDER=demo" >> .env.local
pnpm demo:reset                # seed the fake mailbox
pnpm dev --hostname 127.0.0.1 --port 3000
```

Open `/start`. Magic links land in Mailpit at `http://127.0.0.1:54324`; the fake inbox and the drafts Orbis created are at `/dev/demo-mailbox`. This is the path CI exercises with Playwright on every pull request.

To draft with a real model instead, set `ORBIS_AI_PROVIDER=openai` (or `anthropic`), `ORBIS_AI_MODEL` and the matching `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. A real Gmail or Outlook connection needs a Composio key. Every variable is documented in [.env.example](.env.example).

## How it works

- `src/lib/runtime/` holds provider selection, schema-bound generation (`Output.object(zod)`, no retries, abort timeout) and the contracts, including `INBOX_CONTRACT` in `inbox-replies.ts`.
- `src/lib/inbox/pipeline.ts` runs the production mission per message: skip, reserve budget, classify, draft, guard, claim check, write the draft.
- `src/lib/security/untrusted-text.ts` normalises email and web text (NFKC, invisible and bidi characters, defanged links) and prompts wrap it in per-call random-boundary data blocks.
- `src/lib/knowledge/` and `src/lib/brain/` do scoped lexical retrieval and the approval workflow for memory and company facts.
- `src/lib/integrations/` is the only code that touches third-party tools: closed allow-lists, pinned versions, the draft ledger and a generic action broker for future external writes.
- Background work is Postgres-leased jobs (`FOR UPDATE SKIP LOCKED`), one running batch per workspace.

[ARCHITECTURE.md](ARCHITECTURE.md) covers components, the harness contract, every gate, trust boundaries, data and testing, and lists where the code differs from the target design.

## Proof in the repo

- **1158 Vitest tests in 92 files** (unit, integration, routes, billing state machine, workers), all with mocked models.
- **82 red-team tests** in `src/lib/security/redteam/`: injected instructions, homoglyph domains, zero-width contacts, Reply-To divergence, email-chosen meeting times, off-schema classifications, send and forward tool requests, across inbox, brain, follow-ups, meetings and onboarding.
- **Playwright end-to-end** (`e2e/`) from `/start` to drafts against the local stack, run twice in CI: once with no model configured, once with the demo model.
- **Static gates:** strict TypeScript, ESLint with zero warnings, `knip` for unused files, exports and dependencies.
- CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs all of the above on every pull request, without any secret or live service.

## Status and limits

- One contract is in production use: inbox reply drafts. Orbis prepares; a human sends.
- Contracts do not have literal `role`, `must` or `cannot` fields yet. They are expressed through the contract brief, zod schemas and deterministic guards. The registry's `evaluations` and `approvalPoints` are labels, not executed checks.
- External writes (sending, CRM, payments) are not wired. The action broker exists and is tested, but no production path calls it.
- Retrieval is lexical (BM25-style), not vector-based. No queue or outbox beyond Postgres leases; observability is Sentry plus structured logs.
- Parts of the design documentation are in French.

## Development

```bash
pnpm typecheck   # next typegen + tsc --noEmit
pnpm lint        # ESLint, zero warnings allowed
pnpm knip        # unused files, exports, dependencies
pnpm test        # Vitest, mocked models
pnpm test:e2e    # Playwright, needs pnpm local:up
```

Stack: Next.js 16 and React 19, TypeScript strict, Postgres on Supabase with RLS, Vercel AI SDK (OpenAI or Anthropic), Composio for mailbox and calendar access, Stripe for billing.

Further reading: [ARCHITECTURE.md](ARCHITECTURE.md) · [target architecture and ADRs](docs/architecture/CTO-README.md) (mostly French) · [integrations and knowledge](docs/product/INTEGRATIONS-AND-KNOWLEDGE.md) · [security policy](SECURITY.md).

## License

Proprietary. Copyright (c) 2026 Gabriel Rance. All rights reserved. The source is published for viewing only; no permission is granted to use, copy, modify or distribute it without prior written permission. See [LICENSE](LICENSE). Third-party notices are in [`public/third-party-notices.txt`](public/third-party-notices.txt).
