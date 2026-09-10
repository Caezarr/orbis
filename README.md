# Orbis

### Your company. Your tools. Your AI team.

Orbis turns the work around a company into missions that AI agents can understand, prepare, run and improve.

Start with a website or a conversation. Orbis identifies the work worth delegating, suggests a ready-to-use mission, connects the right context and tools, then gives you a result to review.

![Orbis — your company, with a little more capacity](public/brand/orbis-modules.png)

<p align="center">
  <a href="http://127.0.0.1:3000/">Landing</a> ·
  <a href="http://127.0.0.1:3000/catalog">Mission catalog</a> ·
  <a href="http://127.0.0.1:3000/audit">Company audit</a> ·
  <a href="docs/architecture/CTO-README.md">Architecture</a>
</p>

## What Orbis does

```text
Understand your company → Choose the work → Connect context → Test the result → Delegate with memory
```

The product combines a guided company audit, a catalog of 100 business missions, scoped knowledge, tool access, agent memory, evaluation and a workspace for reviewing the work produced.

## Product surface

| Surface | Purpose |
| --- | --- |
| Company intake | Start from a website or describe the business in your own words |
| Mission catalog | Browse 100 pre-designed missions across 10 departments |
| Mission setup | Define outcomes, instructions, sources, tools and approval rules |
| Knowledge scopes | Select the exact workspace, site, folder or source an agent may use |
| Agent runtime | Generate structured work, attach sources and evaluate the result |
| Memory | Turn approved feedback into reusable mission context |
| Workspace | Review runs, corrections, evidence, unknowns and decisions |
| Partner mode | Prepare repeatable setups for integrators and their clients |

Examples include customer replies, quote preparation, research briefs, meeting preparation, content drafts, lead qualification and internal operations.

## Design principles

- **Simple at the surface.** A company starts with a conversation, not an automation canvas.
- **Specific underneath.** Each mission has a defined input, output, context, steps and acceptance criteria.
- **Scoped by default.** Agents only receive the knowledge and tools selected for the mission.
- **Reviewable work.** Results expose sources, claims, unknowns and proposed next actions.
- **Improvement with permission.** Feedback becomes memory when approved.
- **Bring your tools.** Orbis is designed to work around the systems a company already uses.

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev --hostname 127.0.0.1
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Useful routes: `/` landing, `/audit` company audit, `/catalog` mission catalog, `/pricing` pricing, `/today` workspace.

### Optional model configuration

The interface and product flows are explorable without a provider key. To run model-backed missions, create an ignored `.env.local` file:

```dotenv
ORBIS_AI_PROVIDER=openai
ORBIS_AI_MODEL=your-supported-model-id
OPENAI_API_KEY=your-private-api-key
```

Anthropic is also supported with `ORBIS_AI_PROVIDER=anthropic`, a supported model ID and `ANTHROPIC_API_KEY`. Never commit credentials. Provider usage and costs remain under the configured provider account.

## Verify the project

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec next build --webpack
```

The test suite uses mocked provider responses and does not make paid model calls.

## Architecture

The codebase is built from small, inspectable contracts rather than a new agent framework.

```text
Next.js app
├── Product surfaces      audit · catalog · missions · knowledge · plans
├── Runtime               bounded generation · review · repair · evaluation
├── Domain contracts      missions · sources · memory · connections · pricing
├── Local store            deterministic development state and fixtures
└── Visual system          Orbis landing · liquid glass · shader illustrations
```

Read the technical documentation:

- [Architecture overview](docs/architecture/CTO-README.md)
- [Runtime](docs/architecture/CTO-02-runtime.md)
- [Data contracts](docs/architecture/CTO-03-contracts.md)
- [Security](docs/architecture/CTO-04-security.md)
- [Evaluation](docs/architecture/CTO-06-evaluation.md)
- [Integrations and knowledge](docs/product/INTEGRATIONS-AND-KNOWLEDGE.md)
- [Product release](docs/product/PRODUCT-RELEASE.md)
- [Landing motion system](docs/design/LANDING-MOTION.md)

## Current product status

Orbis is an active product build with a functional local workspace, guided onboarding, mission catalog, scoped product flows and model-backed runtime contracts.

The next production milestones are authenticated multi-tenant storage, encrypted credentials, durable jobs, live OAuth connections, provider metering, observability and enterprise retention controls. The current local store is for development and evaluation; it is not the production data layer.

## License and notices

This repository is private product code. Third-party notices for the visual libraries and assets are available in [`public/third-party-notices.txt`](public/third-party-notices.txt).
