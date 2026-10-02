import { transaction } from "@/lib/platform/db";
import { inboxDraftsEnabled } from "@/lib/inbox/flags";
import { enqueueDueIncremental } from "@/lib/inbox/schedule";
import { runOneInboxBatch, type InboxWorkerDeps } from "./inbox-worker";
import { runOneBrainJob } from "@/lib/brain/worker";
import { scoped, type Identity } from "./worker";

/**
 * Multi-tenant inbox dispatcher: one bounded pass.
 *
 * 1. Discovery (no tenant context): `orbis_inbox_due_workspaces()` — a
 *    SECURITY DEFINER function owned by the NOLOGIN, NOBYPASSRLS role
 *    `orbis_inbox_dispatch` with column-level SELECT on scheduling columns only.
 *    It returns ids/counts/timestamps, never content (migration 008).
 * 2. Processing: for each workspace, everything else (poll enqueue, claim,
 *    workspace_state, messages, budget) runs through the worker `scoped()`
 *    transaction: app.* settings of THAT workspace + verified membership, under
 *    FORCE RLS. A forged or stale id can at worst process nothing.
 *
 * Fairness: oldest due first, round-robin (round r processes at most one batch
 * per workspace), at most `perWorkspace` batches per workspace and `maxBatches`
 * per pass. Exclusivity comes from the database (lease + FOR UPDATE SKIP LOCKED
 * + one running batch per workspace), so concurrent passes never process the
 * same batch. Time budget: no new batch/message starts after the deadline.
 */
export type DueWorkspace = {
  tenantId: string;
  workspaceId: string;
  workerUserId: string;
  dueBatches: number;
  pollDue: boolean;
  dueSince: Date | null;
  /** Company brain jobs due (extraction, regeneration); migration 009. */
  brainDue?: number;
};
export type DispatchOptions = {
  maxBatches?: number;
  perWorkspace?: number;
  maxWorkspaces?: number;
  /** Total wall-clock budget of the pass, ms. */
  budgetMs?: number;
  /** No new batch is started with less than this left; also the per-message stop margin. */
  reserveMs?: number;
};
export type DispatchResult = {
  workspaces: number;
  enqueued: number;
  processed: number;
  /** Company brain jobs processed in this pass (counted in maxBatches). */
  brainProcessed: number;
  yielded: number;
  errors: number;
  stoppedBy: "idle" | "max_batches" | "deadline" | "disabled";
  durationMs: number;
};
type ProcessOutcome = { processed: boolean; yielded?: boolean };
export type DispatchDeps = {
  discover?: (limit: number) => Promise<DueWorkspace[]>;
  enqueue?: (identity: Identity) => Promise<string | null>;
  runBatch?: (identity: Identity, deadline: number) => Promise<ProcessOutcome>;
  runBrain?: (identity: Identity, deadline: number) => Promise<ProcessOutcome>;
  inbox?: Omit<InboxWorkerDeps, "deadline">;
  clock?: () => number;
};

function envInt(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name]);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}
export function dispatchDefaults(): Required<DispatchOptions> {
  return {
    maxBatches: envInt("ORBIS_SCHEDULER_MAX_BATCHES", 10, 1, 200),
    perWorkspace: envInt("ORBIS_SCHEDULER_MAX_PER_WORKSPACE", 2, 1, 20),
    maxWorkspaces: envInt("ORBIS_SCHEDULER_MAX_WORKSPACES", 50, 1, 200),
    budgetMs: envInt("ORBIS_SCHEDULER_BUDGET_MS", 50_000, 5_000, 800_000),
    reserveMs: envInt("ORBIS_SCHEDULER_RESERVE_MS", 15_000, 0, 120_000),
  };
}

