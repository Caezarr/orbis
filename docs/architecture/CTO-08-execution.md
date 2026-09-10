# Roadmap technique et tickets

## Vertical slice 1 — trois semaines

1. `PLAT-001` workspace, membership et tenant context.
2. `CAP-001` package registry et manifest validation.
3. `UX-001` website/description profile avec faits/hypothèses.
4. `MISSION-001` mission draft et version immutable.
5. `RUN-001` test run avec une capability research.
6. `KNOW-001` upload document, source snapshot et citations.
7. `EVAL-001` report, human feedback et correction scope.
8. `OBS-001` trace run → step → model/tool/evaluator.

Exit : un utilisateur fournit un site et un document, choisit une mission, obtient un résultat sourcé, corrige un point et relance sans intervention manuelle de l’équipe.

## Vertical slice 2 — quatre semaines

1. `POL-001` test/supervised/scoped autonomy.
2. `TOOL-001` broker avec une lecture et une écriture simulée.
3. `CONN-001` un fournisseur via adapter Nango/Composio.
4. `COST-001` reservation, usage, retries et accepted-result cost.
5. `DUR-001` Temporal, idempotency et uncertain reconciliation.
6. `SEC-001` RLS, redaction, SSRF and prompt-injection fixtures.
7. `CAP-002` request analysis, meeting prep, content draft.

Exit : deuxième capacité réutilise le company profile et un source scope sans exposer un autre tenant.

## Go production pilote

Tous les invariants MUST testés ; runbook incident ; restauration vérifiée ; logs redacted ; provider failure testée ; coûts connus ; alpha packages possèdent held-out evals ; actions externes limitées à supervised ; export et suppression testés.

## Anti-patterns à refuser

- Tout faire avec un prompt géant.
- Conserver la mémoire uniquement en embeddings.
- Laisser le modèle choisir ses permissions.
- Rejouer un email après timeout sans vérifier l’effet.
- Déclarer un score de confiance comme preuve.
- Générer un graph différent pour chaque client sans versioning.
- Construire une marketplace avant de maintenir trois packages.
- Mesurer les tokens sans mesurer le travail humain de correction.
