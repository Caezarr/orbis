# Architecture cible

## Vue des frontières

```text
Browser
  │ HTTPS / session
  ▼
Product API ──────────────── PostgreSQL (source of truth produit)
  │                              │
  │ outbox                       ├─ workspace / mission / policy
  ▼                              ├─ run projection / approval / usage
Workflow starter                 └─ source metadata / audit index
  │
  ▼
Temporal workflow
  │ schedules deterministic decisions
  ├──────────────► Activity: Knowledge gateway
  ├──────────────► Activity: Model gateway
  ├──────────────► Activity: Tool broker
  ├──────────────► Activity: Evaluation runner
  └──────────────► Artifact store
```

Le workflow ne parle jamais directement au navigateur, au fournisseur de modèle ou à une API client. Il appelle des activities bornées et journalisées. L’API écrit d’abord l’état métier et l’outbox dans une transaction, puis un dispatcher démarre le workflow. Une panne entre les deux est récupérable par relecture de l’outbox.

## Modules

| Module | Responsabilité | Ne doit pas faire |
|---|---|---|
| Product API | authn, authz, commandes, projections | exécuter une tâche longue dans la requête |
| Capability registry | packages, manifests, versions, maturité | stocker des données privées dans un package global |
| Mission service | installation, config, activation | choisir une permission hors policy |
| Policy service | scopes, approvals, budgets, mode | modifier silencieusement une mission |
| Knowledge gateway | ingestion, ACL, retrieval, provenance | transformer un document en instruction implicite |
| Model gateway | route, BYOK, fallback, usage | décider seul qu’une sortie est correcte |
| Tool broker | actions, scopes, idempotency, dry run | exposer des credentials à un agent |
| Evaluation runner | fixtures, judges, reports, gates | valider sur les mêmes données apprises |
| Runtime | orchestration, reprise, state machine | contourner les policy checks |
| Operator UI | décisions, evidence, corrections | masquer une action externe ou une incertitude |

## Invariants MUST

- `tenant_id` vient de la session et est propagé par le serveur.
- Toute mission active pointe vers une version immuable.
- Toute action externe possède une clé d’idempotence et un policy hash.
- Test mode refuse les opérations d’écriture, même si le modèle les demande.
- Toute sortie importante possède des références de sources ou indique pourquoi elle n’en possède pas.
- Toute mémoire possède scope, provenance, validité et statut d’approbation.
- Toute consommation est liée à un run, un tenant et un payeur.
- Les secrets ne sont jamais présents dans les logs, prompts persistés ou événements.

## Runtime modes

`test` : lectures contrôlées, outils d’écriture simulés ou refusés, aucun effet externe.

`supervised` : prépare une action ; le broker attend une approval liée au payload hash.

`scoped_autonomy` : exécute seulement les actions et conditions incluses dans une policy active.

Il n’existe pas de mode « full autonomy » global.

## Dépendances externes

Nango ou Composio pour les intégrations ; Temporal pour les workflows ; Langfuse et OpenTelemetry pour tracing/evals ; PostgreSQL, pgvector et object storage pour état et connaissance ; fournisseur OIDC pour identité humaine. Chaque dépendance est derrière un adapter interne et un test contractuel.
