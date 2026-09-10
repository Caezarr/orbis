# Data and technical contracts

## Core entities

`workspace`, `membership`, `company_profile`, `capability_package`, `mission`, `mission_version`, `source`, `source_version`, `instruction`, `memory_item`, `connection`, `run`, `step_run`, `artifact`, `evaluation`, `approval`, `action`, `budget_reservation`, `usage_entry`, `audit_event`, `outbox_event`.

Every customer entity has `tenant_id`. Mission and package versions are immutable once tested or active. External connections store a provider reference and secret reference, never the secret in ordinary rows or traces.

## Package manifest

```yaml
slug: research-brief
version: 0.1.0
maturity: ready
inputs: [question, scope, sources]
outputs: [brief, citations, unknowns]
tools: [search, document_read]
external_effects: []
evaluations: [citation_coverage, relevance, duplicate_rate]
approval: never_for_test
```

## Run record

```json
{
  "run_id": "uuid",
  "tenant_id": "uuid",
  "mission_version_id": "uuid",
  "mode": "test",
  "state": "succeeded",
  "workflow_id": "stable-id",
  "input_refs": ["source-version-id"],
  "artifact_refs": ["artifact-id"],
  "cost": {"provider": 0.12, "platform": 0.00, "currency": "EUR"},
  "policy_version": "hash",
  "trace_id": "trace-id"
}
```

## API principles

Version `/v1`; strict schemas; idempotency keys on test, activate and external actions; cursor pagination; request IDs; non-disclosing authorization errors; SSE or websocket for progress; webhooks signed and deduplicated.

Important endpoints: `POST /profile-jobs`, `GET /capabilities`, `POST /intent-resolutions`, `POST /missions`, `POST /missions/:id/versions`, `POST /missions/:id/test-runs`, `POST /evaluations/:id/feedback`, `POST /missions/:id/activations`, `POST /actions/:id/decisions`, `POST /connections/:provider/start`, `GET /usage`.

## Events

`profile.completed`, `source.ready`, `source.revoked`, `mission.activated`, `run.started`, `run.waiting`, `run.completed`, `run.failed`, `approval.requested`, `approval.decided`, `budget.exhausted`. At-least-once delivery; consumers deduplicate event IDs. Do not put full documents or secrets on the bus.
