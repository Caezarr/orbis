# Agent OS — CTO review pack

## Décision à évaluer

Construire une couche de configuration et d’exécution de capacités IA au-dessus de fournisseurs existants. Le produit transforme une demande d’entreprise en mission versionnée, l’évalue sur des exemples, puis l’exécute sous permissions et budget.

La question CTO n’est pas « peut-on appeler un LLM ? ». Elle est :

> peut-on installer une capacité métier fiable dans une nouvelle entreprise, la tester, l’observer, la reprendre après incident et prouver ce qu’elle a fait ?

## Ce que nous possédons

| Couche | Décision produit | Valeur défendable |
|---|---|---|
| Discovery | site, description, catalogue, intent resolver | réduction du travail de configuration |
| Context | profile, knowledge, instructions, memory | contexte entreprise réutilisable et sourcé |
| Capability | package + protocol + harness | résultat métier versionné |
| Evaluation | dataset, checks, human feedback, gates | qualité comparable dans le temps |
| Runtime | mission, run, approval, action | exécution reprenable et contrôlée |
| Operator UX | today, lab, evidence, expert mode | compréhension et adoption |

## Ce que nous ne reconstruisons pas

Les connexions OAuth et syncs sont déléguées à Nango ou Composio après qualification. Les workflows durables sont délégués à Temporal. Les traces, prompts et évaluations d’ingénierie sont accélérés par Langfuse. Le modèle n’est pas notre produit : le routage et les politiques de qualité le sont.

## Index CTO

- [Architecture target](CTO-01-architecture.md)
- [Runtime et séquences](CTO-02-runtime.md)
- [Contrats et modèle de données](CTO-03-contracts.md)
- [Sécurité et trust boundaries](CTO-04-security.md)
- [Fiabilité et production](CTO-05-reliability.md)
- [Evaluation et qualité](CTO-06-evaluation.md)
- [Stack et choix buy versus build](CTO-07-stack.md)
- [Roadmap technique et tickets](CTO-08-execution.md)
- [Architecture decision records](CTO-09-ADRs.md)

## Règles de lecture

Les éléments « MUST » sont des invariants de plateforme. Les éléments « SHOULD » sont des choix de lancement réversibles. Les chiffres sont des objectifs à mesurer, pas des résultats établis. Chaque design qui viole un invariant doit créer un ADR ou être refusé.

## Questions de revue

1. La frontière tenant et la provenance sont-elles conservées jusqu’au modèle ?
2. Une action externe peut-elle être rejouée sans doublon ?
3. Peut-on reconstituer pourquoi une sortie a été produite ?
4. Peut-on remplacer un fournisseur sans réécrire les capacités ?
5. Peut-on distinguer une correction de résultat d’une nouvelle règle ?
6. Le système dégrade-t-il proprement quand une connexion ou un modèle tombe ?
7. Le coût d’une mission est-il réservé avant exécution et rapproché après ?
8. Les résultats d’évaluation reflètent-ils le métier du client plutôt qu’un score générique ?
