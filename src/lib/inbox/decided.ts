/**
 * When Orbi decided a message's current status, for "since …" counters (Today,
 * daily digest). `inbox_messages.updated_at` is not that time: the 30-day
 * preview purge, "Effacer le contact" and token bookkeeping bump it on rows
 * decided long ago, and a month-old "à vérifier" came back as new. Every
 * status change goes through the pipeline, which stamps the row with its
 * batch: the batch's completion time is when that decision was made.
 * A batch still running counts once it completes. Needs the alias `m`.
 */
export const DECIDED_AT_SQL =
  "(SELECT b.completed_at FROM inbox_batches b WHERE b.id=m.batch_id AND b.workspace_id=m.workspace_id AND b.tenant_id=m.tenant_id)";
