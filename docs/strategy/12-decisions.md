# Decisions and validation

## Open decisions

1. First connector: choose by pilot frequency and permission quality, not market size.
2. Identity provider and EU/data-region requirements.
3. Nango versus Composio for first three integrations after security and end-to-end tests.
4. Temporal Cloud versus self-hosting after failure and data-region requirements.
5. Managed versus self-hosted Langfuse and trace retention.
6. First billing unit: accepted result, run, seat, connector or hybrid.
7. First capability owner and evaluation maintainer.
8. Whether website ingestion is enough for first recommendations or must be paired with an interview.

## Validation questions

- Can users name a useful mission from recommendations without a demo call?
- Do they trust a result because evidence and unknowns are visible?
- Which source is safe and valuable enough for the first connection?
- Which corrections are reusable across missions?
- What is the first external action customers will actually authorize?
- Does a second mission reuse context or create confusion?
- Does the product reduce human work after five runs, not just on the first run?

## Risks and responses

| Risk | Response |
|---|---|
| Broad catalog creates shallow quality | Separate catalog breadth from package maturity; deepen a few packages |
| Five-minute promise fails on access | Show eligibility, use manual fixture, measure all blockers |
| Prompt injection in sources | Separate policy from content, sanitize retrieval, require action checks |
| Cross-tenant leakage | Composite tenant keys, RLS defense in depth, authorization tests and red-team fixtures |
| Duplicate external actions | Idempotency, provider reconciliation and approval hash |
| Model changes regress quality | Versioned prompts/models, held-out evals and canary |
| Cost surprises | Reservations, hard budgets, retries counted, provider/platform split |
| Overbuilding ecosystem | Internal packages first; SDK and marketplace after repeated package demand |
| Agent memory becomes incorrect | Provenance, scope, expiry, contradiction review and user acceptance |

## Sources and inspiration

- NanoCorp product surface and public workflow: https://www.nanocorp.so/
- CrewAI enterprise build/runtime, governance, tracing, evaluation and multi-LLM positioning: https://www.crewai.com/
- Nango integrations, auth, syncs, triggers and agent-ready tools: https://www.nango.dev/
- Composio sessions, authentication, tools, triggers and app actions: https://docs.composio.dev/docs
- Langfuse tracing, prompts, datasets, evaluation and agent graphs: https://langfuse.com/docs
- Temporal durable workflows and activity boundary: https://docs.temporal.io/workflows
- PostgreSQL row-level security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

External pages were used to identify existing infrastructure capabilities. They are not endorsements or final procurement decisions. Review current terms, pricing, security, open-source licenses and data processing conditions before implementation.
