# Pricing Orbis — proposition à valider

9 septembre 2026. Montants ci-dessous : hypothèses commerciales, pas abonnements activés ni tarifs fournisseurs garantis.

## Décision proposée

**MRR de plateforme + consommation distincte + déploiement séparé.** Ne pas vendre un nombre d’agents, des tokens incompréhensibles ou de l’usage illimité. La valeur durable est le fonctionnement de l’entreprise : contexte, contrats métier, évaluations, mémoire contrôlée, gouvernance et exploitation.

| Offre envisagée |        Plateforme HT/mois | Acheteur                   | Conditions à valider                                                                   |
| --------------- | ------------------------: | -------------------------- | -------------------------------------------------------------------------------------- |
| Entreprise      |                     149 € | Une PME qui démarre        | Périmètre d’accompagnement limité et volume convenu                                    |
| Business        |                     399 € | Plusieurs fonctions métier | Gouvernance, SLA et accompagnement définis contractuellement                           |
| Partenaire      | 499 € + 49 €/client actif | Intégrateur                | Isolation des espaces, droits délégués et support partenaire à implémenter avant vente |

Le catalogue entier doit rester accessible. Ne pas facturer l’exploration ou empêcher un client de trouver le bon cas. Les limites commerciales porteront sur les volumes exécutés, la simultanéité, la conservation et le niveau de service, à fixer après mesure des coûts. Les fonctionnalités de gouvernance de ces offres ne sont pas toutes implémentées aujourd’hui.

## Deux modes de consommation

- **Comptes propres :** le client paie directement ses fournisseurs. Orbis facture la plateforme et, au-delà d’un volume convenu, son orchestration. Pas de marge cachée sur une dépense que le client paie déjà.
- **Fourniture gérée :** coût fournisseur transparent + frais de gestion explicites. Hypothèse de simulation : +20 % du coût fournisseur. Il ne s’agit pas d’une marge brute de 20 % : 100 € de coût revendus 120 € donnent 16,7 % de marge avant autres coûts.
- **Intégration :** prestation distincte, facturable par l’intégrateur. Le partenaire doit pouvoir gagner sur la mise en place et l’amélioration, pas seulement sur une commission d’affiliation.

Exemple purement illustratif : 500 runs à 0,10 € de coût fournisseur hypothétique = 50 €. Avec Entreprise, coût complet de 199 € en comptes propres (149 € Orbis + 50 € fournisseur), ou 209 € avec fourniture gérée et frais de 10 €. Hors taxes et prestation d’intégration. Ce n’est pas une estimation du coût réel d’un modèle particulier.

## Pourquoi ce modèle

Sources primaires consultées le 9 septembre 2026 :

- [Clay pricing](https://www.clay.com/pricing) distingue les Actions, correspondant au travail de plateforme, des Data Credits. La page explique que les clés propres suppriment la consommation de Data Credits, pas les Actions. Elle indique aussi une facturation variable au token pour certains modèles. Cela appuie la séparation entre orchestration et achat de ressources, sans imposer de recopier son système de crédits.
- [n8n pricing](https://n8n.io/pricing/) présente une facturation par exécution de workflow, indépendamment du nombre d’étapes, avec utilisateurs et workflows illimités dans les offres affichées. Cela constitue un repère pour une unité compréhensible, pas une preuve qu’un run Orbis coûte autant.
- [Apollo pricing](https://www.apollo.io/pricing) documente crédits, crédits d’export et restrictions de plans/API. Donc un « contact enrichi » ne peut pas être traité comme un simple token IA ; ses coûts et droits d’utilisation doivent être suivis séparément. La page décrit également plusieurs systèmes de crédits selon le compte.

L’accès à une API ne donne pas automatiquement le droit de revendre son service. Avant toute offre gérée : obtenir les conditions applicables à la redistribution, au stockage, à l’export, aux données personnelles et au compte fournisseur concerné. Aucun prix Apollo/Clay n’est encodé comme coût garanti dans Orbis.

## Comptabilité produit à construire

Pour chaque exécution : tenant, mission/version, fournisseur, unité, quantité, coût réel connu/inconnu, prix de vente versionné, réservation, consommation, remboursement et identifiant fournisseur. Séparer estimation et facture. Réconcilier les échecs : un fournisseur peut facturer un appel dont le résultat a été refusé par notre évaluation.

Avant lancement commercial : plafond dur par entreprise, consentement au dépassement, alertes, devis de coût avant opérations onéreuses, prix verrouillé pendant le run, registre de consommation idempotent et rapprochement des factures. Aucun paiement Stripe n’est actuellement activé.

## Valider la rentabilité

Mesurer par cohorte : coût par résultat accepté, tentatives nécessaires, minutes de revue client, minutes de support interne, intégration initiale, stockage et connecteurs. Calculer la contribution après coûts variables et support, pas seulement après tokens.

Exemple de contribution plateforme, hors acquisition et coûts fixes : abonnement 149 €, infrastructure attribuée 15 €, support 30 € = 104 € disponibles. Ces 15/30 € sont des hypothèses de modèle, pas des coûts observés. Si un client nécessite deux heures de support récurrent, revoir le périmètre ou le prix plutôt que masquer le coût dans des crédits.

Tester les offres auprès de PME et intégrateurs sur des devis réels. Mesurer acceptation, usage répété et coût de support avant tout engagement annuel, remise partenaire ou SLA. Ne pas présenter 149/399/499 € comme un optimum démontré.
