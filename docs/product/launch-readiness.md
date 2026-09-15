# Orbis — état de livraison et préparation commerciale

État vérifié le 14 septembre 2026. Ce document distingue le code livré, les comptes à configurer et le développement encore nécessaire. Un catalogue de connecteurs ne signifie pas que chaque action a été validée avec un compte réel.

## Livré dans cette tranche

- Dix verticales : locations, création de contenu, e-commerce, vente B2B, support, recrutement, agences, finance opérationnelle, services professionnels et interventions terrain. Parcours visuels, tâches bornées, exigences de preuve, questions de configuration et outils alternatifs.
- Catalogue de 68 outils ; comptes Composio vérifiés côté serveur et configurations distinctes. Les scopes non vérifiés restent indiqués comme tels.
- Ask Orbi : recommandation structurée par modèle, limitée aux workflows existants. Analyse du site public ou du descriptif avec citations exactes et confirmation du profil par l’utilisateur. Aucun résultat ou ROI inventé.
- Knowledge : recherche BM25 après filtrage des permissions, citations versionnées et primitives de mémoire approuvée/expirable. La synchronisation continue de toutes les sources n’est pas incluse.
- Auth Supabase SSR ; memberships PostgreSQL ; snapshots de workspace transactionnels ; tenant issu de la session ; mode démo explicitement local, jamais utilisé en production.
- Today / Analytics : activité réelle, récapitulatif, grille de contributions et classement privé opt-in, sans gain de temps fictif.
- Prix par tâche : devis versionnés, réservation, règlement/libération/remboursement et déduplication dans le domaine de facturation. Aucun prix client exprimé en tokens.
- Stripe : checkout d’abonnement, portail, validation des tarifs configurés, contrôle owner/admin, idempotence, signature webhook, synchronisation à partir de l’état actuel Stripe. Le retour navigateur ne valide pas un paiement.
- Tâches durables de **préparation documentaire en lecture seule** : file PostgreSQL, lease, trois tentatives maximum après interruption, revue indépendante des preuves, approbation liée au résultat/prix, reçu d’acceptation unique et plafond mensuel. Les appels modèle sont hors transaction.

## À faire manuellement — comptes, accès et décisions

### 1. Auth et stockage

Créer/configurer le projet Supabase et une base PostgreSQL accessible au serveur. Définir dans le gestionnaire de secrets :

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
DATABASE_URL
MIGRATION_DATABASE_URL
DATABASE_APP_ROLE
APP_ORIGIN
ORBIS_APP_URL
```

`APP_ORIGIN` et `ORBIS_APP_URL` sont la même origine HTTPS publique. Autoriser `/api/auth/callback` dans Supabase et configurer l’expéditeur d’email. Ne pas mettre une clé de service Supabase dans le navigateur.

Le rôle runtime PostgreSQL doit être non-superuser, sans BYPASSRLS. Le rôle de migration est distinct. Après configuration locale sécurisée des variables :

```sh
node --import tsx scripts/migrate.ts
node --import tsx scripts/check-platform.ts --database
```

Le test `--database` vérifie des accès croisés et annule les données de test. Il n’a pas été exécuté ici faute de base de test configurée. Ne pas activer la production avant son succès. Configurer sauvegardes, restauration testée et supervision.

### 2. Modèle

Définir `ORBIS_AI_PROVIDER`, `ORBIS_AI_MODEL` et la clé serveur du fournisseur choisi. Fixer ses limites de dépense. Exécuter de vraies évaluations sur les documents de chaque verticale avec consentement du client. Les tests locaux ne prouvent pas la qualité des réponses d’un modèle réel.

### 3. Connexions métier

Configurer `COMPOSIO_API_KEY` et une auth config pour chaque outil choisi. Vérifier le toolkit, le retour OAuth, les droits minimum et la révocation avec des comptes de test. Les clés et comptes clients ne sont jamais fournis au modèle.

Ne pas présenter les 68 outils comme 68 connecteurs certifiés. Tester pour chaque workflow les actions exactes, les limites du fournisseur et les champs renvoyés. Hostaway/Higgsfield demandent leurs accès dédiés ; le chemin Hostaway global reste bloqué en production tant que ses identifiants ne sont pas isolés par tenant.

### 4. Stripe

Valider les prix, inclusions, limites et conditions de remboursement. Les barèmes dans `src/lib/billing/rates.ts` sont des propositions. Configurer d’abord **le mode test**, un produit Solo et un produit Business, puis leurs prix mensuels et le prix de siège supplémentaire. Les montants configurés doivent correspondre au barème affiché.

```text
STRIPE_SECRET_KEY                 # clé restreinte recommandée
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_SOLO_MONTHLY
STRIPE_PRICE_BUSINESS_BASE_MONTHLY
STRIPE_PRICE_BUSINESS_EXTRA_SEAT_MONTHLY
```

Utiliser des variables sensibles Vercel ou un coffre de secrets. Vérifier à quel compte et environnement correspondent les IDs de prix déjà présents dans `.env.example` ; ne pas supposer qu’ils conviennent à un autre compte.

Enregistrer `/api/v1/billing/webhook` pour `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Configurer le Customer Portal. Tester renouvellement, changement de sièges, annulation, signature invalide, doublon et événements hors ordre avant passage en live.

