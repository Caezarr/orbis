# Roadmap and execution plan

## Week 0: evidence and design

Interview five to ten companies across different activities. Collect permissioned examples of requests, documents, desired outputs and current corrections. Decide whether the first four capabilities have real repeated demand. Create 30–50 cases per chosen capability, including failures.

## Weeks 1–2: vertical slice

Build workspace, website/description onboarding, profile hypotheses, catalog, one mission setup and one testable capability. Use manual or semi-manual operations behind the interface when needed, but log every operator intervention.

## Weeks 3–4: reusable substrate

Add package manifest, source ingestion, instruction scope, test/live mode, artifacts, evidence, feedback, mission versioning, model gateway and Langfuse traces. Integrate one app connection through Nango or Composio instead of building OAuth infrastructure.

## Weeks 5–6: four-capability pilot

Ship research, meeting prep, content draft and request analysis with common UI and separate evaluators. Test with several different companies. Add supervised activation, budgets and second-capability reuse.

## Weeks 7–10: operational reliability

Introduce Temporal durable runs, connector webhooks, approval hash, reconciliation, audit, export and staging production controls. Add quote preparation or lead operations only if the pilot shows demand.

## Weeks 11–16: productization

Improve recommendations, capability package tooling, pricing and onboarding diagnostics. Publish only internal packages first. Prepare partner package contract and sandbox only after packages are actually maintained.

## Founding team split

Product/founder: user interviews, capability definition, evaluation acceptance, pricing and partner learning. Full-stack engineer: web, API, data and mission UI. AI/platform engineer: package runtime, model gateway, knowledge, traces and evaluators. Part-time security/ops: permissions, secrets, deployments and incident practice.

## Fastest credible demo

A visitor submits a company site, receives three recommendations, chooses “analyze incoming customer requests”, attaches an example, gets a structured answer with citations and missing information, corrects one item, reruns it, and activates supervised processing. A second capability reuses the company profile and asks only for missing context.

## Backlog slices

`PLAT-001` workspace and membership; `UX-001` onboarding profile; `CAT-001` package registry; `RUN-001` test run; `KNOW-001` source upload and citations; `EVAL-001` feedback report; `CONN-001` first OAuth connector; `POL-001` test/live broker; `COST-001` usage ledger; `DUR-001` durable run; `CAP-001` four alpha packages; `MKT-001` catalog search; `EXP-001` export; `SEC-001` tenant isolation tests.

## Exit criteria for pilot

Users complete a first useful result without live human orchestration in the majority of eligible trials; return usage occurs; corrections decrease on repeated runs; a second capability can be installed using existing context; support time and accepted-result cost are known; at least some pilot users pay or commit to continuing. Do not use vanity signups as the primary signal.
