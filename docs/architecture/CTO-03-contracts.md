# Contrats et modèle de données

## Package capability

```yaml
slug: customer-request-analysis
version: 0.4.0
maturity: ready_to_test
owner: internal-team
inputs:
  - request_document
outputs:
  - request_summary
  - prepared_reply
  - unknowns
tools:
  - read_approved_sources
  - create_artifact
policies:
  external_writes: deny
  citations_required: true
evaluations:
  - requirement_coverage
  - unsupported_claim_rate
  - human_acceptance
limits:
  max_cost_eur: 0.50
  max_duration_seconds: 180
```

## Versioning

Package, protocol, prompt, model profile, tool adapter, source snapshot et evaluator sont identifiés par une version ou un hash. Une run conserve l’ensemble. Une mission active ne suit jamais automatiquement la dernière version.

## Entités essentielles

`workspace`, `membership`, `company_profile`, `capability_package`, `mission`, `mission_version`, `source`, `source_version`, `instruction`, `memory_item`, `connection`, `run`, `step_run`, `artifact`, `evaluation_report`, `approval`, `action`, `budget_reservation`, `usage_entry`, `audit_event`, `outbox_event`.

Toutes les tables client possèdent `tenant_id`. Les relations inter-tenant sont impossibles par clés composites `(tenant_id, id)`. Les workers reçoivent le tenant depuis la commande signée ; jamais depuis une instruction modèle.

## API contract principles

- REST `/v1` pour commandes et lecture ; SSE pour progression.
- Schémas OpenAPI et validation runtime.
- `Idempotency-Key` obligatoire pour test, activation et actions.
- `If-Match` pour mutations de version.
- erreurs structurées : `code`, `message`, `request_id`, `retryable`, `details`.
- pas de contenu complet dans les événements ou logs.
- pagination curseur et limites de taille.

## Événements

`profile.completed`, `source.ready`, `source.revoked`, `mission.activated`, `run.started`, `run.waiting`, `run.completed`, `run.failed`, `approval.requested`, `approval.decided`, `budget.exhausted`.

Livraison au moins une fois. Les consommateurs dédupliquent par `event_id`. L’outbox est créée dans la même transaction que la mutation métier.

## Provenance

Chaque claim important peut pointer vers une source, une version de source, un emplacement et une date. Une source devenue inaccessible passe en `stale` et peut bloquer une mission si elle est obligatoire. La recherche vectorielle ne décide pas à elle seule de l’autorisation : ACL et scope sont appliqués avant restitution.