**TVA/taxes :** faire valider les obligations applicables et les immatriculations actives. `automatic_tax` n’est volontairement pas activé ; l’activer seul, sans immatriculation, ne suffit pas à collecter la taxe.

### 5. Worker pilote

Après validation de la base et du fournisseur :

```text
ORBIS_OPERATIONS_ENABLED=true
ORBIS_OPERATIONS_MONTHLY_CAP_CENTS=<plafond validé>
ORBIS_WORKER_USER_ID=<membre réel autorisé>
ORBIS_WORKER_WORKSPACE_ID=<workspace correspondant>
ORBIS_WORKER_TENANT_ID=<tenant correspondant>
```

```sh
node --import tsx scripts/operations-worker.ts
```

Une invocation traite au maximum une tâche ; un superviseur doit rappeler ce worker et surveiller les files/échecs. Le pilote est configuré pour un workspace, pas un ordonnanceur multi-tenant de production. Il ne fait ni envoi, ni publication, ni paiement. Un reçu `operational_acceptances` n’est **pas** une charge Stripe.

### 6. Préparation des ventes

Fournir comptes pilotes, cas réels et critères d’acceptation par métier. Choisir les engagements commerciaux, SLA/support, budget de génération média, politique de conservation et sous-traitants. Valider contrats, confidentialité et traitement des données avec les personnes compétentes. Ce sont des décisions et des accès que le code ne peut pas prendre à votre place.

## Développement restant — ce n’est pas du travail manuel à déléguer au client

- Relier les reçus de tâches acceptées au registre financier durable, aux tâches incluses et à la collecte d’usage Stripe/Metronome. Ne pas facturer deux fois abonnement et unités incluses. Pour une nouvelle facturation d’usage, la recommandation Stripe est Metronome ; le modèle d’événement doit rester « résultat métier accepté », pas « tokens consommés ».
- Relier le broker d’actions à une approbation authentifiée et à un registre durable d’idempotence avant d’activer les écritures externes. Les quatre actions préparées ne constituent pas dix automatisations complètes en production.
- Orchestration multi-tenant continue, triggers fournisseurs signés, reprises sûres, budgets par client, annulations et gestion des statuts externes incertains.
- Invitations et administration réelle des droits/groups, désactivation immédiate des membres, journal d’accès et séparation du rôle de facturation webhook.
- Synchronisation incrémentale des sources, ACL distantes, suppressions propagées, rétention, suppression/export tenant, évaluation continue et alertes.
- Valider les tâches métier de chaque verticale de bout en bout sur les outils choisis. Les parcours et contrats sont construits ; la certification opérationnelle nécessite des exécutions réelles.

## Vérification de cette tranche

236 tests unitaires passent ; typage, build webpack et contrôles locaux d’isolation passent. Aucun achat réel ni appel payé au modèle nécessaire aux tests. Catalogue vérifié par l’agent. Après redémarrage du serveur de développement bloqué, Billing charge correctement et ne déborde pas à 390 px ; le checkout reste indisponible en mode hors ligne. Un timeout/retry protège également son chargement. Aucun test live Supabase/PostgreSQL/Stripe/Composio déclaré comme réussi.
