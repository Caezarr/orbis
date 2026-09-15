# Task billing integration

Pure synchronous domain. No network, storage, subscription charge or payment operation.
All amounts are integer EUR cents, bounded by `Number.MAX_SAFE_INTEGER`.
Rates and plan allowances are configurable proposals, not verified market/provider costs.

## Runtime API

`getTaskQuote({ workflowId, taskId, quantity = 1 }, { rateCard?, workflowRates? }?)`
returns `{ workflowId, taskId, quantity, currency: 'EUR', unitPriceCents, totalCents,
rateVersion, billableOutcome: 'completed_task' }`. Exported from `@/lib/billing`.
Default IDs match the ten workflows in `vertical-registry.ts`. Any task ID within a
known workflow receives that workflow's fixed completed-task rate. Validate task
membership in the workflow at the runtime boundary. Unknown workflows throw;
provide explicit mapping for custom runtime IDs. Quantity counts distinct outcomes,
never attempts. Media is excluded from this compact snapshot.

`createQuote(card, request)` creates a detailed immutable one-outcome snapshot,
including optional explicit media lines. `reserve(account, quote, acceptance)`
accepts the full server-stored snapshot and holds its cost. One included task offsets
the base task price, never media. `balance`, `settle`, `release`, `refund` return new
state without changing prior inputs. Full refunds restore the included task as well
as the cash cap; partial refunds are not implemented.

`settle` accepts only `succeeded` as chargeable and `failed`/`cancelled` as releases.
Normalize the runtime's verified final business outcome before calling it. All other
statuses retain the hold. Attempt failures are NOT final business failures.
Terminal state wins against late contradictory events. Retries reuse the same quote
and outcome key, even after release/refund; a genuinely new deliverable needs a new key.
Do not expire/release unknown outcomes merely because the original quote expired.

## PostgreSQL adapter contract (main owns implementation)

- Derive tenant from authenticated server context. Load quotes server-side; never
  trust browser-supplied prices or account objects. The pure API assumes trusted state.
- Store rate versions immutably. Store snapshots as JSONB; amounts/counts/revision
  as BIGINT with nonnegative checks and JS-safe upper bound `9007199254740991`.
  Parse pg BIGINT strings with a checked adapter, never unchecked Number conversion.
- Use UNIQUE `(tenant_id, outcome_key)` globally across billing periods, and UNIQUE
  `(tenant_id, quote_id)`. Outcome key includes workflow, task type and business instance
  (e.g. booking ID + arrival date); exclude attempt/run IDs. Keep terminal tombstones.
- An account is one tenant/period; persist its immutable allowance and budget snapshot.
  Bind each quote to its account/period in storage. A late settlement/refund updates
  its original period. Never move old reservations into the current allowance pool.
- Atomically lock the account row (`FOR UPDATE`) before reading available budget and
  allowance, inserting reservation, and updating counters. Or compare-and-swap revision
  with retries. Unique outcome constraint alone cannot prevent parallel overspending.
- Persist reservation and ledger changes in one transaction. Emit external events
  through a transactional outbox. This in-memory reference reducer is not a concurrent
  persistence implementation. Persist lifecycle timestamps/events for audit.
- Acceptance binds the quote ID and full price/media scope; record the authenticated
  approver and acceptance timestamp in the adapter. No implicit media overage: create
  a separately approved outcome/quote before additional production.

## UI

`TaskPricing` named/default export from `src/components/product/TaskPricing.tsx`.
Props: `plans?`, `rateCard?`, `initialSeats?`, `onSelectPlan?` (client callback).
No CTA is rendered without the callback. Solo/Business monthly fee is separate from
the suggested optional extra-task spending cap. Included tasks are shared per account,
not multiplied by seats. Partner is contract-defined. CSS follows workspace blue/white.
Parent owns routing, approval, persistence and checkout. Existing pricing is untouched.

Verification: `pnpm exec vitest run src/lib/billing/billing.test.ts src/lib/billing/task-pricing.test.ts`.
