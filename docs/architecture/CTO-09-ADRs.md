# Architecture decision records

## ADR 001 — durable runtime

**Décision proposée :** intégrer Temporal pour les workflows longs et reprenables.

**Pourquoi :** mission, approbation, attente humaine, retries et timers ont une durée supérieure à une requête HTTP. Une queue maison recréerait historique, reprise et visibilité.

**Coût :** modèle de déterminisme, versioning et service supplémentaire.

**Rejet si :** un test de charge, de région ou de coût démontre une incompatibilité ; documenter alors le remplacement.

## ADR 002 — integrations

**Décision proposée :** intégrer Nango ou Composio pour le premier périmètre.

**Pourquoi :** auth, refresh, scopes, syncs et large couverture sont des briques existantes. Notre valeur se trouve dans le mapping, l’autorisation par mission et l’expérience.

**Coût :** dépendance fournisseur, abstraction parfois moins fine, coût d’usage.

## ADR 003 — capability package over free-form agents

**Décision proposée :** exécuter des packages versionnés et des protocoles bornés ; autoriser la composition contrôlée.

**Pourquoi :** qualité, tests, permissions et support deviennent possibles. La demande libre sert à trouver ou composer, pas à contourner les contrats.

**Coût :** couverture initiale plus petite, travail de package design.

## ADR 004 — product context over generic memory

**Décision proposée :** mémoire typée et sourcée : episodic, semantic, procedural, preference, working.

**Pourquoi :** scope, validité et correction doivent être visibles. Un RAG unique ne distingue pas une instruction d’une observation.

**Coût :** modèle de données et UX plus riches.

## ADR 005 — approvals bound to payload

**Décision proposée :** approval hash + policy version + expiration.

**Pourquoi :** l’utilisateur approuve un effet précis, pas une intention abstraite qui pourrait changer pendant l’exécution.

**Coût :** plus de demandes d’approbation lors d’un changement ; réduction du risque d’action surprise.
