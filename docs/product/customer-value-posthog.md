# Customer value and PostHog

The customer sees measurements in Analytics even when PostHog is disabled. Task records and effort measurements in PostgreSQL are the source of truth. PostHog receives a durable copy for product funnels.

## Definitions

- Processing: measured model preparation time for attempts that finish and still own their lease. Interrupted attempts are not measured; this is not infrastructure cost.
- Time to result: queue creation to result ready, including queue delays.
- Approval wait: result ready to acceptance, including time away.
- Active review: approximate browser time while focused, visible and active within the last 60 seconds. Heartbeats every 15 seconds and before a decision, cumulative per page session, monotonically upserted. Browser measurements are estimates, never billing input.
- Estimated saved time: client-entered manual minutes minus active review on accepted tasks with both measurements. Negative savings remain visible. Work outside Orbis is not measured. Coverage is displayed.
- Accepted task value: sum of accepted fixed quotes. Not a Stripe payment status.

## Enable after review

1. Apply migration 005 with `node --import tsx scripts/migrate.ts` using the migration role.
2. Create/select your PostHog project and region; set `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST` (EU default) and `POSTHOG_ENABLED=true` in deployment secrets.
3. Schedule `node --import tsx scripts/export-posthog.ts` with the three `ORBIS_WORKER_*` identifiers of an owner/admin per workspace. Each invocation sends up to 100 pending events. Monitor failures and backlog; repeat invocations to drain larger batches.

No browser SDK, cookies, autocapture, session replay, prompts, source excerpts, filenames, raw URLs or email addresses are sent. Actor IDs are scoped to the workspace and hashed. Operational events remain local until explicitly enabled. Select the appropriate analytics policy for your deployment before enabling export.

Delivery is at least once with a stable `$insert_id` for ingestion deduplication. Export failure rolls back exported markers and retains the batch. The external service is not contacted in the user's request. Exported rows remain locally until the deployment's retention policy removes them.

## Suggested PostHog dashboard

Activation funnel: `company_analyzed` → `workflow_installed` → `knowledge_selected` / `knowledge_source_added` → `task_queued` → `task_ready` → `task_accepted`.

Group/filter by hashed `workspace_id`; correlate task lifecycle using `task_id` and `workflow_id`. Track time to first accepted result, weekly returning workspaces, result acceptance, failed tasks, approval waiting time and API stage duration. The local Analytics page has the task-time aggregates; API duration is separate from user time. Failed requests are not currently exported as product events; use application error monitoring for them.

## Manual review path

Queue a task with a manual baseline → run operations worker → open its result → review for a minute → accept → inspect Analytics and the local `product_events` rows → run export → inspect PostHog Live Events. Repeat export: completed rows must not be resent. Verify no source content in event properties. Multi-tab/idle browser limitations mean time-savings estimates should be checked against client feedback.

Official endpoint contract: https://posthog.com/docs/api/capture
