# Product UX

## Information architecture

```text
Workspace
├── Today       decisions, running work, recent results
├── Discover    recommendations, marketplace, free-form request
├── Missions    installed capabilities and versions
├── Knowledge   sources, instructions, memory and conflicts
├── Connections apps, models, keys and permissions
└── Settings    members, budgets, billing, audit and export
```

The chat is an interaction mode. Durable objects remain accessible as pages and are never trapped in chat history.

## Onboarding

One entry field accepts a website or explanation. The system presents a company profile with source links, confirmed facts, hypotheses and missing information. The user edits the profile and can continue before all questions are answered.

## Discover

The user sees three to six recommended capabilities and can browse the complete catalog. A capability card contains its result, example input, required knowledge, integrations, maturity, test time and autonomy boundary. “Ready”, “Composable” and “Planned” must be visibly different.

## Mission setup

Six sections: outcome, knowledge, instructions, tools, operating mode, budget and approvals. Defaults are proposed by the package. The user can start the test with only blocking requirements complete.

## Evaluation lab

Left: selected real or historical case. Center: output and editable corrections. Right: evidence, checks, missing context, model, cost and trace. Buttons: rerun, save correction, change scope, activate supervised mode. No unbounded model reasoning is exposed; show useful evidence and decisions.

## Today

Cards show what requires a decision. Each card gives the mission, proposed action, reason, source, estimated cost and consequence. Approval is tied to a specific payload and expires when relevant content changes.

## Expert mode

Advanced users can edit model policy, prompts, retrieval settings, tool scopes, harness rules, graph nodes and evaluation datasets. Changes create a draft version and invalidate approval until retested. Import and export use a versioned manifest.

## Accessibility and responsive behavior

Desktop is primary for setup and evaluation; mobile supports review and decisions. Keyboard navigation, visible focus, screen-reader labels, non-color status and explicit action names are required on critical paths. Three-column lab becomes tabs on narrow screens.
