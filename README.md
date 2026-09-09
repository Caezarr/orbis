# Orbis

Install work into a company. Discover a capability, test it on evidence, activate it under approvals.

This is the vertical-slice MVP from the Agent OS dossier in `../proj /`: workspace, onboarding profile, marketplace, mission setup, test runs with a write-blocking broker, evaluation lab, supervised activation, knowledge, connections, usage and export.

## Run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo path:

1. Paste `https://acme.com` on the landing page.
2. Confirm facts / hypotheses / missing data.
3. Try **Customer-request analysis**.
4. Run the Vinci fixture in the lab.
5. Correct a sentence, choose a scope, run again.
6. Activate supervised mode. Sending stays blocked until a payload-bound approval.

Or skip onboarding: **Open workspace** → Today.

## What is real in this slice

- Company profile from a website or explanation (facts, hypotheses, missing).
- Capability registry with maturity (`ready` / `composable` / `planned`).
- Intent resolver: existing package, bounded composition, or honest unsupported.
- Mission versions, test runs, artifacts, checks, citations, unknowns, cost split.
- Tool broker denies `send_email` and other writes in test mode.
- Activation is a server check, not a client flag.
- Corrections become scoped memory.
- Export without secrets.

## What is stubbed on purpose

- Identity: single demo tenant (OIDC comes later).
- Persistence: `data/state.json`, not Postgres + RLS.
- Durable runtime: in-process engine, Temporal adapter later.
- Connectors: Nango/Composio-shaped start flow, secret references only.
- Models: deterministic capability protocols. Swap in a model gateway without changing the UX.

## Stack

Next.js App Router, TypeScript, Tailwind. API under `/api/v1` matching the product contracts.
