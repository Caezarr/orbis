# Design system et maquettes fonctionnelles

## Direction

L'interface doit donner une impression de capacité calme : la complexité existe dans le moteur, mais l'utilisateur voit toujours le prochain résultat et la décision attendue. Le produit ressemble à un espace de travail vivant, pas à un tableau de bord de métriques ni à un constructeur de workflows.

La référence Mobbin sert ici pour les patterns de navigation, onboarding, recherche, étapes, listes, états vides, approbations et panneaux de détail. La bibliothèque est utile pour comparer des parcours réels, mais aucune interface ne doit copier une marque ou un écran précis. [Mobbin](https://mobbin.com/)

## Tokens v0

```text
Canvas        #F8F8F6
Surface       #FFFFFF
Ink           #101114
Muted         #686D78
Line          #E4E6EA
Blue          #315CFF
Blue soft     #EEF2FF
Green         #16845B
Green soft    #EAF8F1
Amber         #A76500
Amber soft    #FFF6E5
Red           #C33E4D
Red soft      #FFF0F1
Radius small  8px
Radius medium 14px
Radius large  22px
Space         4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px
Body          14–16px
Display       36–56px
```

Une seule couleur d'accent principale par écran. Les couleurs sémantiques accompagnent toujours un libellé, une icône ou une forme. Les titres et headers restent noirs. Éviter les ombres fortes et les cartes imbriquées.

## Composants essentiels

App shell, workspace switcher, command input, recommendation row, capability card, maturity indicator, source chip, evidence drawer, missing-context prompt, mission stepper, knowledge source row, instruction editor, tool permission row, test case picker, output diff, evaluation score row, approval bar, run timeline, activity feed, cost line item, conflict state, connection state, audit event, export action.

Chaque composant doit documenter : default, loading, empty, error, disabled, permission denied, stale, long content, keyboard focus et mobile. Les composants de mission doivent recevoir des données structurées, pas du texte arbitraire généré par un modèle.

## Maquette A — Onboarding et découverte

Viewport desktop 1440 × 1024.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Logo     Workspace ▾                                      Help   Account      │
├───────────────┬──────────────────────────────────────────────────────────────┤
│               │ Good morning, Gabriel                                         │
│ Today         │ Tell us how your company works                                │
│ Discover      │ ┌──────────────────────────────────────────────────────────┐ │
│ Missions      │ │ Paste your website or describe the work you want delegated │ │
│ Knowledge     │ │                                                [Continue] │ │
│ Connections   │ └──────────────────────────────────────────────────────────┘ │
│               │                                                              │
│               │ We found enough context to suggest a starting point          │
│               │ ┌──────────────────┐ ┌──────────────────┐ ┌────────────────┐ │
│               │ │ Research         │ │ Request analysis │ │ Quote prep     │ │
│               │ │ Ready to test    │ │ Needs CRM        │ │ Composable     │ │
│               │ │ [Try this]       │ │ [See details]    │ │ [Explore]      │ │
│               │ └──────────────────┘ └──────────────────┘ └────────────────┘ │
│               │ [Browse all capabilities]   [Describe another need]           │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

Primary action : `Try this`. The cards explain result and prerequisites. Do not show agent counts, model names or technical graphs in this moment.

## Maquette B — Capability detail

```text
Breadcrumb: Discover / Research brief

Research brief                                      Ready to test
Turn a question into a sourced, prioritized brief.

Example result     What it needs        How it works
────────────────   ─────────────────    ─────────────────
Sourced brief      Website context      Research → filter
Unknowns           Optional documents    → cite → review

Your first test
[Choose a question or paste one]                    [Start test]

Knowledge used if connected: Company profile, selected sources
External effects: None in test mode
```

The user sees the outcome, example and limits before installation. Details remain readable without opening a technical panel.

## Maquette C — Evaluation lab

```text
Mission: Analyze customer request                         Test 2 of 3
──────────────────────────────────────────────────────────────────────────────
CASE              RESULT                                      EVIDENCE
Request #104      Proposed response                           4 sources used
                  ┌──────────────────────────────┐             2 unknowns
                  │ Bonjour,                       │             [View trace]
                  │ Nous pouvons vous proposer…   │             Checks
                  │                                │             ✓ request covered
                  │ [Edit] [Accept correction]     │             ✓ no price invented
                  └──────────────────────────────┘             ! margin unknown

Correction scope:  ○ this result  ○ this customer  ○ general rule
                                                          [Run again]
                                           [Activate supervised mode]
```

The primary feedback loop is visible. The right panel answers why the output exists. A score without evidence is insufficient.

## Maquette D — Today

```text
Today                                                3 decisions needed

REVIEW
┌──────────────────────────────────────────────────────────────────────────────┐
│ Customer request · Acme                              Prepared 2m ago          │
│ Missing one delivery constraint. Reply is ready.     [Inspect] [Approve]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Content draft · LinkedIn                             Sources: 4               │
│ Two claims need confirmation.                        [Edit] [Keep draft]      │
└──────────────────────────────────────────────────────────────────────────────┘

RUNNING          Request analysis · 4 documents · cost estimate €0.18
RECENT           Meeting brief accepted · corrected once · next run improved
```

The user manages outcomes, not background agent chatter. A technical trace is one click away, never the default surface.

## Maquette E — Expert harness

Sections : objective, context policy, tools and scopes, model policy, protocol graph, evaluators, limits, version history. Every edit is a draft. The screen shows what changed, which tests must rerun and which active behavior is unaffected until approval.

## UX invariants

- Every recommendation states its evidence and uncertainty.
- Every destructive or external action has a preview and a policy boundary.
- Every error offers a recovery path or an honest explanation.
- Every saved instruction has a scope and provenance.
- Every model choice can be inspected by experts, but never blocks beginners.
- Every capability has a result before it has a configuration dashboard.
