# Evaluation et qualité

## Principe

Une capacité est un contrat de qualité, pas un prompt. L’évaluation mesure le résultat métier et l’effort humain pour l’accepter.

## Jeux de données

Chaque package possède :

- happy paths représentatifs ;
- cas limites ;
- cas incomplets ;
- contradictions ;
- adversarial/prompt injection ;
- données de validation held-out ;
- exemples anonymisés et autorisés.

Les données de calibration ne servent pas à proclamer la qualité du même changement. Les datasets sont versionnés avec propriétaire, provenance, consentement et rétention.

## Evaluators

Code : schéma, calcul, champ obligatoire, citations, doublons, limites.

Modèle juge : pertinence, ton, complétude, mais seulement avec rubriques et exemples calibrés.

Humain : acceptation, correction, raison du rejet et portée de la correction.

Production : feedback explicite, correction réelle, rework, abandon, escalade et résultat de l’action.

## Activation gate

```text
package version valid
AND required sources accessible
AND critical evaluators pass
AND no policy violation
AND cost within limit
AND approval policy configured
AND sample human review complete
```

Les seuils appartiennent à la capacité et peuvent être adaptés par risque. Une capability de contenu et une capability de devis n’ont pas les mêmes contrôles.

## Regression loop

Prompt/model/protocol change → run offline suite → compare baseline → inspect regressions → canary on internal tenant → supervised pilot → promote. Conserver les traces qui ont causé une correction pour enrichir les tests, sans les confondre avec le jeu de validation.

## Métriques

Pass rate par contrôle, human acceptance rate, correction rate, unsupported claim rate, citation coverage, p50/p95 latency, accepted-result cost, retry rate, escalation rate et false autonomy rate. Un score agrégé ne doit jamais masquer une défaillance critique.
