# Orbi — l'employé qui tient ta boîte mail

Version 1 — 2 octobre 2026. Concept poussé au maximum, en profondeur sur un seul usage (cf. 17-v1-self-serve.md). Pas de retour à la largeur « 100 missions ».

## Promesse

Orbi tient la boîte mail d'une petite entreprise : il prépare les réponses, relance ce qui doit l'être, et devient la mémoire de l'entreprise. L'humain relit et envoie ; l'autonomie n'augmente que sur décision explicite.

## Niveaux

| # | Niveau | Expérience | Statut |
|---|---|---|---|
| 1 | Valeur avant connexion | URL → 10 questions probables des clients + réponses sourcées + brouillons d'exemple simulés, sans compte | En cours |
| 2 | Brouillons dans la boîte | Mails réels → brouillons sourcés, jamais envoyés | PR #17, #18 |
| 3 | Fiche entreprise vivante | Extraction depuis les mails envoyés : prix, délais, zone, conditions, ton. Validation humaine fait par fait, provenance conservée | À faire |
| 4 | Une question, une seule fois | Chaque `[[À CONFIRMER]]` devient une question unique ; la réponse devient règle approuvée | À faire |
| 5 | Apprentissage par diff | Brouillon proposé vs mail envoyé → règle proposée, approuvée en un clic | À faire |
| 6 | Relances | Devis ou demandes sans réponse client après N jours → brouillon de relance | À faire |
| 7 | Pipeline automatique | Chaque demande → ligne structurée (contact, besoin, budget, statut) | À faire |
| 8 | Rapport mesuré | Brouillons préparés / envoyés tels quels / délai de réponse, uniquement des mesures | À faire |
| 9 | Autonomie progressive | Envoi en un tap, puis auto-envoi opt-in par catégorie à fort taux d'acceptation | Plus tard |

Ensuite : formulaires de contact (expéditeurs de confiance), WhatsApp Business, boîte partagée d'équipe.

## Moat

La fiche entreprise construite depuis les mails envoyés et corrigée par l'usage. Chaque semaine, moins de questions, plus de brouillons envoyés tels quels. Mesurable, propre à chaque client, jamais mutualisé entre clients.

## Garde-fous constants

Mail = donnée non fiable. Destinataire calculé par le code. Aucun envoi sans décision humaine explicite (niveau 9 opt-in par catégorie, révocable). Aucun chiffre non mesuré affiché.
