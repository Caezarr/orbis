# Orbis landing — livraison du 9 septembre 2026

## Direction

Une entreprise plus capable, sans agrandir son équipe. Le hero présente un résultat de travail plutôt qu’une architecture d’agents. Inspiration de structure : [Gojiberry](https://www.gojiberry.ai/), sans reprendre ses assets, ses chiffres clients ou son angle exclusivement commercial.

Palette : marine `#182d5b`, cobalt `#305ee8`, ciel `#edf3ff`, texte `#53627b`, bordures `#dce4f0`, blanc. Geist existant pour les titres et le texte. Titres grands, alignement central au hero puis alternance de sections éditoriales et de démonstrations. Accent orange limité au visuel de contexte.

Revue de direction : éviter une nouvelle page entièrement composée de cartes explicatives. Le premier asset est un livrable manipulable ; les traces restent hors de la landing. L’illustration de modules sur un socle commun explique visuellement la modularité. Aucun faux témoignage, coût ou temps gagné.

## Fichiers

- `src/app/page.tsx` : page rendue côté serveur, contenu, métadonnées et FAQ native.
- `src/components/landing/LandingExperience.tsx` : navigation responsive, démo à trois scénarios, aperçu de mémoire.
- `src/app/landing.module.css` : styles locaux, sans fuite vers le workspace ; adaptation mobile et réduction des animations.
- `public/brand/orbis-modules.png` : illustration originale. Next Image prend en charge les tailles adaptées et le chargement différé.
- `desktop.png`, `mobile.png` : captures de vérification.

## Interactions réalisées

- Trois exemples : réponse client, préparation de réunion et premier draft de contenu.
- Onglets cliquables et clavier : flèches gauche/droite, Home et End.
- Sources d’exemple ouvrables et propres à chaque scénario.
- Validation et reset locaux, sans effet externe.
- Téléchargement texte du scénario, avec mention de démonstration fictive et sources.
- Choix de portée d’une correction, prévisualisation et annulation ; aucune écriture dans le workspace.
- Menu mobile, fermeture avec Échap et restitution du focus au bouton.
- FAQ native `details/summary`, liens de navigation et liens vers quatre capacités existantes.

Les interactions de cette landing n’appellent aucun fournisseur IA ni endpoint métier. Le workspace existant reste un prototype : ses problèmes runtime documentés dans l’audit ne sont pas corrigés par cette livraison. OAuth réel, BYOK, mémoire de production, isolation multi-tenant et exécution durable restent à construire. La page distingue explicitement le prototype de la direction produit.

## Vérifications

- `tsc --noEmit --incremental false` : succès.
- ESLint sur les deux fichiers TSX de landing : succès. Les erreurs historiques des autres pages n’ont pas été incluses dans ce résultat.
- `next build --webpack` : succès, 22 pages statiques générées ; `/` prérendue.
- Build Turbopack standard : non validé dans cet environnement. Première tentative bloquée par le téléchargement des polices Google ; seconde par une restriction de création de port du compilateur CSS. Aucune configuration projet changée pour masquer cette limite.
- Gstack : sélection des scénarios, navigation au clavier, sources, validation, téléchargement, mémoire/annulation, FAQ et menu mobile vérifiés.
- Largeurs 320, 390, 768 et 1440 px : pas de débordement horizontal du document. Capture mobile inspectée ; section des outils ajustée pour éviter une colonne de texte trop étroite.
- Liens `/`, `/discover` et quatre routes de capacités : HTTP 200.
- Console après purge des messages des autres sites et rechargement : aucune erreur.
- `expect-cli` disponible mais run sans sortie exploitable pendant plusieurs minutes ; processus de ce run arrêté. Pas de résultat automatisé expect revendiqué. Les scénarios ont été repris directement avec le navigateur gstack.
- Superdesign non authentifié ; tentative de login sans autorisation aboutie pendant le travail. Pas de canvas Superdesign créé. Réalisation directe guidée par le skill frontend-design.

## Asset original

Généré avec l’outil intégré ImageGen, puis copié dans le projet. Aucun modèle CLI ni clé utilisateur requis.

Prompt utilisé :

> Use case: stylized-concept. Asset type: original Orbis SaaS brand illustration for a website section about modular business capabilities sharing a common foundation. Create a high-end tactile 3D studio render, landscape 3:2. An architectural arrangement of five small freestanding sculptural modules made of folded matte cobalt blue paper and frosted pale-blue acrylic, on a single flat rectangular white plinth. One arch, one stepped stack, one folded vertical loop, a low rectangular block and a tiny orange translucent cube. They form a miniature abstract digital workshop, elegant and impossibly precise, no computers, no robots, no letters, no text, no logo. Shot at three-quarter overhead angle with warm sunlight from upper left, crisp long architectural shadows, subtle paper grain. Background seamless very pale cool blue #eef3ff. Structure occupies center and right with generous breathing room. Restrained contemporary Swiss technology brand art direction, museum product photography, excellent real materials, no neon, no cosmic orb, no gradient mesh.

## Suite recommandée

Réutiliser la grammaire visuelle et les composants de livrables dans Today et le Lab, tout en remplaçant progressivement les fixtures par une boucle réelle. Ne pas simplement connecter le nouveau design aux faux états de succès existants.
