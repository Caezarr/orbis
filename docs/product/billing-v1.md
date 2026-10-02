# Facturation V1 — essai gratuit, abonnement simple, quotas de brouillons

Octobre 2026. Phase 3 de [17-v1-self-serve](../strategy/17-v1-self-serve.md). Cible : entreprises de moins de 50 personnes, en self-serve, modèle d'IA fourni par Orbis.

**Statut :** code et migration prêts, **mode test Stripe uniquement**. Aucun prix n'est décidé : l'interface lit le prix affiché dans Stripe. Sans prix configuré, elle affiche « Tarif bientôt disponible » et désactive le paiement.

## Formules

Source unique : [`src/lib/billing/plans.ts`](../../src/lib/billing/plans.ts) (`PLAN_CONFIG_VERSION = v1-2026-10`). Les limites sont configurables par variable d'environnement. Valeurs par défaut :

| Formule | Clé | Boîtes mail | Brouillons inclus | Plafond de coût modèle / mois | Prix |
|---|---|---:|---:|---:|---|
| Essai gratuit | `trial` | 1 | 50 sur toute la durée | 8 € estimés | gratuit, 14 jours ou 50 brouillons, **au premier atteint** |
| Essentiel | `solo` | 1 | 300 / mois | 30 € estimés | Stripe Price `STRIPE_PRICE_SOLO_MONTHLY` |
| Équipe | `equipe` | 5 | 1 500 / mois | 150 € estimés | Stripe Price `STRIPE_PRICE_EQUIPE_MONTHLY` |

- **Unité de quota :** un brouillon créé dans la boîte mail (ou simulé en mode test). La classification et les messages écartés ne consomment pas de quota, mais leur coût compte dans le plafond.
- **Pas de facturation à l'unité.** Les brouillons consomment un quota inclus. La facturation par tâche acceptée (`ORBIS_TASK_BILLING_ENABLED`) reste dans le code, mais elle est désactivée et masquée pour la V1 : le registre des tâches n'apparaît que si le flag vaut `true`.
- Le plafond de coût est un garde-fou, pas un prix. Il s'exprime en centimes **estimés** (`ORBIS_INBOX_EST_CENTS_*`). Le plafond global `ORBIS_OPERATIONS_MONTHLY_CAP_CENTS` reste la limite dure et doit être ≥ au plus haut plafond de formule.

Variables : `ORBIS_TRIAL_DAYS`, `ORBIS_TRIAL_DRAFTS`, `ORBIS_TRIAL_CAP_CENTS`, `ORBIS_PLAN_SOLO_DRAFTS`, `ORBIS_PLAN_SOLO_MAILBOXES`, `ORBIS_PLAN_SOLO_CAP_CENTS`, `ORBIS_PLAN_EQUIPE_DRAFTS`, `ORBIS_PLAN_EQUIPE_MAILBOXES`, `ORBIS_PLAN_EQUIPE_CAP_CENTS`. Une valeur invalide revient au défaut.

## Droits d'usage (entitlements)

Logique pure : [`entitlements.ts`](../../src/lib/billing/entitlements.ts). Adaptateur PostgreSQL : [`entitlements-store.ts`](../../src/lib/billing/entitlements-store.ts). Un workspace correspond à un tenant (`workspaces.tenant_id` est unique).

| État | Origine | Traitement |
|---|---|---|
| `trialing` | aucun abonnement payant ; essai non commencé ou en cours | oui, jusqu'à épuisement des brouillons |
| `expired` | essai terminé par la durée (`trial_expired`) ou par les brouillons (`trial_drafts_used`) | non |
| `active` | Stripe `active` / `trialing` | oui ; `quota_reached` bloque jusqu'à la période suivante ou un changement de formule |
| `past_due` | Stripe `past_due` / `unpaid`, ou statut inconnu (fermeture par défaut) | non |
| `canceled` | Stripe `canceled` / `incomplete_expired` / `paused` | non ; plafond ramené à 0 |

- **Début de l'essai : premier passage sur une boîte mail**, c'est-à-dire le premier `POST /api/v1/inbox` accepté, et non la création du compte. Une entreprise qui n'a pas encore connecté sa boîte ne consomme pas son essai. La ligne `billing_trials` est en insertion seule : le runtime ne peut ni la prolonger ni la relancer. Elle fige les limites en vigueur au démarrage.
- **Passage à une formule payante pendant l'essai :** l'abonnement remplace immédiatement l'essai. Le quota est compté sur la période Stripe, donc les brouillons de l'essai ne sont pas décomptés.
- **Changement de période :** la période vient de `current_period_start/end`, synchronisés par le webhook. Si le renouvellement arrive en retard, la période avance d'un mois pour que le quota se réinitialise à l'heure prévue.
- Un checkout `incomplete` laisse l'essai en place.
- `ORBIS_ENTITLEMENTS_ENFORCED=false` désactive les contrôles, pour un pilote interne sans Stripe uniquement. Ne jamais l'utiliser en self-serve.

