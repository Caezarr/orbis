# Fiabilité et production

## SLO proposés

| Service | Objectif pilote | Mesure |
|---|---:|---|
| Product API | 99.5 % mensuel | requêtes hors fournisseur, p95 latency |
| Mission start | 99.9 % accepté | commande persistée et workflow démarré |
| Run completion | 99 % hors erreurs d’entrée | runs terminales dans la fenêtre |
| Artifact durability | 99.99 % | artefact récupérable et ACL correcte |
| Audit completeness | 100 % des actions | action → événement audit |

Ce sont des cibles à valider après mesure. Ne pas les publier comme garanties commerciales sans engagement opérationnel.

## Failure taxonomy

`user_input`, `missing_knowledge`, `permission`, `provider_transient`, `provider_permanent`, `model_quality`, `policy_denied`, `budget`, `system`, `uncertain_external_effect`.

Chaque catégorie a une UX et un traitement : correction demandée, retry, fallback, pause, escalation ou reconciliation. Un `failed` générique est insuffisant.

## Observabilité

Trace de bout en bout : request_id, tenant hashé, run_id, mission version, workflow, node, provider, model, latency, tokens, cost, retry count, evaluator scores. Redaction avant export. Langfuse peut fournir traces, prompts, datasets et scores ; OpenTelemetry relie les services.

Dashboards : run success, queue age, provider errors, cost per accepted result, evaluation regression, approval latency, connector health, artifact failures, tenant isolation alerts.

## Reprise

Backups PostgreSQL et object storage ; test de restauration périodique. Temporal conserve l’historique des workflows selon politique de rétention. Versionner workers et workflows ; utiliser les mécanismes de patch/versioning lors d’un changement incompatible.

## Incident playbooks

Provider indisponible : circuit breaker, fallback autorisé, pause des nouvelles actions, message utilisateur. Credential compromis : révoquer, suspendre connexions, analyser audit, notifier selon contrat. Mauvaise sortie généralisée : désactiver package/version, geler activation, identifier traces affectées, lancer correction et re-run approuvé. Fuite suspectée : isoler tenant, préserver logs, bloquer retrieval, appliquer procédure de réponse.

## Test de chaos minimal

Tuer un worker pendant une activity ; couper le provider modèle ; timeout après action externe ; révoquer OAuth pendant run ; épuiser budget ; recevoir deux webhooks identiques ; rendre une source obligatoire inaccessible. Le résultat attendu doit être écrit avant le test.
