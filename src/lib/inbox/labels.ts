import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { MailboxMode, MailboxProvider } from "@/lib/integrations/mailbox";
import {
  LABEL_POLICY_HASH,
  LabelPolicyError,
  ORBI_LABEL_KEYS,
  type LabelClient,
  type OrbiLabelKey,
} from "@/lib/integrations/mailbox-labels";
import type { Classification } from "@/lib/runtime/inbox-replies";

/*
 * Visible triage pass. Which labels a message gets is a pure function of its
 * schema-validated classification and draft status: the email text is never
 * read here, so a mail saying « label everything as spam » changes nothing.
 * Labels are applied only to messages Orbis processed, recorded in a ledger
 * (inbox_labels, migration 014) so they can be removed exactly (cleanup).
 */
const BY_CLASSIFICATION: Partial<Record<Classification, OrbiLabelKey>> = {
  quote_request: "quote",
  customer_request: "client",
  supplier: "supplier",
  admin: "admin",
};
export function labelsFor(row: {
  classification: Classification | string | null;
  status: string;
}): OrbiLabelKey[] {
  const keys: OrbiLabelKey[] = [];
  const main = BY_CLASSIFICATION[row.classification as Classification];
  if (main) keys.push(main);
  if (row.status === "drafted") keys.push("draft_ready");
  return keys.filter((k) => ORBI_LABEL_KEYS.includes(k));
}

export type LabelCandidate = {
  inboxMessageId: string;
  messageId: string;
  classification: string | null;
  status: string;
  /** Keys recorded as currently applied (ledger), [] when none. */
  appliedKeys: OrbiLabelKey[];
  /** Ledger state, null when never labelled. */
  state: string | null;
};
export type LabelLedgerRow = {
  id: string;
  provider: MailboxProvider;
  connectedAccountId: string;
  messageId: string;
  appliedKeys: OrbiLabelKey[];
  mode: MailboxMode;
};
export type LabelStore = {
  /** Classified messages of this account whose desired labels differ from the ledger. */
  candidates(limit: number): Promise<LabelCandidate[]>;
  /** Idempotent ledger write for one message (unique per account+message). */
  record(
    candidate: LabelCandidate,
    entry: {
      keys: OrbiLabelKey[];
      state: "applied" | "simulated" | "uncertain";
      idempotencyKey: string;
      payloadHash: string;
    },
  ): Promise<void>;
};
export type LabelStats = {
  labelled: number;
  unchanged: number;
  uncertain: number;
  simulated: boolean;
  policyError?: boolean;
  yielded?: boolean;
};

export const labelIdempotencyKey = (ids: {
  tenantId: string;
  workspaceId: string;
  connectedAccountId: string;
  messageId: string;
  keys: OrbiLabelKey[];
}) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        "inbox-labels",
        ids.tenantId,
        ids.workspaceId,
        ids.connectedAccountId,
        ids.messageId,
        [...ids.keys].sort(),
        LABEL_POLICY_HASH,
      ]),
    )
    .digest("hex");

/**
 * Applies Orbis labels to processed messages. Test mode records a simulation
 * and never calls the provider. A provider failure leaves the row `uncertain`
 * (set operations are idempotent, the next pass retries). A policy failure
 * stops the pass; it never affects drafts.
 */
export async function applyLabels(params: {
  ids: { tenantId: string; workspaceId: string; connectedAccountId: string };
  mode: MailboxMode;
  client: () => LabelClient;
  store: LabelStore;
  limit?: number;
  shouldYield?: () => boolean;
}): Promise<LabelStats> {
  const stats: LabelStats = {
    labelled: 0,
    unchanged: 0,
    uncertain: 0,
    simulated: params.mode === "test",
  };
  let client: LabelClient | null = null;
  for (const candidate of await params.store.candidates(params.limit ?? 50)) {
    if (params.shouldYield?.()) {
      stats.yielded = true;
      break;
    }
    const keys = labelsFor(candidate);
    const same =
      keys.length === candidate.appliedKeys.length &&
      keys.every((k) => candidate.appliedKeys.includes(k)) &&
      candidate.state !== "uncertain";
    const idempotencyKey = labelIdempotencyKey({
      ...params.ids,
      messageId: candidate.messageId,
      keys,
    });
    const payloadHash = createHash("sha256")
      .update(JSON.stringify([candidate.messageId, [...keys].sort()]))
      .digest("hex");
    if (same || (!keys.length && !candidate.appliedKeys.length)) {
      // Touch the ledger so this row is not re-selected until the message changes.
      if (candidate.state === "applied" || candidate.state === "simulated")
        await params.store.record(candidate, {
          keys,
          state: candidate.state,
          idempotencyKey,
          payloadHash,
        });
      stats.unchanged++;
      continue;
    }
    if (params.mode === "test") {
      await params.store.record(candidate, {
        keys,
        state: "simulated",
        idempotencyKey,
        payloadHash,
      });
      stats.labelled++;
      continue;
    }
    try {
      client ??= params.client();
      await client.setOrbiLabels(candidate.messageId, keys);
      await params.store.record(candidate, {
        keys,
        state: "applied",
        idempotencyKey,
        payloadHash,
      });
      stats.labelled++;
    } catch (error) {
      if (error instanceof LabelPolicyError) {
        stats.policyError = true;
        break;
      }
      await params.store
        .record(candidate, {
          keys: candidate.appliedKeys,
          state: "uncertain",
          idempotencyKey,
          payloadHash,
        })
        .catch(() => {});
      stats.uncertain++;
    }
  }
  return stats;
}

