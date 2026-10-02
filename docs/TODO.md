# Orbis — backlog code

Tenu par la routine du matin (Claude). Une tâche par jour, dans l'ordre, sauf PR de la pile cassée ou défaut critique trouvé en revue. Les actions de Gabriel sont dans Todoist (projet « Orbis »), pas ici.

## Backlog

1. [x] Digest email quotidien : opt-in, contenu sans donnée sensible, passage via broker. Livraison **simulée** (aucun transport e-mail construit) — PR #26 ([daily-digest.md](product/daily-digest.md)).
2. [ ] `vercel.json` avec crons inbox (`*/5`), retention (quotidien) et digest (quotidien). Bloqué en partie : `*/5` exige Vercel Pro ou un planificateur externe (décision Gabriel).
3. [ ] Erreurs navigateur dans Sentry (sans changer le lockfile si possible).
4. [ ] Formulaires de contact : expéditeurs de confiance (Reply-To client) pour drafter les demandes venues du site.
5. [ ] Regroupement des questions assisté par modèle.
6. [ ] Pages `/for` : MAJ copie quand la lecture de boîte sera en prod.
7. [ ] Tests E2E navigateur du parcours `/start` (quand Supabase + Composio de test dispo).
8. [ ] Niveau 9 autonomie progressive : spec uniquement.

## Découvert en route

- [ ] Digest : transport e-mail réel (fournisseur UE, domaine d'envoi, SPF/DKIM, sous-traitant ajouté). Bloqué par décision Gabriel (fournisseur + accord pour qu'Orbis envoie ce mail de notification au client lui-même ; jamais depuis sa boîte).
- [ ] Doc 18 (`docs/strategy/18-orbi-inbox-concept.md`) n'existe sur aucune branche au 02/10 ; la routine s'appuie sur le doc 17 et `docs/product/`.

## Décisions de Gabriel

_(reportées ici depuis les commentaires Todoist)_

- Aucune pour l'instant.
