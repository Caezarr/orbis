# Orbis — backlog code

Tenu par la routine du matin (Claude). Une tâche par jour, dans l'ordre, sauf PR de la pile cassée ou défaut critique trouvé en revue. Les actions de Gabriel sont dans Todoist (projet « Orbis »), pas ici.

## Backlog

1. [x] Digest email quotidien : opt-in, contenu sans donnée sensible, passage via broker. Livraison **simulée** (aucun transport e-mail construit) — PR #26 ([daily-digest.md](product/daily-digest.md)).
2. [x] Crons : `vercel.json` (retention + digest quotidiens, OK sur Hobby) + GitHub Actions `inbox-scheduler.yml` toutes les 5 min. Inactif tant que `CRON_SECRET` / `ORBIS_APP_URL` ne sont pas posés côté GitHub — branche `chore/ops-readiness`.
3. [x] Erreurs navigateur dans Sentry, sans SDK ni changement de lockfile : relais same-origin `/api/client-errors`, même nettoyage que le serveur — PR #27 ([launch-hardening.md](product/launch-hardening.md) § observabilité).
4. [ ] Formulaires de contact : expéditeurs de confiance (Reply-To client) pour drafter les demandes venues du site. **Bloqué** : décision de Gabriel attendue (tâche Todoist « Trancher 2 décisions issues des tests de la boîte de démo », question 1).
5. [x] Regroupement des questions assisté par modèle : opt-in `ORBIS_BRAIN_QUESTION_GROUPING`, questions **ouvertes** seulement, repli lexical sur toute erreur — PR #38 ([company-brain.md](product/company-brain.md#model-assisted-question-grouping-opt-in-orbis_brain_question_groupingtrue)).
6. [ ] Pages `/for` : MAJ copie quand la lecture de boîte sera en prod.
7. [ ] Tests E2E navigateur du parcours `/start`. Débloqué : pile locale `pnpm local:up` (Supabase Docker) + boîte de démo (mergée, #33 via #34).
8. [ ] Niveau 9 autonomie progressive : spec uniquement.

## Découvert en route

- [ ] Digest : transport e-mail réel (fournisseur UE, domaine d'envoi, SPF/DKIM, sous-traitant ajouté). Bloqué par décision Gabriel (fournisseur + accord pour qu'Orbis envoie ce mail de notification au client lui-même ; jamais depuis sa boîte).
- [ ] Sentry : piles navigateur minifiées (pas d'upload de source maps). À traiter seulement si les erreurs réelles sont illisibles ; demanderait `SENTRY_AUTH_TOKEN` au build.
- [x] Doc 18 commité (branche `chore/ops-readiness`).
- [x] Pile locale type prod : 13 migrations appliquées sur Postgres 17, RLS inter-tenant vérifiée (`check-platform --database` PASS), compte créé par lien magique (03/10).
- [ ] Mail de connexion Supabase en anglais par défaut : template FR dans `supabase/templates/`, à coller dans le projet Supabase prod + SMTP sur le domaine Orbis.
- [x] Profil `/start` sans IA : rate la zone « de Lille à Tournai » (#32, mergée via #34).

- [ ] 4 commits de `fix/start-ai-fallback-reason` poussés après le merge de #36 (IA muette en prod sur Claude 5, fonctions à Dublin) : jamais arrivés sur main → PR #37 (04/10), à merger par Gabriel.
- [ ] Regroupement des questions : mesurer la qualité sur de vraies questions avant d'activer le flag en prod.

## Décisions de Gabriel

_(reportées ici depuis les commentaires Todoist)_

- Aucune pour l'instant.