type Scoped = <T>(fn: (db: PoolClient) => Promise<T>) => Promise<T>;
type Ids = { workspaceId: string; tenantId: string };
const keysOf = (raw: unknown): OrbiLabelKey[] =>
  Array.isArray(raw)
    ? raw.filter((k): k is OrbiLabelKey => ORBI_LABEL_KEYS.includes(k as OrbiLabelKey))
    : [];

/** PostgreSQL LabelStore for one batch's account (worker, under the batch lease). */
export function postgresLabelStore(
  run: Scoped,
  ids: Ids & { provider: MailboxProvider; connectedAccountId: string; mode: MailboxMode },
): LabelStore {
  const p = [ids.workspaceId, ids.tenantId, ids.connectedAccountId];
  return {
    candidates: (limit) =>
      run(async (db) =>
        (
          await db.query<{
            id: string;
            message_id: string;
            classification: string | null;
            status: string;
            label_keys: unknown;
            state: string | null;
          }>(
            `SELECT m.id, m.message_id, m.classification, m.status, l.label_keys, l.state
             FROM inbox_messages m
             LEFT JOIN inbox_labels l ON l.workspace_id=m.workspace_id AND l.tenant_id=m.tenant_id
               AND l.connected_account_id=m.connected_account_id AND l.message_id=m.message_id
             WHERE m.workspace_id=$1 AND m.tenant_id=$2 AND m.connected_account_id=$3
               AND m.classification IS NOT NULL AND m.classification<>'noise' AND m.status IN ('classified','drafted','needs_review','skipped')
               AND m.updated_at > now() - interval '14 days'
               AND (l.id IS NULL OR l.state IN ('uncertain','applied','simulated'))
               AND (l.id IS NULL OR l.state='uncertain' OR l.updated_at < m.updated_at)
             ORDER BY m.updated_at DESC LIMIT $4`,
            [...p, Math.min(Math.max(limit, 1), 200)],
          )
        ).rows.map((r) => ({
          inboxMessageId: r.id,
          messageId: r.message_id,
          classification: r.classification,
          status: r.status,
          appliedKeys: keysOf(r.label_keys),
          state: r.state,
        })),
      ),
    record: (candidate, entry) =>
      run(async (db) => {
        await db.query(
          `INSERT INTO inbox_labels(id,workspace_id,tenant_id,provider,connected_account_id,message_id,inbox_message_id,label_keys,mode,state,idempotency_key,payload_hash,policy_hash,attempts,applied_at,updated_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,1,CASE WHEN $10 IN ('applied','simulated') THEN now() END,now())
           ON CONFLICT(workspace_id,connected_account_id,message_id) DO UPDATE SET
             label_keys=EXCLUDED.label_keys, mode=EXCLUDED.mode, state=EXCLUDED.state,
             idempotency_key=EXCLUDED.idempotency_key, payload_hash=EXCLUDED.payload_hash, policy_hash=EXCLUDED.policy_hash,
             attempts=inbox_labels.attempts+1, applied_at=COALESCE(EXCLUDED.applied_at,inbox_labels.applied_at),
             removed_at=NULL, updated_at=now()
           WHERE inbox_labels.tenant_id=EXCLUDED.tenant_id`,
          [
            randomUUID(),
            ids.workspaceId,
            ids.tenantId,
            ids.provider,
            ids.connectedAccountId,
            candidate.messageId,
            candidate.inboxMessageId,
            JSON.stringify(entry.keys),
            ids.mode,
            entry.state,
            entry.idempotencyKey,
            entry.payloadHash,
            LABEL_POLICY_HASH,
          ],
        );
      }),
  };
}

