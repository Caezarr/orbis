# Orbi — règles de la mascotte

Orbi est le collègue qui tient la boîte mail ([16-orbi-product-language.md](../strategy/16-orbi-product-language.md), [18-orbi-inbox-concept.md](../strategy/18-orbi-inbox-concept.md)). La mascotte rend le produit vivant **parce qu'elle est rare et honnête** : elle apparaît aux moments qui comptent et son humeur dit toujours la vérité sur l'état réel de l'interface.

## Invariant

> Le mouvement suit l'état réel de l'UI, jamais un succès simulé ni une minuterie.

- `working` uniquement pendant une opération réelle en cours : requête en vol, lot `queued`/`running`, extraction en cours (avec rafraîchissement pour que l'animation s'arrête quand le travail s'arrête).
- `done` uniquement après une confirmation serveur (profil lu, brouillons prêts, réponse enregistrée). Jamais pour un état vide, jamais pour un échec.
- Pas de pourcentage inventé, pas de « presque fini », pas de délai artificiel avant d'afficher un résultat.

## Quand Orbi apparaît

| Moment | Humeur | Exemple |
|---|---|---|
| Premier passage, guide | `welcome` | `/start` : une bulle par étape (« Bonjour, je suis Orbi… ») |
| Orbi travaille sur quelque chose de réel | `thinking` + `working` | lecture du site, tri et rédaction du premier lot, vérification de connexion, lecture des mails envoyés |
| Succès réel | `done` (un seul « pop ») | profil compris, « 3 brouillons prêts à relire », réponse enregistrée |
| Orbi a besoin de l'utilisateur | `thinking` (immobile) | « Questions d'Orbi », site illisible, connexion annulée, passage échoué |
| État vide / non disponible | `welcome`, `team` pour Demandes | Today, Demandes, Fiche, Rapport sans données ou non activés |
| Page introuvable / erreur | `thinking` | 404, error boundary (avec « Réessayer », sans pile d'erreur) |
| Héros de connexion | `welcome` + `float` | `/login` |

## Quand Orbi n'apparaît pas

- Tableaux et listes denses (lignes de demandes, faits de la fiche, tuiles du rapport, récap) : la donnée parle.
- Sur chaque carte : un brouillon porte **la marque** (`OrbiChip`, « Préparé par Orbi »), jamais le personnage.
- Dans un bouton ou un contrôle.
- Pages légales, paramètres, facturation, à côté d'une pile d'erreur ou d'un message technique brut.
- Pour un simple chargement de page (« Chargement… ») : ce n'est pas Orbi qui travaille.
- Erreur de configuration du déploiement (blocages techniques) : le texte explique, Orbi se tait.
- Liste filtrée vide (« Aucune demande pour ce filtre ») : texte simple.

**Un seul Orbi par écran visible.** Quand deux blocs pourraient en montrer un (Today : état vide des brouillons + Questions d'Orbi), un seul le fait ; l'autre passe en texte simple.

## Composants

| Composant | Usage |
|---|---|
| `Orbi` (`src/components/product/Orbi.tsx`) | Le personnage. `mood`, `size` (≥ 32 px, sinon la marque est rendue), `working`, `float`, `priority`. Toujours `aria-hidden`. |
| `OrbiSays` (`OrbiSays.tsx`) | Orbi + bulle de texte réelle. `live` pour annoncer les changements d'état aux lecteurs d'écran. Une phrase, deux au plus. |
| `OrbiEmpty` (`OrbiSays.tsx`) | État vide ou non disponible : Orbi, titre, explication honnête, action éventuelle. |
| `OrbiMark` / `OrbiChip` (`OrbiMark.tsx`) | Marque plate ≤ 24 px (navigation, attribution de brouillon). `mono` suit `currentColor`. Fichier statique : `public/brand/orbi/orbi-mark.svg`. |

## Voix

Orbi parle à la première personne (« je lis », « je prépare », « je n'envoie jamais rien »), vouvoie, phrases courtes, pas d'exclamation, pas d'emoji. Le produit et les mentions légales restent au nom d'Orbis. Une bulle ne promet jamais ce que le code ne fait pas.

## Mouvement (CSS uniquement)

- Arrivée : fondu + 4 px de montée, 380 ms, une fois.
- `done` : un « pop » de 560 ms quand l'humeur devient `done` (composant indexé sur l'humeur).
- `working` : léger balancement (2,8 s) + halo cobalt qui respire derrière le personnage.
- `float` : flottement lent (7 s, 2,5 %), réservé aux héros (connexion, 404).
- Aucun rebond infini sur un écran statique. `prefers-reduced-motion: reduce` coupe toutes les animations (le halo reste visible, fixe, pendant `working`).

## Fichiers

- Originaux 1254 px conservés tels quels : `public/brand/orbi/{welcome,thinking,done,team}.png`.
- Dérivés AVIF/WebP 64/128/256/512 (2–40 Ko) générés par `node scripts/orbi-assets.mjs`, servis via `<picture>` en 1x/2x. À relancer après tout remplacement d'original.
- Aucune image générée ni appel tiers.

## Accessibilité

Le personnage et la marque sont décoratifs (`aria-hidden`, `alt=""`). Tout ce qu'Orbi « dit » est du vrai texte dans la bulle, lisible et traduisible ; les changements d'état passent par une région `role="status"`.
