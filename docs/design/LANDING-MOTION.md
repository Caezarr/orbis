# Landing — système de mouvement

Révision du 10 septembre 2026. Implémentation : CompanyLanding, MotionScenes, Optics et PreparedMetal.

## Direction

Blanc, bleu nuit, cobalt et métal bleuté. Le mouvement explique une transformation métier ; il ne simule pas une exécution réelle. La photographie architecturale est retirée du parcours, son fichier est conservé.

## Scènes

- Atelier : un scénario unique relie entrée et résultat. Cycle de 7,6 s : entrée, traitement, résultat. Trois scénarios tournants (réponse client, devis, recherche).
- Sélection et calendrier : scènes conservées.
- Mémoire : réseau SVG déterministe, 6 / 16 / 30 nœuds aux semaines 1 / 3 / 5. Positions stables, nouveaux liens progressifs. Pas de simulation physique ni de métrique de performance inventée.
- Configuration : section sticky ; progression Understand → Connect → Delegate au scroll. Navigation clavier facultative conservée. Panneaux inactifs inert et masqués pour éviter les superpositions de texte.
- Écosystème : six notifications, textes et positions différents, cadence 4,6 s.

## Coût de rendu

- Prétraitement Paper partagé par URL locale et anticipé après le chargement initial ; cache des masques décodés.
- Préparation des shaders à 900 px du viewport ; animation seulement près de la zone visible. Les étapes cachées préparent une image immobile.
- Métal : résolution plafonnée à 120 000 pixels et densité minimale 1.
- Verre : shaders MIT de liquid-glass-js, texture décorative locale 256 × 256 ; pas de capture HTML de la page. Rendu à l’interaction, pas de boucle permanente.
- Gradient chargé dynamiquement ; fallback CSS lorsque WebGL est indisponible.
- Timers arrêtés hors écran / onglet masqué ; scroll passif regroupé via requestAnimationFrame.
- Préférence système de mouvement réduit respectée. Réglage discret dans le footer, aucun bouton pause dans la navigation.

Le prétraitement reste côté client, anticipé et mutualisé : ce ne sont pas des vidéos précalculées sur serveur.

## Tarifs et vérité produit

Solo : 149 €/mois envisagés. Business : 399 € incluant cinq sièges, puis 39 €/siège supplémentaire envisagés. Partner : discussion du setup, sans montant fixe. L’usage est séparé ; aucun paiement n’est activé. Les sièges sont validés (1–50) et conservés dans l’audit.

« 900+ » désigne le catalogue fournisseur Composio, pas 900 intégrations déjà opérationnelles dans Orbis. Disponibilité et autorisations restent vérifiées mission par mission. Les illustrations et le graphe mémoire ne constituent pas une preuve d’exécution autonome.

## Dépendances et licences

ShaderGradient est utilisé via son paquet React. Le métal repose sur Paper Shaders (Apache-2.0), pas sur une copie de l’application liquid-logo sous PolyForm Shield. Les shaders liquid-glass-js sont adaptés avec leur notice MIT. Les logos des outils sont locaux ; les droits de marque restent ceux de leurs propriétaires. Notices distribuées dans /third-party-notices.txt.

## Vérifications

44 tests unitaires réussis, TypeScript, lint ciblé et build webpack réussis. Parcours au scroll vérifié sans clic aux trois étapes. Mobile 390 × 844 sans débordement horizontal ; sélection de dix sièges → 594 € → audit conservant dix sièges. Week 5 : trente connexions. Mouvement réduit désactive les animations.

Limite : navigateur de test sans WebGL ; fallback contrôlé, rendu GPU et cadence réelle à valider sur Safari/Chrome avec accélération matérielle et téléphone physique. Aucun score Lighthouse ou objectif FPS n’est revendiqué.
