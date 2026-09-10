# Architecture

```text
Web app
  │
API and product control plane ── PostgreSQL / object storage
  │                 │
  │                 ├── capability resolver
  │                 ├── policy and approval service
  │                 └── usage ledger
  │
Temporal workflows ── activities
  │                    ├── model gateway
  │                    ├── knowledge and retrieval
  │                    ├── tool broker / connectors
  │                    └── evaluation runners
  │
Observability: OpenTelemetry + Langfuse
```

## Boundary rules

The browser never receives provider secrets. Every tool call carries tenant, user, mission version, scope, mode and correlation ID. Test mode uses a broker policy that denies external writes, even if a model requests them.

Workflows make durable decisions; activities perform network, database, file and LLM I/O. Activity results are recorded for replay. External effects require idempotency and reconciliation. This follows the durable-workflow model documented by Temporal.

PostgreSQL stores tenant-scoped business state. Use composite foreign keys and row-level security as defense in depth. Application roles must not own protected tables or bypass RLS. The database owner and privileged roles can bypass row security, so deployment and migration paths require tests.

## Monorepo

```text
apps/web
apps/api
apps/worker
packages/contracts
packages/domain
packages/capability-runtime
packages/model-gateway
packages/tool-broker
packages/knowledge
packages/evaluations
packages/capabilities
infra
```

## Security priorities

Tenant isolation; least privilege; secret rotation; signed OAuth state; SSRF protection for URL ingestion; file quarantine; prompt-injection separation between instructions and retrieved content; retention controls; audit events; rate limits; budget limits; human approval on external commitments.

## Runtime modes

Test mode uses fixture or selected live reads and blocks writes. Supervised mode prepares effects and waits for approval. Autonomous mode is scoped to a named policy and action set. Every run records mode and policy version.
