# Orbis

New business journey: [audit](http://127.0.0.1:3000/audit), [100-case catalogue](http://127.0.0.1:3000/catalog), saved client plans and tailored mission installation. See [product release boundaries](docs/product/PRODUCT-RELEASE.md) and [pricing proposal](docs/product/PRICING.md). The 100 authored documentary contracts use the four existing engine families; they are not 100 operational external integrations.

Modular AI workflows for company work. A polished landing, a local workspace, and four bounded model-backed workflows: customer-request analysis, meeting preparation, research briefs and content drafts.

**Local pilot, not a production SaaS.** No authentication, durable workers, tenant-isolated database or operational external connectors yet. Do not expose the workspace publicly or use production customer data. The landing's examples and existing workspace records are illustrative.

## Run locally

```sh
pnpm install
pnpm dev --hostname 127.0.0.1
```

Open [the workspace](http://127.0.0.1:3000/missions/mission_request/lab). The UI remains explorable without a model key, but a real run is disabled until configured.

In an ignored `.env.local`, set:

```dotenv
ORBIS_AI_PROVIDER=openai
ORBIS_AI_MODEL=your-supported-model-id
OPENAI_API_KEY=your-private-api-key
```

For Anthropic, use `ORBIS_AI_PROVIDER=anthropic`, an appropriate model ID and `ANTHROPIC_API_KEY`. Choose a model supporting structured outputs. Restart after changing server configuration. Never commit actual keys. There is no default model, automatic fallback or managed billing.

**Data boundary:** clicking Run sends the request, selected source text, mission instructions and approved scoped memory to that provider. Provider charges apply, including potentially unsuccessful requests. Configure limits on the provider account. Orbis does not enforce a euro budget yet.

## The working loop

1. Open a mission → Configure: outcome, ready sources, operating instructions.
2. Write a request or edit an example → Run this mission.
3. Follow real framing, generation, review and optional repair steps.
4. Inspect the deliverable, exact source quotes, checks, unknowns and token usage.
5. Propose a correction as a mission rule → approve the rule → run again.
6. Mark a passing, current result reviewed. This records feedback; it does not send anything.

The workflow stops after five calls, one repair pass or a 150-second deadline. Source quote integrity is checked in code. Coverage, claim support and commitments are assessed by an AI reviewer and still require human judgment.

## Verification

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm exec next build --webpack
```

The test suite uses mocked provider responses, never paid calls. A production build does not prove live-provider compatibility or output quality. See [runtime architecture and pilot gates](docs/product/agent-runtime.md).

## Reused building blocks

Next.js / React / TypeScript / Tailwind; Vercel AI SDK with official OpenAI and Anthropic adapters; Zod for structured contracts; React Markdown for deliverables; Vitest for runtime tests. The workflow itself is deliberately small and bounded, not a new agent framework.

## Still missing before enterprise use

OIDC and server-derived tenant authorization; PostgreSQL with isolation; encrypted per-tenant credentials; durable jobs and idempotency; calibrated regression datasets; provider-price metering and reservations; retrieval and ingestion permissions; actual OAuth connectors; payload-bound human approvals connected to real execution; observability and retention/deletion controls.

The current atomic JSON store is a local convenience, **not horizontally scalable storage**. Existing dashboard ROI, profiles and connector states include fixture data, not measured business outcomes.
