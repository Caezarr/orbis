# Orbis — des équipes opérationnelles, pas des générateurs de brouillons

## Le produit que l’on vend

Une responsabilité prise en charge, avec un périmètre explicite et un résultat vérifiable. « Mes arrivées sont préparées » ou « J’ai trois contenus originaux validés cette semaine », pas « 12 agents ont exécuté 80 étapes ».

Le catalogue distingue désormais **systèmes métier** et **missions ponctuelles**. Les 100 contrats documentaires existants restent utiles, mais ne constituent pas 100 automatisations opérationnelles. Deux systèmes servent de références : gestion locative et studio de contenu. Leurs définitions versionnables se trouvent dans `src/lib/workflows/blueprints.ts` et sont visibles dans Marketplace.

## 1. Équipe de gestion locative

### Promesse et périmètre

Un portefeuille, des règles par logement, un suivi de chaque séjour. Hostaway est la source de vérité lorsqu’il est déjà utilisé : Orbis ne crée pas une deuxième synchronisation concurrente avec Airbnb et Booking. Les possibilités exactes de chaque canal doivent être validées sur le compte du client.

On commence par les arrivées, messages et turnovers. Les changements de prix, annulations, remboursements et dépenses ne deviennent pas autonomes par défaut.

### Ce que l’entretien doit découvrir

- Propriétés et sous-unités sélectionnées, fuseaux horaires, capacités et prochain séjour.
- Qui répond aujourd’hui, volume et typologie des messages, pics saisonniers.
- Guides fiables, dates de validité, particularités de chaque logement ; accès sécurisé aux codes, jamais dans un prompt général.
- Prestataires de ménage, délais de confirmation, backup, preuve attendue et procédure d’incident.
- Horaires, SLA, urgences, langues et cas nécessitant le propriétaire.
- Les chiffres de départ : temps passé, erreurs, interventions, retards. Pas de ROI inventé.

### Boucle opérationnelle

1. Réception d’un événement authentifié → inbox durable → accusé de réception après écriture.
2. Déduplication puis relecture de la réservation actuelle, car les événements peuvent arriver dans le désordre.
3. Vérification du logement autorisé et de la version du guide ; une donnée manquante crée une demande, pas une invention.
4. Création ou mise à jour des tâches logiques du séjour : préparation d’arrivée, turnover, informations manquantes.
5. Préparation d’un message sourcé ; contrôle des faits, de la langue et des règles du propriétaire.
6. Gate par action : brouillon, approbation exacte du payload, ou délégation déjà autorisée.
7. Envoi via l’adaptateur autorisé → conservation du reçu externe → rapprochement du résultat.
8. Vérification du ménage et de l’arrivée suivante ; alerte au backup si la confirmation manque.
9. Récapitulatif avec trois colonnes : fait avec preuve / en cours avec échéance / décision attendue avec conséquence.

Une modification de séjour doit **mettre à jour** le même travail logique. Une annulation de réservation annule les tâches programmées non exécutées ; elle ne déclenche pas une annulation commerciale supplémentaire. Une réponse tardive après annulation doit être bloquée au moment de l’envoi par une nouvelle vérification d’état.

### Cas adverses obligatoires

Événement dupliqué ; événement antérieur reçu après une mise à jour ; réservation annulée pendant la préparation ; deux logements portant le même nom ; changement d’heure ; arrivée anticipée ; cleaner absent ; demande de remboursement ; fuite d’eau ; message contenant une instruction hostile ; token expiré ; timeout après envoi sans reçu.

Pour une écriture au résultat ambigu : réconcilier avec le système distant avant toute nouvelle tentative. Ne jamais traiter un timeout comme une preuve d’échec.

## 2. Studio de contenu du créateur

### Promesse

Produire du contenu qui porte une idée propre au créateur, documentée, adaptée au canal et approuvée. Un profil public seul permet une première hypothèse de brief, pas une connaissance fiable de son expertise ou une autorisation d’exploiter son image.

### Onboarding

Demander le profil, l’objectif commercial ou éditorial, l’audience, trois exemples aimés et deux rejetés, les sources originales, les thèmes interdits, les droits et la cadence. Faire valider un brief court : voix, positions, preuves disponibles, public et limites.

### Chaîne de qualité

1. **Matière première** : interview, note vocale, expérience, démonstration ou donnée propriétaire autorisée.
2. **Angles** : proposer des idées distinctes, expliquer à qui elles servent et quelles preuves les soutiennent.
3. **Script** : une promesse claire, un exemple concret, des affirmations traçables, une structure adaptée au format.
4. **Contre-lecture indépendante** : faits, utilité, originalité, voix, droits et similarité aux publications antérieures. Les scores automatiques ne remplacent pas le jugement du créateur.
5. **Validation du script** : l’approbation porte sur une version précise, pas sur tous les contenus futurs.
6. **Production média** : modèle explicite, devis de coût, réservation du budget, requête persistée, suivi asynchrone. Pas de relance payante aveugle après timeout.
7. **Packaging** : sous-titres, texte alternatif, miniature, légende et variantes par canal.
8. **Publication** : prévisualisation exacte, compte de destination, droits vérifiés, horaire/fuseau ; reçu et URL publique requis pour l’état « publié ».
9. **Apprentissage** : métriques à fenêtres comparables, retours humains et expérience éditoriale suivante. Les vues seules ne sont pas un objectif de qualité.

Higgsfield est un moteur média possible, pas le cerveau éditorial. Ses requêtes sont asynchrones. Les sorties doivent être archivées dans un stockage contrôlé ; la documentation annonce une disponibilité minimale de sept jours, pas une conservation permanente.