### Points de contrôle

1. `POST /api/v1/inbox` (`enqueueFirstRun`) :
   - formule bloquée → **402** avec un message explicite en français, aucun lot créé ;
   - limite de boîtes mail de la formule, sur 31 jours ;
   - `max_drafts` du lot plafonné aux brouillons restants ;
   - démarrage de l'essai dans la même transaction.
   - Un rejeu idempotent d'un lot existant reste servi, en lecture seule.
2. Dispatcher (`enqueueDueIncremental`, option `allow`) : pas de nouveau lot continu sans formule active ni brouillons restants. Le prochain passage est reprogrammé pour éviter une boucle serrée. `continuous_enabled` n'est **pas** désactivé : les brouillons continus reprennent seuls après un changement de formule, un paiement ou une nouvelle période. L'interface affiche « en pause ».
3. Worker (`runOneInboxBatch`) : le contrôle a lieu **avant tout appel à la boîte mail ou au modèle**. Formule bloquée → lot `plan_inactive` (ou `quota_reached`). Sinon, le pipeline reçoit `draftQuota` et s'arrête **avant le message suivant** quand le quota est atteint. Le lot passe en `quota_reached`, les résultats partiels sont conservés et le curseur n'avance pas : les messages restants seront relus plus tard.
4. Les brouillons passés restent consultables dans tous les états (GET /api/v1/inbox, Today).

## Plafonds par workspace (synchronisation privilégiée)

La migration 008 interdit au rôle runtime d'écrire `monthly_cap_cents`. La fonction 008 `orbis_set_workspace_inbox_cap` est réservée à l'opérateur et accepte n'importe quelle valeur. La migration **010** ajoute une **nouvelle fonction SECURITY DEFINER** `orbis_sync_workspace_plan_cap(tenant, plan, cents)` :

- propriétaire : le rôle existant `orbis_inbox_cap_admin` (NOLOGIN, NOBYPASSRLS) ; `search_path` figé ;
- exécutable par le rôle runtime (`scripts/migrate.ts`) pour que le webhook signé et le démarrage de l'essai appliquent le plafond de formule ;
- **borne toute valeur** au plafond de `billing_plan_caps`, une table de l'opérateur que le runtime ne peut ni lire ni écrire. Plafonds par défaut : trial 15 €, solo 50 €, equipe 250 €, none 0 ;
- exige, pour `solo` et `equipe`, un abonnement synchronisé de cette formule (`active`/`trialing`/`past_due`/`unpaid`). Cette vérification ajoute une défense en profondeur sans constituer une frontière de sécurité, car le runtime écrit `stripe_subscriptions`.

Conséquence : un rôle runtime compromis ne peut jamais dépasser le plus haut plafond fixé par l'opérateur. Pour relever un plafond, relever d'abord `billing_plan_caps` en tant que propriétaire des migrations, puis la variable `ORBIS_*_CAP_CENTS`. Une valeur posée manuellement par l'opérateur (fonction 008) est **remplacée** à la synchronisation suivante de la formule.

Webhook : `active`/`trialing`/`past_due`/`unpaid` → plafond de la formule ; `canceled`/`incomplete_expired`/`paused` → `none`, 0 ; `incomplete` → inchangé. La synchronisation a lieu dans la même transaction que la mise à jour de l'abonnement : en cas d'échec, l'événement est annulé et Stripe le renvoie.

## Stripe (mode test)

Prix : l'interface affiche `unit_amount`/`currency`/`tax_behavior` de l'objet Price, mis en cache 10 minutes. Le Checkout utilise ce même Price. Aucun montant n'est codé en dur. Un Price est utilisable s'il est actif, mensuel (`interval_count = 1`), `licensed` et a un montant. Sinon : « Tarif bientôt disponible », bouton désactivé, et `/api/v1/billing/checkout` répond 503.

Variables :

```text
STRIPE_SECRET_KEY                 # clé test restreinte (sk_test_ / rk_test_)
STRIPE_WEBHOOK_SECRET
ORBIS_APP_URL
STRIPE_PRICE_SOLO_MONTHLY         # inchangé
STRIPE_PRICE_EQUIPE_MONTHLY       # nouveau ; à défaut STRIPE_PRICE_BUSINESS_BASE_MONTHLY est utilisé
```

