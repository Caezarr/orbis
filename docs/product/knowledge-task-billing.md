# Selected knowledge and accepted-task billing

Review branch: `feat/knowledge-selection-task-ledger`, stacked on the PostHog/customer-value PR. Merge the analytics PR first, then retarget this PR to `main` before merging. Neither PR is automatically merged or deployed.

## Delivered

- Knowledge: browse a workspace-owned SharePoint account (site → library → folder → file), Google Drive folders/documents, or Notion search/database pages. Preview before importing and choose the target mission. Imported content is visible to the workspace, not private to the importing person.
- Content hash checked again on import: a changed document needs a new preview. Imported documents retain account, item, provider and version provenance. Refresh and withdrawal are explicit actions. Refresh failure pauses the source.
- Learning: propose a mission rule, attach supporting source versions, approve or withdraw it, inspect review history. The runtime uses approved rules; outdated source references and same-title conflicts are excluded. This is controlled context improvement, not model fine-tuning or automatic semantic contradiction detection.
- Connected documents must have been verified within an hour before a new run. The worker rechecks the context before sending queued evidence to the model, and acceptance already checks context again. Revocation cannot recall content already sent to a provider or erase previously generated artifacts.
- A result accepted after explicit paid-task consent creates one ledger entry under a database transaction: preview, included, or payable. The amount is the immutable task quote, not tokens. Failures/cancellations create no accepted-task charge. Old results are not backfilled or charged retroactively.
- Settings shows accepted results, payment status and total balance. An owner/admin explicitly opens Stripe Checkout to settle it. This does not automatically debit a card.
- Payment reservations commit before creating Checkout, with deterministic idempotency. Repeated requests resume the same reservation. A signature-verified webhook checks current Stripe state, customer, currency, amount and session identity before marking paid. Browser redirects never mark a balance paid.

## Activation checklist for Gabriel

1. Review both PRs. Back up the database, then apply migrations with `pnpm exec tsx scripts/migrate.ts` using the migration role and `DATABASE_APP_ROLE`. This includes migrations 005 and 006. The runtime role must not be superuser/BYPASSRLS. No migrations have been run against your production database here.
2. Configure provider OAuth applications with read-only scopes and Microsoft tenant/admin consent where required. Set `COMPOSIO_API_KEY`, `COMPOSIO_AUTH_CONFIG_SHAREPOINT`, and the exact `COMPOSIO_TOOLKIT_SHAREPOINT` matching that auth config. Configure Drive/Notion equivalents. Connect each account **inside the intended workspace** through Connections. The provider must permit Graph sites/drives/children/content reads. No credentials or broad accounts are imported by this PR.
3. Validate a real SharePoint text file: preview → choose mission → import → run → change source → refresh → verify the previous source-backed rule pauses → review its replacement. Check a denied/revoked account too. OAuth and real provider responses have not been exercised here.
4. Review the commercial rates and allowances in `src/lib/billing/rates.ts` and `task-quote.ts`. Current Solo/Business included-task allowances apply per workspace and Stripe subscription period. Decide whether a future multi-workspace offer needs a tenant-wide pool before selling it. Quote shown before launch is the maximum task charge; allowance eligibility is resolved on acceptance.
5. Configure Stripe test keys, price IDs, webhook secret, and a public `ORBIS_APP_URL`. Subscribe the webhook to subscription created/updated/deleted and Checkout completed/expired/async_payment_succeeded/async_payment_failed. Resync existing subscriptions so `current_period_start` is populated before relying on included allowances.
6. Keep `ORBIS_TASK_BILLING_ENABLED=false` until test-mode checks succeed. Enable it in staging to check preview vs paid consent, inclusion/overflow, double acceptance, double payment clicks, Checkout cancellation and replayed/out-of-order webhooks. Review invoices, applicable taxes and commercial terms separately; this Checkout implementation does not configure automatic tax. No live payment was made.
7. Enable the operational worker with its scoped workspace identity, provider configuration and budget. New paid tasks require a newly confirmed paid quote; toggling the flag does not retroactively change queued task consent.
8. Activate optional PostHog separately using `customer-value-posthog.md`. Its export uses allowlisted event properties, not knowledge content, source URLs, or session recordings. Processing duration, time-to-ready, review effort and estimated savings are distinct; user effort is an approximation, never a billing input.

## Deliberate limits / follow-up work

- Text import only: UTF-8 .txt/.md/.csv, Google Docs text exports and simple Notion blocks; maximum 2 MB and 20,000 characters. PDF/Office extraction, OCR, nested Notion content, Notion API-version migration and shared-drive discovery are not implemented. The UI explains this instead of silently dropping unsupported content.
- Imported files are snapshots, not a background sync or a mirror of individual SharePoint ACLs. Workspace members can read them. Automatic refresh jobs, narrower group-level document permissions and full database connectors remain follow-ups. An hour-old verification blocks a new run until refreshed.
- Remote binary downloads, when returned by the broker, use public HTTPS, DNS pinning per redirect, no forwarded credentials, a byte cap and a deadline. Actual broker response/redirect behavior still needs validation with a connected account.
- Search is lexical retrieval over selected text, not a vector index. Learning supports explicit rules and provenance, not autonomous self-training.
- Invoices contain an aggregate accepted-task line; Orbis retains task-level details. Refunds, chargebacks, credits, enterprise invoicing and automatic balance collection need separate lifecycle design.
- Delayed payments stay pending until confirmed. Failed asynchronous payments and ambiguous reservations older than 23 hours require administrator reconciliation against Stripe before any new attempt; do not manually clear a reservation without checking the provider. This protects against a second debit after an ambiguous response.
- `task_charges` uses tenant/workspace RLS. `task_payment_batches` follows the existing Stripe-table pattern: no browser role grants, explicit workspace/tenant predicates in APIs, and signed webhook access outside session scope. Review this boundary with production database roles.

## Verification

TypeScript and the existing test suite plus targeted billing/worker guards are checked locally. Tests use mocks for Stripe and database calls; they do not certify live provider behavior. Review real-account scenarios above before enabling payments for customers.
