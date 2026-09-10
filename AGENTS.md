<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Orbis — project context

Orbis (codename "Agent OS") is a capability marketplace where a company installs bounded, evaluated AI missions instead of assembling an automation stack. Full product and architecture docs live in this repo:

- [docs/strategy/](docs/strategy/) — vision, PRD, UX, flows, capability contract, build-vs-buy, roadmap, decisions
- [docs/architecture/](docs/architecture/CTO-README.md) — target architecture, runtime, contracts, security, reliability, evaluation, stack, ADRs
- [docs/design/](docs/design/13-design-system.md) — design system, mockups, boards
- [docs/product/agent-runtime.md](docs/product/agent-runtime.md) — current runtime implementation and pilot gates

## Destination: closed-loop missions

The product's endpoint is not "draft a document for a human to send." A mission should be able to go end to end: browse the web, fill and submit forms, create third-party accounts, and pay — the same actions a human operator does today — under policy, not ad hoc. See [01-vision.md](docs/strategy/01-vision.md) (one-human-company runtime) and [05-capabilities.md](docs/strategy/05-capabilities.md) (later packages: quote preparation, tender analysis, lead operations — all require external writes).

Nothing here means "never automate the web, never pay, never sign up." It means: **prove the capability read-only first, then unlock the write path through the broker** — never bypass the broker to reach the action faster. The order is fixed by [10-roadmap.md](docs/strategy/10-roadmap.md): external writes ship only "after the action broker and approval model have been proven," not before.

## Invariants (always true, at every stage — do not violate without an ADR, see [CTO-09-ADRs.md](docs/architecture/CTO-09-ADRs.md))

- Every action (web navigation, form submission, account creation, payment) goes through the Tool broker — scoped, idempotent, dry-run-capable. No agent calls an external API, browser, or payment rail directly, no matter how trivial the action looks.
- Runtime mode gates what the broker will execute: `test` (no external effects; writes simulated or refused even if the model requests them), `supervised` (action prepared, waits for a payload-hash-bound human approval), `scoped_autonomy` (executes only actions/conditions inside an active, explicit policy). There is no global "full autonomy" mode — autonomy is granted per action type and per policy, never as a blanket agent capability.
- `tenant_id` always comes from the session, propagated server-side — never trust a client-supplied tenant.
- Every external action carries an idempotency key and a policy hash, so it can be safely replayed or audited.
- Secrets, credentials, and payment instruments are held by the broker/connector layer, never handed to the model or agent as raw values (see Tool broker, [CTO-01-architecture.md](docs/architecture/CTO-01-architecture.md)).
- Every significant output carries source references, or states why it has none.

## Current pilot state — today, not the destination (see [README.md](README.md))

No auth, no PostgreSQL (atomic JSON store only, not scalable), no encrypted per-tenant credentials, no durable jobs, no real OAuth connectors, no observability/retention controls, four read-only packages only. Building a browse/pay/signup capability now means building it *behind* a broker and policy stub that doesn't fully exist yet — build the stub, don't skip it.