**Migration des anciennes formules :** la migration 010 renomme les valeurs stockées `Solo` → `solo` et `Business` → `equipe`. `STRIPE_PRICE_BUSINESS_EXTRA_SEAT_MONTHLY` n'est plus utilisée : la formule Équipe est un prix forfaitaire de quantité 1, sans option de siège. Un abonnement qui contient d'autres lignes est refusé par le webhook (503, puis réessai par Stripe) et doit être réconcilié dans Stripe.

Étapes en mode test :

1. Créer deux produits, « Orbis Essentiel » et « Orbis Équipe », avec chacun un prix récurrent mensuel (`licensed`). Choisir `tax_behavior` (exclusive = « HT »).
2. Renseigner les ID de prix dans les variables ci-dessus, avec la clé test et `ORBIS_APP_URL`.
3. Webhook vers `/api/v1/billing/webhook`, événements : `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Ajouter les événements `checkout.session.async_payment_*` uniquement si la facturation par tâche est un jour réactivée. Les échecs de paiement passent par `customer.subscription.updated` (`past_due`) : `invoice.payment_failed` n'est pas nécessaire.
4. Customer Portal : activer la résiliation (fin de période), la mise à jour du moyen de paiement et les factures. Le changement de formule peut passer par le portail, à condition de n'y proposer que les deux prix V1.
5. Appliquer les migrations (`node --import tsx scripts/migrate.ts` avec `DATABASE_APP_ROLE`), puis lancer `scripts/check-platform.ts --database`.
6. Tester avec Stripe CLI et les cartes de test : abonnement pendant l'essai, renouvellement (test clock), échec de paiement (`4000 0000 0000 0341`) → `past_due` → régularisation, résiliation via le portail, événement rejoué, événements dans le désordre.

Garanties conservées : signature vérifiée sur le corps brut ; déduplication par `stripe_events` dans la transaction ; état **actuel** relu chez Stripe, sans se fier à l'ordre des événements ; verrou par client ; une ancienne résiliation ne remplace pas un abonnement plus récent. Le retour navigateur (`/billing?checkout=success`) **n'active rien** : seul le webhook le fait.

**TVA :** `automatic_tax` reste désactivé (politique inchangée). Il faut d'abord faire valider les obligations et les immatriculations. L'activer seul ne suffit pas à collecter correctement la taxe.

## Interface (français)

- `/billing` (« Abonnement », également dans Réglages → Billing) : état de la formule, jauge de brouillons, comparaison Essai / Essentiel / Équipe (fonctionnalités, brouillons inclus, prix Stripe), Checkout pour le propriétaire ou un administrateur, lien vers le portail (« Gérer l'abonnement, les factures ou résilier »). `/pricing` redirige vers `/billing`.
- Bandeau dans Today et dans les résultats de `/start` : « Essai : X jours / Y brouillons restants », « Quota atteint… », « Paiement en attente », « Essai terminé », plus la mention « brouillons en continu en pause ». Rien ne s'affiche pour une formule payante qui garde de la marge.
- Pas de dark pattern : résiliation libre dans le portail, aucun faux compte à rebours. Un état bloqué indique toujours que les brouillons passés restent consultables.

## Décisions à prendre (propriétaire)

1. **Prix** de l'Essentiel et de l'Équipe (hypothèse du plan : 49–79 €/mois pour l'Essentiel), HT ou TTC. À créer dans Stripe : le code n'a rien à changer.
2. **N brouillons de l'essai** (défaut 50) et **durée** (défaut 14 jours), après mesure du coût réel par brouillon.
3. **Brouillons inclus** : Essentiel 300, Équipe 1 500 par défaut. **Boîtes mail** de l'Équipe : 5 par défaut.
4. **Plafonds de coût** par formule (variables d'environnement), plafonds de sécurité (`billing_plan_caps`) et plafond global.
5. **`past_due` :** le traitement est bloqué immédiatement par défaut. Faut-il un délai de grâce, par exemple pendant les relances Stripe ?
6. Faut-il un **dépassement payant** (achat de brouillons) ou s'en tenir au blocage puis au passage à la formule supérieure (comportement actuel) ?
7. TVA / `automatic_tax`, CGV et conditions de remboursement avant le passage en mode live.

## Vérification

Tests unitaires : machine d'états, changement de période, quotas dans le pipeline, le worker, le dispatcher et l'API, synchronisation des plafonds, webhook rejoué ou dans le désordre, rendu sans prix. Stripe est entièrement simulé (aucun appel live). Base réelle : migrations 001–008 + 010 appliquées sur PostgreSQL 16 avec un rôle de migration non superutilisateur, sans 009. `check-platform --database` vérifie l'isolation de `billing_trials`, l'absence de droits du runtime sur `billing_plan_caps`, la fonction de synchronisation (propriétaire, SECURITY DEFINER, `search_path`, limitation au plafond, refus d'une formule payante sans abonnement) et le nouveau statut de lot.
