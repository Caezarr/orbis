# Connexions et connaissances — contrat de livraison

## Ce qui fonctionne maintenant

La landing lit une page publique HTTPS via le broker, extrait son titre et son texte puis propose leur confirmation dans l’audit. Ce n’est ni un crawl complet ni un fine-tuning du modèle. Les adresses privées/réservées sont refusées à chaque redirection, la résolution DNS est épinglée, la lecture limitée à 1 Mo et 15 secondes.

Une mission peut enregistrer des périmètres SharePoint, Notion et Drive avec type de ressource, URL, inclusion explicite des descendants et instructions. Ces objets restent `awaiting_connection`. Ils ne deviennent jamais automatiquement des sources `ready` et ne sont pas transmis au modèle. Les suggestions d’outils du plan sont indicatives ; aucune disponibilité de connecteur n’est implicite.

## Architecture cible : réutiliser, ne pas doubler

| Responsabilité | Propriétaire proposé | Frontière |
|---|---|---|
| OAuth et synchronisation des connaissances | Nango | Un propriétaire de credentials par connexion ; jetons côté serveur |
| Catalogue d’actions des agents | Composio | Outils sélectionnés par mission, invocation uniquement via broker |
| Permissions, facturation, approbations | Orbis | Décision serveur avant chaque appel, jamais déléguée au modèle |
| Sélection documentaire | Orbis + API du service | Intersection sélection utilisateur × droits du compte × politique mission |

Cette répartition est une décision d’architecture, pas une intégration déjà livrée. La même connexion ne doit pas être gérée simultanément par les deux fournisseurs. Composio propose des Connect Links ; utiliser `connectedAccounts.link`, pas l’ancien `initiate` pour les OAuth gérés. Le callback navigateur n’est pas une preuve : confirmer le compte et son statut auprès du fournisseur côté serveur. Référence consultée : https://docs.composio.dev/docs/tools-direct/authenticating-tools. Point d’entrée Nango : https://nango.dev/docs/getting-started/intro-to-nango. Valider les schémas exacts de sessions et webhooks dans sa documentation avant implémentation.

## Parcours à implémenter pour activer les accès

1. Session authentifiée → tenant serveur → propriétaire et permissions de la mission.
2. Résoudre la capacité demandée et proposer le compte existant avant une nouvelle connexion.
3. Créer une session de connexion courte, liée au tenant, au membre et au nonce serveur. Ne jamais accepter un tenant transmis librement par le navigateur.
4. Vérifier retour et webhook signé ; confirmer identité, statut et scopes via l’API fournisseur.
5. Parcourir les vraies ressources : pagination, recherche, hiérarchie, compte courant visible. Ne pas présenter de faux dossiers. Les URL actuellement enregistrées deviennent des candidats à résoudre en identifiants immuables.
6. Afficher les ressources et descendants accessibles ; demander une confirmation du périmètre. Aucun élargissement silencieux après déplacement d’un dossier.
7. Synchroniser via worker durable avec curseur, reprise et déduplication. Conserver identifiant source, version, ACL, date, hash et citations.
8. Évaluer sur les données sélectionnées. Toute erreur d’accès est un blocage explicite, pas un résultat vide présenté comme réussi.
9. Révocation : bloquer immédiatement l’usage, invalider caches et index, appliquer la politique de rétention aux copies et mémoires dérivées.

## Conditions avant commercialisation

Authentification multi-tenant, base transactionnelle, chiffrement et rotation des secrets, callbacks vérifiés, workers durables, quotas et registre de consommation restent nécessaires. La garde locale actuelle n’est pas une authentification de production. Les coûts gérés doivent être autorisés et réservés avant l’appel, puis rapprochés des factures fournisseur. Ne pas proposer la revente d’Apollo/Clay sans vérifier les droits contractuels.

Tests bloquants : croisement de tenants refusé ; ID de ressource falsifié refusé ; révocation pendant un run ; webhook rejoué ; pagination incomplète ; document supprimé ; changement d’ACL ; timeout fournisseur ; reprise sans double facturation ; approbation invalide après changement de payload. Une connexion verte ne signifie jamais que l’ensemble d’un SharePoint est lisible.