### Mémoire utile

Séparer faits sourcés, préférences approuvées et hypothèses de performance. Chaque entrée a propriétaire, périmètre, preuve, version, date et possibilité de suppression. Les corrections du créateur peuvent proposer une règle ; elles ne réécrivent pas automatiquement toute sa voix. Ne pas confondre un post performant avec une causalité prouvée.

## 3. Infrastructure commune indispensable

### Modèle durable cible

`workflow_definition/version` → `deployment` → `event_inbox` → `run` → `step_attempt` → `approval` → `outbox_action` → `external_receipt`.

Chaque ligne porte tenant/workspace. Les clés d’idempotence portent sur l’effet métier (réservation + tâche, contenu + version + destination), pas seulement sur l’événement reçu. Les versions et payloads approuvés sont immuables. Les modifications de règles invalident les approbations concernées.

Un worker durable gère reprises, échéances, concurrence par compte, backoff avec jitter, quotas, dead-letter queue et réconciliation. Le stockage JSON local actuel n’est pas ce worker et ne doit pas être présenté comme une exécution SaaS distribuée.

### Trois niveaux d’autonomie

- Observer : lire, proposer, comparer avec ce que l’humain aurait fait.
- Assister : produire les actions et attendre les validations nécessaires.
- Déléguer : uniquement les classes d’action explicitement autorisées, dans un périmètre, budget et horaire approuvés.

Une connexion OAuth ne donne pas carte blanche à l’agent. L’autorisation d’accéder à un outil, celle de lire un dossier et celle d’envoyer/publier/payer restent distinctes.

### Coûts et distribution

Abonnement de plateforme + unités métier incluses + dépassement plafonné et visible. Pour la location : logement actif et séjours traités. Pour le contenu : packs acceptés, génération média mesurée séparément. Les frais des fournisseurs ne doivent jamais être promis illimités. Vérifier les marges avec des traces réelles avant de fixer les tarifs.

Un intégrateur déploie une définition versionnée dans plusieurs workspaces isolés. Il ne copie ni secrets, ni mémoire, ni conversations entre clients. Toute montée en autonomie reste approuvée par le responsable du client.

## 4. État exact du code

| Élément | Présent | Encore nécessaire avant service autonome |
|---|---|---|
| UI | Chat guidé, Today, catalogue, connaissance, analytics, settings | Chat métier connecté au raisonnement et à l’orchestrateur |
| Workflows | Deux définitions complètes, brief persistant, règles exécutables testées | Déploiement durable, réception d’événements et dispatch |
| Location | Aperçu Hostaway réel en lecture seule, portefeuille explicitement autorisé, règles de routage | Sync complète, webhooks authentifiés, tâches/messagerie avec reçus |
| Contenu | Gate de préparation : approbation, sources autorisées, droits déclarés, limites de budget | Revue sémantique, génération média, stockage, publication et analytics de canaux |
| Composio | SDK, configuration serveur, OAuth Link, vérification distante du compte, whitelist d’outils | Auth SaaS/OIDC et rôles effectifs avant ouverture au public ; dispatch d’actions contrôlé |
| Tests | Cas métier adverses et tests mockés des adaptateurs | Essais sur comptes de test puis pilote accompagné |

Le brief sauvegardé n’active aucun background job. Le gate contenu vérifie les champs structurés ; il ne prouve pas à lui seul la véracité du script, les droits réels ou la validité d’un devis. Le planner locatif ne marque aucune tâche comme exécutée.

## 5. Activation Composio

1. Créer un projet et une auth configuration par outil, scopes minimaux. Vérifier les exigences OAuth propres au fournisseur pour la production.
2. Renseigner les variables serveur de `.env.example` ; aucune clé `NEXT_PUBLIC_`.
3. Dans Integrations, connecter le compte puis vérifier son statut. Le callback seul ne prouve jamais une connexion.
4. Les identifiants utilisateur sont dérivés côté serveur du tenant/workspace. Ne jamais accepter un `userId` envoyé par le navigateur.
5. Les routes de mutation restent locales tant qu’il n’y a pas d’identité authentifiée. Ne pas retirer cette garde pour déployer.
6. Découvrir les outils et schemas du compte réel, épingler les versions et permettre une liste de slugs déterminée. Aucun endpoint public « execute arbitrary tool ».

## 6. Critères du premier pilote

Choisir un propriétaire avec quelques logements ou un créateur avec une cadence connue. Établir les métriques de départ. Rejouer les événements historiques anonymisés, puis fonctionner en mode observation. Passer en assistance après absence de mauvaise attribution, absence d’action dupliquée et capacité à reprendre après coupure. Déléguer seulement une classe d’action faible risque validée, avec arrêt immédiat et journal exploitable.

Le premier test de valeur : le client revient-il chaque matin pour **décider moins**, tout en sachant précisément ce qui a été fait ?

## Sources vérifiées

- [Composio : authentification des outils](https://docs.composio.dev/docs/tools-direct/authenticating-tools) — auth configs, compte ACTIVE, réauthentification ; SDK installé `@composio/core` 0.18.1 et types inspectés.
- [Hostaway Public API](https://api.hostaway.com/documentation) — client credentials, réservations, conversations, tâches, événements hors ordre, rate limits. Adapter le throttling aux headers reçus.
- [Higgsfield API](https://docs.higgsfield.ai/docs) — authentification serveur, cycle asynchrone et rétention des sorties.

Vérification documentaire : 10 septembre 2026. Aucune connexion ni génération payante n’a été lancée pendant cette préparation.