/* ------------------------------------------------------------------ */
/* Cleanup: remove every Orbis label Orbis applied (reversible opt-in).  */
/* ------------------------------------------------------------------ */
export type CleanupStore = {
  pending(limit: number): Promise<LabelLedgerRow[]>;
  markRemoved(id: string): Promise<void>;
  markUncertain(id: string): Promise<void>;
  remaining(): Promise<{ total: number; real: number }>;
};
export type CleanupResult = {
  removed: number;
  failed: number;
  /** Real (provider) labels left because the current mode is `test`. */
  skippedRealInTestMode: number;
  remaining: number;
};
/**
 * Bounded cleanup. Simulated rows are closed without a provider call. Real rows
 * are removed through the label broker only in `scoped_autonomy` (test mode
 * never writes to a mailbox, even to undo).
 */
export async function cleanupLabels(params: {
  mode: MailboxMode;
  client: (row: LabelLedgerRow) => LabelClient;
  store: CleanupStore;
  limit?: number;
  deadline?: number;
}): Promise<CleanupResult> {
  const result: CleanupResult = {
    removed: 0,
    failed: 0,
    skippedRealInTestMode: 0,
    remaining: 0,
  };
  const clients = new Map<string, LabelClient>();
  for (const row of await params.store.pending(params.limit ?? 25)) {
    if (params.deadline !== undefined && Date.now() >= params.deadline) break;
    if (row.mode === "test") {
      await params.store.markRemoved(row.id);
      result.removed++;
      continue;
    }
    if (params.mode === "test") {
      result.skippedRealInTestMode++;
      continue;
    }
    try {
      const key = `${row.provider}:${row.connectedAccountId}`;
      let client = clients.get(key);
      if (!client) {
        client = params.client(row);
        clients.set(key, client);
      }
      await client.setOrbiLabels(row.messageId, []);
      await params.store.markRemoved(row.id);
      result.removed++;
    } catch {
      await params.store.markUncertain(row.id).catch(() => {});
      result.failed++;
    }
  }
  result.remaining = (await params.store.remaining()).total;
  return result;
}

/** Session-scoped cleanup store (request handler, RLS + explicit filters). */
export function sessionCleanupStore(db: PoolClient, ids: Ids): CleanupStore {
  const p = [ids.workspaceId, ids.tenantId];
  return {
    async pending(limit) {
      return (
        await db.query<{
          id: string;
          provider: MailboxProvider;
          connected_account_id: string;
          message_id: string;
          label_keys: unknown;
          mode: MailboxMode;
        }>(
          `SELECT id,provider,connected_account_id,message_id,label_keys,mode FROM inbox_labels
           WHERE workspace_id=$1 AND tenant_id=$2 AND state IN ('applied','simulated','uncertain')
           ORDER BY (mode='test') DESC, updated_at LIMIT $3`,
          [...p, Math.min(Math.max(limit, 1), 100)],
        )
      ).rows
        .map((r) => ({
          id: r.id,
          provider: r.provider,
          connectedAccountId: r.connected_account_id,
          messageId: r.message_id,
          appliedKeys: keysOf(r.label_keys),
          mode: r.mode,
        }));
    },
    async markRemoved(id) {
      await db.query(
        "UPDATE inbox_labels SET state='removed', label_keys='[]'::jsonb, removed_at=now(), updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
        [id, ...p],
      );
    },
    async markUncertain(id) {
      await db.query(
        "UPDATE inbox_labels SET state='uncertain', attempts=attempts+1, updated_at=now() WHERE id=$1 AND workspace_id=$2 AND tenant_id=$3",
        [id, ...p],
      );
    },
    async remaining() {
      const row = (
        await db.query<{ total: string; real: string }>(
          `SELECT count(*)::text AS total, count(*) FILTER (WHERE mode<>'test')::text AS real FROM inbox_labels
           WHERE workspace_id=$1 AND tenant_id=$2 AND state IN ('applied','simulated','uncertain')`,
          p,
        )
      ).rows[0];
      return { total: Number(row?.total ?? 0), real: Number(row?.real ?? 0) };
    },
  };
}
