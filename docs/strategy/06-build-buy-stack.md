# Build versus buy and stack

## Rule

Buy infrastructure where reliability, compliance and breadth already exist. Build the adaptation layer where company context, capability selection, quality and UX create the product advantage. Revisit suppliers at kickoff; versions and pricing change.

| Need | Use existing product first | Build ourselves |
|---|---|---|
| App auth and membership | OIDC provider such as Auth0, WorkOS or Clerk; choose after security and EU data review | Workspace roles, capability permissions and policy evaluation |
| OAuth, tokens, syncs, triggers | Nango for code-first integrations and managed auth, syncs and triggers; it advertises 900+ APIs | Common business-object mapping, source authority and mission-specific scopes |
| Agent tools and app actions | Composio for tools, sessions, auth, triggers and large app coverage; qualify only needed tools | Test/live broker, approval binding, idempotency and tenant policy |
| Durable workflows | Temporal for long-running workflows, retries, timers, signals and event history | Mission state, capability graph and business projections |
| LLM provider routing | LiteLLM or equivalent gateway, plus direct provider adapters where needed | Task policy, quality/cost router, BYOK rules and evaluation-aware routing |
| Traces, prompts, datasets, evals | Langfuse for tracing, prompt management, datasets and online/offline evals | Product-facing scorecards, company calibration and activation gates |
| Vector and relational data | PostgreSQL + pgvector | Tenant-aware knowledge, provenance and common business objects |
| Web research | Provider API or browser service selected per policy | Source quality, citation and freshness checks |
| Files | S3-compatible object storage | Ingestion status, permissions, document lifecycle |
| Billing | Stripe | Usage ledger, reservations, provider versus platform cost |
| Telemetry | OpenTelemetry and managed logs/metrics | Domain events, quality and value metrics |

Nango describes auth, API integrations, syncs, triggers and agent-ready tools. Composio describes end-user auth, tool discovery, sessions and triggers across many apps. Langfuse describes traces, prompt versions, datasets, human feedback, LLM judges and experiments. Temporal documents durable workflow replay and the activity boundary for external I/O. These are integration candidates, not commitments. [Nango](https://www.nango.dev), [Composio](https://docs.composio.dev/docs), [Langfuse](https://langfuse.com/docs), [Temporal](https://docs.temporal.io/workflows)

## Recommended starting stack

TypeScript monorepo; Next.js and React for web; Fastify or NestJS for API; PostgreSQL with pgvector; Temporal workers; S3-compatible files; Nango or Composio for selected connectors; LiteLLM-style model gateway; Langfuse; OpenTelemetry; Stripe after pricing is defined; Playwright and Vitest.

Do not add a graph database, a second workflow engine, a general multi-agent framework and a custom credential service simultaneously. Start with explicit capability protocols and only introduce another component when a measured requirement cannot be met.
