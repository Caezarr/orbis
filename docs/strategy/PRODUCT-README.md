# Agent OS — Product and engineering blueprint

Version 0.1 — 8 September 2026. Working name.

This project is a universal entry point for installing useful AI work inside an existing company. A user can provide a website or a plain-language explanation, receive recommendations, browse a capability marketplace, or describe a custom need. They then choose knowledge, instructions, tools and autonomy, test the capability on real examples, and activate it when the result is good enough.

The platform is horizontal from day one. It may cover lead generation, quotes, public tenders, content, support, research, finance and operations. The initial implementation uses a small set of existing infrastructure components and focuses proprietary work on discovery, configuration, context, evaluation, trust and composition.

## Documents

### Dossier CTO et tech lead

- [CTO review pack](CTO-README.md)
- [Architecture cible](CTO-01-architecture.md)
- [Runtime et séquences](CTO-02-runtime.md)
- [Contrats et données](CTO-03-contracts.md)
- [Sécurité](CTO-04-security.md)
- [Fiabilité et production](CTO-05-reliability.md)
- [Evaluation et qualité](CTO-06-evaluation.md)
- [Stack buy versus build](CTO-07-stack.md)
- [Roadmap technique](CTO-08-execution.md)
- [ADRs](CTO-09-ADRs.md)

- [Vision](01-vision.md)
- [PRD](02-prd.md)
- [Product UX](03-product-ux.md)
- [Functional flows](04-flows.md)
- [Capability marketplace](05-capabilities.md)
- [Build versus buy and stack](06-build-buy-stack.md)
- [Architecture](07-architecture.md)
- [Data and contracts](08-data-contracts.md)
- [Agents, memory and evaluation](09-agents-memory-evals.md)
- [Roadmap and execution plan](10-roadmap.md)
- [Brand and landing brief](11-brand-landing.md)
- [Open decisions and validation](12-decisions.md)

## Product thesis

The product should make a new capability feel like installing a well-tested business function. A user can start with one need, but the system becomes more valuable as it understands the company and makes the next capability faster to configure.

## What we build

We build the company-specific adaptation layer: the profile, capability resolver, configuration experience, evidence-based evaluations, policy and autonomy controls, cross-capability context, and the operator surface that makes agent work understandable.

## What we integrate

We integrate mature infrastructure for identity, app connections, durable workflows, LLM routing, tracing, evaluation, files, payments and deployment. Each choice is revisited at the kickoff using current pricing, security posture, region and API limits.
