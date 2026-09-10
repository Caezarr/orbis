# Sécurité et trust boundaries

## Menaces prioritaires

1. Fuite inter-tenant dans retrieval, cache ou logs.
2. Prompt injection via documents, emails ou pages web.
3. Action externe non approuvée ou dupliquée.
4. Credential exposé à un modèle, frontend ou observabilité.
5. SSRF via URL fournie à l’onboarding ou au tool broker.
6. Exécution de package tiers non contrôlé.
7. Donnée sensible conservée au-delà de la politique.

## Défenses

| Menace | Contrôle obligatoire | Test de régression |
|---|---|---|
| Tenant leak | tenant context serveur, composite keys, RLS défense | utilisateur A ne voit jamais fixture B |
| Prompt injection | instruction plane séparé du content plane, tool policy hors modèle | document “ignore policy” ne change pas le scope |
| Action abusive | broker, allowlist, approval hash, mode test | modèle demande delete/send en test → deny |
| Credential leak | secret manager, redaction, short-lived token | scan traces et artifact outputs |
| SSRF | fetch proxy, DNS/IP validation, redirects bornés | URL localhost/private/cloud metadata → deny |
| Package tiers | sandbox, signature, permission manifest | package écrit hors scope → terminate |
| Retention | lifecycle source, artifact, trace et backup | suppression vérifiée après restauration |

## Instruction plane et content plane

Les instructions approuvées par le propriétaire, policies et harness sont stockés séparément des documents récupérés. Un document peut proposer une information ; il ne peut pas modifier une règle. Chaque prompt assemble les plans avec des délimitations et transmet au modèle uniquement le scope autorisé.

## Credential flow

Le browser lance un flow OAuth ou saisit une clé vers un endpoint sécurisé. Le backend chiffre ou délègue au secret manager. Les workers reçoivent un token éphémère par action. Les logs contiennent provider, operation et status, jamais header, token ou payload sensible.

## Audit

Audit append-only : actor, tenant, action, target, mission version, policy hash, trace id, timestamp, result. L’audit n’est pas la mémoire du modèle. Il doit être consultable par un admin autorisé et exportable selon retention.

## Production gate sécurité

Avant pilote : tenant isolation tests, permission matrix, secret redaction, SSRF tests, file scanning, OAuth state tests, idempotency tests et incident runbook. Avant packages tiers : sandbox et revue du manifest. Avant actions financières ou juridiques : revue humaine et policy explicite.