/** Ids only. Runs as the runtime role with no tenant context. */
export async function discoverDueWorkspaces(limit: number) {
  return transaction(async (db) => {
    const { rows } = await db.query<{
      tenant_id: string;
      workspace_id: string;
      worker_user_id: string;
      due_batches: number;
      poll_due: boolean;
      due_since: Date | null;
    }>(
      "SELECT tenant_id,workspace_id,worker_user_id,due_batches,poll_due,due_since FROM orbis_inbox_due_workspaces($1)",
      [limit],
    );
    const due = rows.map((r): DueWorkspace => ({
      tenantId: r.tenant_id,
      workspaceId: r.workspace_id,
      workerUserId: r.worker_user_id,
      dueBatches: Number(r.due_batches),
      pollDue: r.poll_due,
      dueSince: r.due_since,
    }));
    // Brain jobs: same ids-only discovery model (orbis_brain_due_workspaces, 009).
    const brain = (
      await db.query<{
        tenant_id: string;
        workspace_id: string;
        worker_user_id: string;
        due_jobs: number;
        due_since: Date | null;
      }>(
        "SELECT tenant_id,workspace_id,worker_user_id,due_jobs,due_since FROM orbis_brain_due_workspaces($1)",
        [limit],
      )
    ).rows;
    for (const r of brain) {
      const known = due.find(
        (d) => d.workspaceId === r.workspace_id && d.tenantId === r.tenant_id,
      );
      if (known) known.brainDue = Number(r.due_jobs);
      else if (due.length < limit)
        due.push({
          tenantId: r.tenant_id,
          workspaceId: r.workspace_id,
          workerUserId: r.worker_user_id,
          dueBatches: 0,
          pollDue: false,
          dueSince: r.due_since,
          brainDue: Number(r.due_jobs),
        });
    }
    return due;
  });
}

export async function dispatchInboxPass(
  options: DispatchOptions = {},
  deps: DispatchDeps = {},
): Promise<DispatchResult> {
  const opts = { ...dispatchDefaults(), ...options };
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const deadline = started + opts.budgetMs;
  const result: DispatchResult = {
    workspaces: 0,
    enqueued: 0,
    processed: 0,
    brainProcessed: 0,
    yielded: 0,
    errors: 0,
    stoppedBy: "idle",
    durationMs: 0,
  };
  const finish = (stoppedBy: DispatchResult["stoppedBy"]) => ({
    ...result,
    stoppedBy,
    durationMs: clock() - started,
  });
  if (!inboxDraftsEnabled()) return finish("disabled");
  const discover = deps.discover ?? discoverDueWorkspaces;
  const enqueue =
    deps.enqueue ??
    ((identity: Identity) =>
      scoped(identity, (db) => enqueueDueIncremental(db, identity)));
  const runBatch =
    deps.runBatch ??
    (async (identity: Identity, batchDeadline: number) => {
      const r = await runOneInboxBatch(identity, {
        ...deps.inbox,
        deadline: batchDeadline,
      });
      return {
        processed: r.processed,
        yielded: "stats" in r ? !!r.stats?.yielded : false,
      };
    });

  const runBrain =
    deps.runBrain ??
    (async (identity: Identity, jobDeadline: number) => {
      const r = await runOneBrainJob(identity, { deadline: jobDeadline });
      return {
        processed: r.processed,
        yielded: "stats" in r ? !!r.stats?.yielded : false,
      };
    });

  const due = await discover(opts.maxWorkspaces);
  result.workspaces = due.length;
  const active = due.map((ws) => ({
    ws,
    identity: {
      userId: ws.workerUserId,
      workspaceId: ws.workspaceId,
      tenantId: ws.tenantId,
    },
    done: 0,
    exhausted: false,
  }));
  const timeLeft = () => deadline - clock();
  for (let round = 0; round < opts.perWorkspace; round++) {
    let progressed = false;
    for (const entry of active) {
      if (entry.exhausted) continue;
      if (result.processed + result.brainProcessed >= opts.maxBatches)
        return finish("max_batches");
      if (timeLeft() < opts.reserveMs) return finish("deadline");
      try {
        if (round === 0 && (entry.ws.brainDue ?? 0) > 0) {
          // One brain job per workspace per pass, before its inbox batch.
          const brain = await runBrain(entry.identity, deadline - opts.reserveMs);
          if (brain.processed) {
            result.brainProcessed++;
            if (brain.yielded) {
              result.yielded++;
              return finish("deadline");
            }
            if (result.processed + result.brainProcessed >= opts.maxBatches)
              return finish("max_batches");
            if (timeLeft() < opts.reserveMs) return finish("deadline");
          }
        }
        if (round === 0 && entry.ws.pollDue && (await enqueue(entry.identity)))
          result.enqueued++;
        const outcome = await runBatch(
          entry.identity,
          deadline - opts.reserveMs,
        );
        if (!outcome.processed) {
          entry.exhausted = true;
          continue;
        }
        progressed = true;
        result.processed++;
        entry.done++;
        if (outcome.yielded) {
          // Out of time inside the batch: it is re-queued; stop the pass.
          result.yielded++;
          return finish("deadline");
        }
      } catch {
        // Isolation: one workspace's failure (membership revoked, provider
        // misconfigured) never blocks the others. No details are logged here.
        result.errors++;
        entry.exhausted = true;
      }
    }
    if (!progressed) break;
  }
  return finish("idle");
}
