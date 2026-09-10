# Agents, memory and evaluation

## Agent layers

An agent package contains role, objective, tools, context scope, instructions, protocol, limits, output schema, validators, escalation rules and tests. The platform owns the runtime; a capability owns the business contract.

Use a small number of role-specific agents inside a durable protocol. Split agents when the boundary improves permissions, quality measurement or failure recovery. Do not create agents only to make diagrams look larger.

## Memory types

- **Working:** current run context, disposable.
- **Episodic:** past decisions, messages, actions and outcomes.
- **Semantic:** company facts, products, clients and terminology.
- **Procedural:** how the company performs a process.
- **Preference:** tone, thresholds and formatting.
- **Organizational:** approved shared context across missions.

Each memory item has source, owner, scope, confidence, validity, version and status. A correction proposes memory; the user chooses its scope. Retrieval filters tenant, scope and source ACL before data reaches a model. Contradictions become visible conflicts, not silent overwrites.

## Harness

```yaml
role: quote_preparer
objective: produce_reviewable_quote
context: [company_profile, approved_catalog, customer_request]
tools: [read_docs, calculate, draft_document]
must: [cite_sources, expose_assumptions, use_integer_money_math]
cannot: [send_email, change_price_catalog]
escalate: [missing_price, legal_uncertainty, margin_below_threshold]
budget: {max_eur: 0.50, max_seconds: 120}
```

## Evaluation layers

Offline datasets test representative success, edge cases and adversarial inputs. Component evaluators check extraction, retrieval, calculation, citation and format. End-to-end evaluators check business acceptance. Production feedback labels real traces; a held-out dataset prevents learning from the same cases used for approval.

Activation gates include required evaluator thresholds, no critical policy failure, source availability, cost ceiling and human review for external effects. Every prompt, model, package, source snapshot and evaluator version is tied to the report.

## Routing and cost

Capabilities ask for tasks and quality targets. A gateway chooses among managed models, BYOK models, local models, cache and deterministic code. Start with explicit policies by task; introduce adaptive routing only after enough evaluations exist.

Track accepted-result cost: inference, connector usage, retries, storage and human review. Keep provider cost and platform charge distinct.

## Graphs

Graphs are versioned protocol definitions. Nodes have typed inputs and outputs, budget, policy and evaluator. The user sees business steps; expert mode reveals nodes and traces. Graph execution must be resumable and idempotent. A failed node can be retried without replaying unrelated external effects.
