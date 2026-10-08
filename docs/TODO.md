# Orbis — backlog code

Tenu par la routine du matin (Claude). Une tâche par jour, dans l'ordre, sauf PR de la pile cassée ou défaut critique trouvé en revue. Les actions de Gabriel sont dans Todoist (projet « Orbis »), pas ici.

## Backlog

1. [x] Digest email quotidien : opt-in, contenu sans donnée sensible, passage via broker. Livraison **simulée** (aucun transport e-mail construit) — PR #26 ([daily-digest.md](product/daily-digest.md)).
2. [x] Crons : `vercel.json` (retention + digest quotidiens, OK sur Hobby) + GitHub Actions `inbox-scheduler.yml` toutes les 5 min. Inactif tant que `CRON_SECRET` / `ORBIS_APP_URL` ne sont pas posés côté GitHub — branche `chore/ops-readiness`.
3. [x] Erreurs navigateur dans Sentry, sans SDK ni changement de lockfile : relais same-origin `/api/client-errors`, même nettoyage que le serveur — PR #27 ([launch-hardening.md](product/launch-hardening.md) § observabilité).
4. [ ] Formulaires de contact : expéditeurs de confiance (Reply-To client) pour drafter les demandes venues du site. **Bloqué** : décision de Gabriel attendue (tâche Todoist « Trancher 2 décisions issues des tests de la boîte de démo », question 1).
5. [x] Regroupement des questions assisté par modèle : opt-in `ORBIS_BRAIN_QUESTION_GROUPING`, questions **ouvertes** seulement, repli lexical sur toute erreur — PR #38 ([company-brain.md](product/company-brain.md#model-assisted-question-grouping-opt-in-orbis_brain_question_groupingtrue)).
6. [ ] Pages `/for` : MAJ copie quand la lecture de boîte sera en prod.
7. [x] Tests E2E navigateur du parcours `/start` : Playwright, 4 tests sur la pile locale (description → lien magique Mailpit → Gmail démo vérifié serveur → blocage honnête sans modèle ; refus Outlook ; lien magique dans un autre navigateur ; visiteur déconnecté) — PR #39 ([e2e-start.md](product/e2e-start.md)).
8. [x] Niveau 9 autonomie progressive : spec uniquement — [level-9-autonomy.md](product/level-9-autonomy.md) (envoi en un tap `supervised`, puis auto-envoi opt-in par catégorie `scoped_autonomy`, chemin broker séparé `mailbox-send-v1`, ADR 007 proposé). **Aucun code** avant les préalables du § 9 — PR #40.

## Découvert en route

- [ ] Digest : transport e-mail réel (fournisseur UE, domaine d'envoi, SPF/DKIM, sous-traitant ajouté). Bloqué par décision Gabriel (fournisseur + accord pour qu'Orbis envoie ce mail de notification au client lui-même ; jamais depuis sa boîte).
- [ ] Sentry : piles navigateur minifiées (pas d'upload de source maps). À traiter seulement si les erreurs réelles sont illisibles ; demanderait `SENTRY_AUTH_TOKEN` au build.
- [x] Doc 18 commité (branche `chore/ops-readiness`).
- [x] Pile locale type prod : 13 migrations appliquées sur Postgres 17, RLS inter-tenant vérifiée (`check-platform --database` PASS), compte créé par lien magique (03/10).
- [ ] Mail de connexion Supabase en anglais par défaut : template FR dans `supabase/templates/`, à coller dans le projet Supabase prod + SMTP sur le domaine Orbis.
- [x] Profil `/start` sans IA : rate la zone « de Lille à Tournai » (#32, mergée via #34).

- [ ] 4 commits de `fix/start-ai-fallback-reason` poussés après le merge de #36 (IA muette en prod sur Claude 5, fonctions à Dublin) : jamais arrivés sur main → PR #37 (04/10), à merger par Gabriel (toujours ouverte le 08/10).
- [ ] Regroupement des questions : mesurer la qualité sur de vraies questions avant d'activer le flag en prod.
- [x] Aperçu `/start` par description : « Orbi ne trouve pas la réponse sur votre site » affiché sans site → « dans votre description » (trouvé par l'E2E, PR #39).
- [ ] E2E en CI : workflow GitHub Actions qui monte la pile locale (Supabase CLI, images Docker Hub) et lance `pnpm test:e2e`. Note : depuis le sandbox cloud, les images Supabase sur ECR sont bloquées ; `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io pnpm local:up` passe.
- [ ] Niveau 9 : 5 décisions de Gabriel (seuils d'éligibilité, délai d'annulation, plafond quotidien, plan concerné, signature) — spec § 10. Pas urgent : rien ne sera codé avant la prod des niveaux 2/5/8.
- [x] Garde des brouillons : date/heure absente des sources → `[[À CONFIRMER : date]]` + question, hors brouillons de RDV (déjà contrôlés par les créneaux) — PR #41 (07/10, [inbox-drafts.md](product/inbox-drafts.md)).
- [x] Garde des brouillons : délais inventés (« sous 48h », « en 3 jours ») → `[[À CONFIRMER : délai]]` ; promesses vagues (« rapidement ») signalées au relecteur sans réécriture — PR #42 (08/10, [inbox-drafts.md](product/inbox-drafts.md)).
- [ ] Garde des brouillons : engagements verbaux (« nous nous en occupons », « c'est noté, nous passerons ») et délais hors motifs (« avant la fin du mois ») non détectés. Préalable de l'auto-envoi (niveau 9) ; demanderait un contrôle assisté par modèle.
- [ ] E2E : étape 4 avec un modèle factice local (brouillons visibles dans `/dev/demo-mailbox`), sans appel payant. Demande un faux fournisseur refusé en production, comme la boîte de démo.

## Décisions de Gabriel

_(reportées ici depuis les commentaires Todoist)_

- Aucune pour l'instant.
