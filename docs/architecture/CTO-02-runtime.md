# Runtime et séquences critiques

## Lancer un test

```text
POST /missions/:id/test-runs
  1. API vérifie membership et mission version
  2. API valide fixtures et réserve le budget estimé
  3. API crée run(status=queued) + outbox event dans la même transaction
  4. Dispatcher démarre workflow avec run_id stable
  5. Workflow appelle knowledge activity avec ACL + source snapshot
  6. Workflow appelle model gateway avec task policy
  7. Workflow appelle validators et evaluation runner
  8. Workflow écrit artifact metadata et run projection
  9. UI reçoit événements et affiche sources, checks, coût, inconnues
```

Un test ne peut pas appeler directement `send_email`, `create_invoice`, `delete_record` ou une action équivalente. Le broker répond `ACTION_NOT_ALLOWED_IN_TEST_MODE`.

## Approuver une action

```text
Agent prépare payload
→ broker calcule policy decision
→ UI affiche effet, destinataire, sources, coût, version
→ user approve
→ serveur vérifie actor + mission + payload_hash + expiration
→ reservation budget
→ broker exécute avec idempotency_key
→ provider result ou uncertain
→ reconciliation si timeout
```

Une approbation ne vaut que pour le payload exact. Une modification de destinataire, montant, document ou version invalide l’approbation.

## Reprise et doublon

Les appels non idempotents sont isolés dans des activities avec une clé déterministe. Après timeout, le runtime ne relance pas aveuglément : il interroge le provider avec la clé ou passe à `needs_reconciliation`. Les actions internes sont transactionnelles et protégées par une contrainte d’unicité.

## Passage d’une mission à l’autre

Une mission publie des artefacts typés et des événements métier. Une autre mission consomme un artefact selon un contrat et la policy du tenant. Elle ne lit pas la mémoire privée de la première sans permission. Les cascades ont une profondeur maximale et un `causation_id` pour empêcher les boucles.

## Backpressure

Chaque tenant possède limites de concurrence, budget de tokens, budget d’actions, taille de documents et quota de runs. Une file pleine met les runs en attente avec cause visible. Les retries exponentiels ont un plafond. Les tâches interactives et batch ont des queues séparées.

## État minimal d’un run

```json
{
  "run_id": "uuid",
  "mission_version_id": "uuid",
  "mode": "test|supervised|scoped_autonomy",
  "state": "queued|running|waiting_approval|succeeded|failed|uncertain",
  "policy_hash": "sha256",
  "workflow_id": "stable",
  "cost_reservation_id": "uuid",
  "source_snapshot_ids": ["uuid"],
  "artifact_ids": ["uuid"],
  "trace_id": "trace"
}
```
