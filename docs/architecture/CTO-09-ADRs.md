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

## ADR 006 — narrow broker paths for calendar reads and mailbox labels

**Statut :** proposé (2026-10-03, branche `feat/inbox-calendar-labels`). Détail : [inbox-calendar-labels.md](../product/inbox-calendar-labels.md).

**Décision :** le chemin brouillons (`src/lib/integrations/mailbox.ts`, politique `inbox-drafts-v1`) reste inchangé : sa regex `FORBIDDEN_SLUG` continue de refuser `LABEL`, `MODIFY`, `UPDATE`. Deux chemins séparés sont ajoutés derrière le broker, chacun avec sa table d’outils figée, sa propre assertion, son propre hash de politique et un flag de déploiement désactivé par défaut :

- `calendar-freebusy-v1` (`src/lib/integrations/calendar.ts`) : lecture seule des plages occupées (`GOOGLECALENDAR_FREE_BUSY_QUERY`, `OUTLOOK_GET_CALENDAR_VIEW` limité à start/end/showAs). Aucune écriture, aucune création d’événement. Flag `ORBIS_INBOX_CALENDAR`.
- `mailbox-labels-v1` (`src/lib/integrations/mailbox-labels.ts`) : ajout/retrait des cinq libellés « Orbi · … » uniquement (`GMAIL_LIST_LABELS`, `GMAIL_CREATE_LABEL`, `GMAIL_ADD_LABEL_TO_EMAIL`, `OUTLOOK_GET_MESSAGE`, `OUTLOOK_UPDATE_EMAIL` réduit à `{message_id, categories}`). Libellés système jamais modifiables. Ledger `inbox_labels` (clé d’idempotence + hash de politique) qui permet le retrait exact. Flags `ORBIS_INBOX_LABELS` et `ORBIS_INBOX_LABELS_GMAIL`.

Les créneaux sont calculés par du code (`src/lib/calendar/slots.ts`), jamais par le modèle ; le modèle reçoit les créneaux comme données et un contrôle déterministe retire toute autre date ou heure du brouillon.

**Pourquoi :** élargir la politique brouillons pour y faire entrer `UPDATE`/`LABEL` aurait affaibli la garantie « aucun envoi, aucune modification » du chemin le plus exposé. Des politiques séparées gardent chaque capacité auditable et révocable indépendamment, en mode `test` (simulé) d’abord.

**Coût :** un peu de duplication (exécuteur partagé `broker-exec.ts`), un scope Google restreint de plus pour les libellés Gmail (`gmail.modify`), et une seconde autorisation OAuth pour l’agenda.
