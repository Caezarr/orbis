# Orbis — parcours entreprise et intégrateur

## Livré dans cette itération

Landing reliée à l’audit et au catalogue ; 100 contrats métier individuels répartis en dix départements ; recherche et filtres ; pages détaillées ; audit guidé en quatre étapes ; dossiers enregistrés ; recommandations explicables ; préférences de fourniture par capacité ; installation idempotente d’une mission documentaire spécialisée ; export JSON pour intégrateur ; accueil fondé sur les missions réellement installées ; suppression de la fausse connexion OAuth ; pricing simulable.

Les nouveaux modules sont dans `src/lib/product` et `src/components/product`. Les contrats alimentent le prompt et l’empreinte du contexte d’exécution, pas seulement les cartes du catalogue. La mémoire existante reste approuvée par l’opérateur et attachée à la mission. Le moteur conserve son évaluation et sa boucle de réparation bornée.

## Parcours

`/` → `/audit` → `/plans?id=…` → sélection du cas et des préférences outils → `/missions/:id/setup` → `/missions/:id/lab` → correction et approbation de mémoire.

Entrée alternative : `/catalog` → `/catalog/:id` → audit préorienté. L’intégrateur utilise le même parcours, avec un dossier nommé par client et un export du plan. Les dossiers ne sont pas des espaces authentifiés indépendants.

## Frontières explicites

- 100 **contrats documentaires préconçus**, pas 100 automatisations externes certifiées ni une étude démontrant qu’ils sont statistiquement les 100 plus importants.
- L’audit est un entretien guidé structuré. Les recommandations actuelles utilisent une correspondance explicable secteur/besoin, pas une consultation LLM cachée ou un audit automatique de sites.
- Préférences « mes outils » / « fourni par Orbis » enregistrées ; aucun OAuth, abonnement fournisseur, redistribution de données ni facturation ne découle de ce choix.
- Les missions créées n’héritent pas des documents d’autres dossiers. Leur première source est le contexte déclaré pour ce dossier. Les données restent dans un même store local sans isolation SaaS validée.
- Un premier livrable exige une clé fournisseur valide et des sources suffisantes. Les cinq minutes sont une cible de parcours, pas une mesure d’activation réelle.

## Conditions non négociables avant vente SaaS

Vérifications de cette itération : 27 tests unitaires, TypeScript, lint ciblé et build webpack réussis. Le parcours audit → plan → installation → configuration → Studio a été exécuté dans le navigateur sur une instance avec stockage QA séparé. La réouverture restaure les préférences et ne duplique pas la mission. Le catalogue affiche douze cartes puis permet d’en charger davantage ; aucun débordement à 390 px. Les appels payants aux modèles restent non vérifiés faute de fournisseur configuré.

| Gate                                      | État                                | Preuve exigée                                                      |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Authentification + tenant issu de session | Non implémenté                      | Tests d’accès inter-tenant, rôles intégrateur et révocation        |
| PostgreSQL / transactions / migrations    | Non implémenté                      | Migration des données locales, concurrence et restauration testées |
| Jobs durables                             | Non implémenté                      | Reprise après crash et idempotence distribuée                      |
| Secrets chiffrés et OAuth                 | Non implémenté                      | Connexions réelles, scopes minimaux, suppression et rotation       |
| Fourniture gérée                          | Non activée                         | Accords fournisseurs, metering et rapprochement de coûts           |
| Paiement / abonnements                    | Non activé                          | Webhooks idempotents, plafonds et annulation testés                |
| Qualité métier                            | Contrats écrits, modèles à calibrer | Dataset par cas, revue experte, taux d’acceptation et coût mesurés |
| Production                                | Non déployée                        | Sécurité, sauvegardes, monitoring, rétention et runbook incidents  |

Ne pas ouvrir cette application à des données clients sensibles ou à Internet comme SaaS tant que ces gates ne sont pas franchis. Le changement de vocabulaire commercial ne change pas ces obligations.

## Ordre d’exécution pour la version vendable

1. Identité/organisation et base transactionnelle, en réutilisant un fournisseur OIDC et PostgreSQL. Migration explicite, pas destruction du store existant.
2. Worker durable et registre de consommation ; test de coupure/reprise. Isoler configuration, approvisionnement et exécution.
3. Gestion de credentials via coffre et infrastructure OAuth existante. Un premier connecteur bout en bout derrière le broker, avec reçu de résultat.
4. Tarification et plafonds avant toute fourniture gérée. Voir PRICING.md.
5. Calibration des 100 contrats par lots avec experts métier. Une fiche « préconçue » devient « validée » uniquement sur preuve, pas par changement de badge.
6. Rôles et espaces intégrateurs, publication de modèles versionnés, migration volontaire des clients et rollback.

Ces étapes requièrent des environnements et comptes de production à choisir/configurer ; aucun fournisseur ni abonnement n’a été souscrit pendant ce travail.
