# Stack et décisions buy versus build

## Choix de lancement

| Besoin | Choix d’intégration proposé | Notre code |
|---|---|---|
| Auth humaine | OIDC provider managé | workspace roles, memberships, product authz |
| Apps et OAuth | Nango ou Composio, testé sur les apps prioritaires | common object mapping, scopes, broker, policy |
| Durable execution | Temporal Cloud ou self-host selon région | mission projections, capability protocol |
| LLM gateway | LiteLLM ou adapter interne simple | task policy, BYOK, quality/cost routing |
| Observability | Langfuse + OpenTelemetry | product scorecards, activation gates |
| Database | Postgres + pgvector | schema, RLS, provenance, common objects |
| Files | S3-compatible object store | ingest lifecycle, ACL, artifacts |
| Billing | Stripe | reservation ledger, usage attribution |
| Web | Next.js + React | product UX, design system, states |

## Qualification checklist fournisseur

Région et transferts, DPA, rétention, chiffrement, audit, self-host option, rate limits, webhook quality, tenant isolation, incident history, licence, migration path, total cost at target volume.

## Interne versus fournisseur

Ne pas écrire un connecteur OAuth parce que le produit veut « ses propres intégrations ». Construire le mapping métier parce que chaque capacité doit comprendre contact, demande, devis et source. Ne pas écrire un workflow engine parce que les agents sont nouveaux. Construire le protocole métier parce que la qualité et les approvals sont notre produit.

## Risques de dépendance

Chaque adapter expose une interface minimale et possède un fake pour tests. Conserver les prompts et scores indépendants de l’observability vendor. Exporter traces et datasets. Une capacité doit pouvoir changer de modèle avec une nouvelle evaluation, sans migration de son interface métier.
