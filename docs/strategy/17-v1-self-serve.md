# Orbis V1 — self-serve public

Version 1 — 2 octobre 2026. Remplace la stratégie horizontale « 100 missions / 10 verticales » comme priorité d'exécution. Les docs 01–16 restent la vision long terme.

## Décisions verrouillées (Gabriel, 01/10/2026)

| Sujet | Décision |
|---|---|
| Statut | Projet perso, séparé de Wonka/WonkaChat |
| Cible | Toute entreprise, idéalement < 50 employés, dirigeant non technique |
| « Produit fini » | Self-serve public ouvert : inscription depuis la landing, paiement, valeur sans humain |
| Prix | Essai gratuit + abonnement simple, modèle IA fourni par Orbis (pas de BYOK à l'onboarding) |
| Bande passante | Full time |
| Landing | Approuvée, ne change pas (seuls les CTA pointent vers le nouveau parcours) |
| Infra existante | Vercel, Stripe, clé OpenAI/Anthropic dédiée. À créer : Supabase/Postgres, Composio |

## Diagnostic au 01/10

- Landing livrée 09/09. Dernier commit produit 16/09. 14 PR, ~24k lignes.
- Socle codé mais **jamais exécuté en réel** : aucun environnement configuré (Supabase, Composio, Stripe live, modèle), aucun test inter-tenant sur une vraie base, aucun utilisateur.
- Périmètre dilaté : 100 contrats, 10 verticales, 68 outils, mode partenaire, facturation média. Le runtime n'exécute que 4 missions en brouillon.
- Parcours actuel : audit 4 étapes → plan → setup → connexion → import → test → approbation. Incompatible avec « valeur en 3 minutes ».

## Le wedge : la boîte mail qui se répond (en brouillon)

Universel pour une petite entreprise, valeur visible immédiatement, pas d'action irréversible.

```text
0 s      URL du site (ou 2 phrases)            → pas de compte requis
~45 s    Profil sourcé + aperçu de ce qu'Orbi fera        [valeur 1 : « il a compris ma boîte »]
~60 s    Création de compte (magic link / Google / Microsoft)
~90 s    Connexion Outlook ou Gmail (lecture + création de brouillons)
~3 min   Tri des demandes entrantes des 14 derniers jours
         + 3 à 5 réponses sourcées, déposées en BROUILLONS dans la boîte   [valeur 2 : « je n'ai qu'à relire »]
Ensuite  Chaque nouvelle demande → brouillon prêt + digest quotidien. Corrections → règles approuvées.
```

Règles de la mission :

- Jamais d'envoi automatique en V1. Seule écriture externe : créer un brouillon (réversible).
- Sources de réponse : site public, mails envoyés (ton, signature, réponses passées), documents ajoutés explicitement. Pas d'invention de prix, dispo ou engagement : une info manquante devient une question dans le brouillon, surlignée.
- Chaque mail entrant est une **donnée non fiable** (prompt injection) : aucune instruction contenue dans un mail ne modifie politique, outils ou destinataires.
- Classification : demande client / devis / fournisseur / admin / bruit. Seules les demandes actionnables reçoivent un brouillon.

Deuxième mission (après lancement, réutilise le profil) : préparation de rendez-vous via le calendrier.

## Ce qu'on gèle (feature flag, pas suppression)

100 contrats du catalogue (visibles en « bientôt », non installables), 10 verticales, Hostaway, Higgsfield, studio créateur, mode partenaire/export intégrateur, tarification média, facturation à la tâche via Checkout, audit en 4 étapes. Le code reste, l'UI publique ne les expose pas.

## Phases

### Phase 0 — Mise en service (S1)

- Supabase projet région UE ; rôles runtime (non superuser, sans BYPASSRLS) et migration ; `scripts/migrate.ts` puis `check-platform.ts --database` **vert**.
- Composio : vérifier que l'auth managée couvre Gmail (`gmail.readonly` + `gmail.compose`) **sans** audit CASA à notre charge, sinon démarrer Outlook seul (Microsoft : publisher verification) et lancer CASA en parallèle.
- Domaine propre (remplacer `orbis-omega-ashen.vercel.app`), env Vercel preview/prod séparés, Sentry, plafond de dépense chez le fournisseur modèle.
- Légal self-serve : structure qui facture (entité Stripe), CGU/CGV, politique de confidentialité, DPA, liste des sous-traitants (Supabase, OpenAI/Anthropic, Composio, Vercel, Stripe, PostHog), rétention des mails.

Sortie : un compte test complet en prod sur une vraie base, tenant A ne voit rien de B.

### Phase 1 — Golden path (S1–S3)

- Nouveau `/start` : URL → profil sourcé (réutilise le lecteur public + Ask Orbi) → compte → connexion boîte → premier lot de brouillons. Un seul écran progressif, pas de navigation workspace avant la première valeur.
- Adaptateurs mail via Composio derrière `action-broker` : lister, lire, créer brouillon. Idempotence par message ID.
- Mission « Réponses clients » : contrat, classification, génération, critique, citation des sources, questions manquantes.
- Écran résultat : le brouillon d'abord, sources repliées, « Ouvrir dans Outlook/Gmail ».
- Instrumentation : `site_analyzed → account_created → mailbox_connected → first_draft_ready → draft_used`.

Sortie : 10 personnes externes réelles, médiane < 3 min jusqu'au premier brouillon, aucune intervention humaine.

### Phase 2 — Boucle continue (S3–S4)

- Worker multi-tenant (la file Postgres existante + cron Vercel, ou Inngest/Trigger.dev si la reprise l'exige) : nouveaux mails → brouillons, dédup, reprise, plafond par tenant.
- Apprentissage : édition du brouillon envoyé vs proposé → règle proposée → approbation en un clic.
- Digest quotidien par email : brouillons prêts, questions en attente.
- Today = décisions d'abord (brouillons à relire), métriques ensuite.

Sortie : un utilisateur revient la semaine 2 sans relance ; le taux de corrections baisse sur les runs répétés.

### Phase 3 — Monétisation (S4–S5)

- Essai : 14 jours ou N brouillons (à fixer après mesure du coût réel par brouillon).
- Un plan principal (hypothèse 49–79 €/mois, quota de brouillons inclus) + un plan équipe. Réutiliser checkout/portail/webhooks déjà codés ; le ledger de tâches sert de compteur de quota, pas de facture à l'acte.
- Plafond dur de coût modèle par tenant, alertes, comportement explicite en dépassement.
- Stripe live testé : renouvellement, échec de paiement, annulation, webhooks rejoués.

### Phase 4 — Durcissement et lancement (S5–S6)

- Tests inter-tenant sur la vraie base ; red team prompt injection par mail ; révocation de la connexion pendant un run.
- Suppression de compte + export ; purge des copies de mails selon la rétention.
- Bêta fermée 20–30 entreprises → corrections → ouverture publique depuis la landing.

## Définition de « fini » (V1)

- [ ] Inscription publique depuis la landing, sans humain.
- [ ] Médiane < 3 min de l'URL au premier brouillon utile (mesurée, pas promise).
- [ ] Outlook **et** Gmail en production (ou Outlook seul + Gmail en vérification, explicitement affiché).
- [ ] Brouillons continus sur nouveaux mails, digest quotidien.
- [ ] Essai → abonnement Stripe live, plafonds de coût actifs.
- [ ] Isolation tenant testée sur la base réelle ; secrets serveur uniquement ; révocation effective.
- [ ] CGU, confidentialité, DPA, suppression de compte en ligne.
- [ ] Monitoring erreurs + funnel PostHog.

## KPIs

Temps jusqu'au premier brouillon ; % de brouillons utilisés (envoyés avec peu de modifications) ; rétention S2/S4 ; conversion essai → payant ; coût modèle par brouillon utilisé ; tickets support par compte.

## Risques

| Risque | Réponse |
|---|---|
| Audit Google CASA pour les scopes Gmail | Auth managée Composio si couverte ; sinon Outlook d'abord, CASA en parallèle |
| Prompt injection dans les mails | Mail = donnée ; outils limités à « créer brouillon » ; aucune adresse ni action dérivée du contenu |
| Données personnelles (RGPD) | Hébergement UE, rétention courte, DPA, opt-out d'entraînement fournisseur |
| Coût modèle par tenant | Plafonds, classification bon marché avant génération, mesure dès la phase 1 |
| Recouvrement avec Wonka/WonkaChat | Vérifier contrat (non-concurrence, exclusivité, PI) avant lancement public |
| Re-dilatation du périmètre | Rien d'autre que le wedge tant que la définition de « fini » n'est pas cochée |
