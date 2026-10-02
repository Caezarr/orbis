import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/platform/auth", () => ({
  PlatformError: class extends Error {
    constructor(
      message: string,
      public status = 500,
    ) {
      super(message);
    }
  },
}));
import type { PoolClient } from "pg";
import { workspaceStorage, type WorkspaceContext } from "@/lib/platform/context";
import { workspaceBudgetAllows } from "@/lib/inbox/store";
import {
  answerQuestion,
  answerSchema,
  factReviewSchema,
  regenerationSchema,
  requestRegeneration,
  reviewFact,
} from "./service";
import { recordDraftQuestions, reserveBrainBudget, saveCandidates } from "./store";
import { canonicalKey } from "./questions";

const query = vi.fn();
const db = { query } as unknown as PoolClient;
const ctx: WorkspaceContext = {
  tenantId: "tenant-a",
  workspaceId: "ws-a",
  userId: "user-a",
  role: "owner",
  state: { profile: null } as unknown as WorkspaceContext["state"],
  db,
};
const inSession = <T>(fn: () => Promise<T>) => workspaceStorage.run(ctx, fn);
const ids = { workspaceId: "ws-a", tenantId: "tenant-a" };
type Handler = (sql: string, params: unknown[]) => unknown;
let handler: Handler;
const sqls = () => query.mock.calls.map(([sql]) => String(sql));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "100");
  handler = () => undefined;
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    const r = handler(sql, params ?? []);
    return r ?? { rows: [], rowCount: 1 };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("budget enforcement", () => {
  it("brain model spend counts in the same monthly cap as tasks and inbox", async () => {
    handler = (sql) => (sql.includes("AS reserved") ? { rows: [{ reserved: "98" }] } : undefined);
    expect(await workspaceBudgetAllows(db, ids, 2)).toBe(true);
    expect(await workspaceBudgetAllows(db, ids, 3)).toBe(false);
    const spend = sqls().find((s) => s.includes("AS reserved"))!;
    expect(spend).toContain("FROM brain_usage");
    expect(spend).toContain("FROM inbox_messages");
    expect(spend).toContain("FROM operational_tasks");
  });
  it("no reservation row and no model call path when the cap is reached", async () => {
    handler = (sql) => (sql.includes("AS reserved") ? { rows: [{ reserved: "100" }] } : undefined);
    expect(await reserveBrainBudget(db, ids, "extract", "job", 3)).toBeNull();
    expect(sqls().some((s) => s.startsWith("INSERT INTO brain_usage"))).toBe(false);
  });
  it("without a configured cap nothing is reserved", async () => {
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "");
    expect(await reserveBrainBudget(db, ids, "extract", "job", 1)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});

describe("validation queue: nothing is approved automatically", () => {
  it("stores extracted/edit candidates with status 'candidate' only", async () => {
    await saveCandidates(
      db,
      ids,
      [
        {
          category: "pricing",
          topicKey: "prix",
          statement: "Pose 45 €",
          quotes: [{ quote: "pose 45 € HT", messageId: "m", sentAt: "2026-09-01T00:00:00.000Z" }],
          evidenceAt: "2026-09-01T00:00:00.000Z",
          confidence: 0.9,
          origin: "edit_diff",
        },
      ],
      { actor: "orbi" },
    );
    const insert = sqls().find((s) => s.startsWith("INSERT INTO brain_facts"))!;
    expect(insert).toContain("'candidate'");
    expect(insert).not.toContain("approved");
  });
  it("schemas are strict (no tenant, status or origin injection)", () => {
    expect(factReviewSchema.safeParse({ action: "approve", expectedVersion: 1, tenantId: "x" }).success).toBe(false);
    expect(factReviewSchema.safeParse({ action: "autoapply", expectedVersion: 1 }).success).toBe(false);
    expect(answerSchema.safeParse({ answer: "45 €", workspaceId: "x" }).success).toBe(false);
    expect(regenerationSchema.safeParse({ inboxMessageId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("one question, asked once", () => {
  const key = canonicalKey("prix de la pose au m²");
  it("a new placeholder creates one open question linked to its draft", async () => {
    handler = (sql) =>
      sql.startsWith("SELECT id,canonical_key,status FROM brain_questions") ? { rows: [] } :
      sql.startsWith("SELECT id FROM brain_questions") ? { rows: [{ id: "q-new" }] } : undefined;
    const r = await recordDraftQuestions(db, ids, "row-1", [{ canonicalKey: key, label: "prix de la pose au m²" }]);
    expect(r).toEqual({ created: 1, matched: 0, alreadyAnswered: 0 });
    expect(sqls().some((s) => s.startsWith("INSERT INTO brain_questions"))).toBe(true);
  });
  it("an answered question is matched (even reworded) and never re-asked", async () => {
    handler = (sql) =>
      sql.startsWith("SELECT id,canonical_key,status FROM brain_questions")
        ? { rows: [{ id: "q1", canonical_key: key, status: "answered" }] }
        : undefined;
    const r = await recordDraftQuestions(db, ids, "row-2", [
      { canonicalKey: canonicalKey("Quel est le tarif de pose par mètre carré ?"), label: "tarif pose" },
    ]);
    expect(r).toEqual({ created: 0, matched: 0, alreadyAnswered: 1 });
    expect(sqls().some((s) => s.startsWith("INSERT INTO brain_questions"))).toBe(false);
  });
  it("answering creates an APPROVED fact sourced from the user's answer and closes the question", async () => {
    handler = (sql) => {
      if (sql.startsWith("SELECT id,label,canonical_key,status FROM brain_questions"))
        return { rows: [{ id: "q1", label: "prix de la pose au m²", canonical_key: key, status: "open" }] };
      if (sql.startsWith("SELECT status FROM brain_questions")) return { rows: [{ status: "open" }] };
      return undefined;
    };
    const r = await inSession(() => answerQuestion("q1", { answer: "45 € HT/m²", conditional: false }));
    expect(r.category).toBe("pricing");
    const insert = query.mock.calls.find(([s]) => String(s).startsWith("INSERT INTO brain_facts"))!;
    expect(insert[0]).toContain("'approved','question_answer'");
    expect(insert[1]).toEqual(expect.arrayContaining(["ws-a", "tenant-a", "prix de la pose au m² : 45 € HT/m²", "q1", "user-a"]));
    const close = query.mock.calls.find(([s]) => String(s).startsWith("UPDATE brain_questions SET status='answered'"))!;
    expect(close[1]).toEqual(["q1", "ws-a", "tenant-a", r.factId, "user-a"]);
  });
  it("« ça dépend » stores the conditional text", async () => {
    handler = (sql) => {
      if (sql.startsWith("SELECT id,label,canonical_key,status FROM brain_questions"))
        return { rows: [{ id: "q1", label: "acompte demandé", canonical_key: "acompte", status: "open" }] };
      if (sql.startsWith("SELECT status FROM brain_questions")) return { rows: [{ status: "open" }] };
      return undefined;
    };
    await inSession(() => answerQuestion("q1", { answer: "30 % au-delà de 1 000 €", conditional: true }));
    const insert = query.mock.calls.find(([s]) => String(s).startsWith("INSERT INTO brain_facts"))!;
    expect(insert[1]).toEqual(expect.arrayContaining(["terms", "acompte demandé : ça dépend", "30 % au-delà de 1 000 €"]));
  });
  it("a closed question cannot be answered twice", async () => {
    handler = (sql) => {
      if (sql.startsWith("SELECT id,label,canonical_key,status FROM brain_questions"))
        return { rows: [{ id: "q1", label: "x", canonical_key: "x", status: "answered" }] };
      if (sql.startsWith("SELECT status FROM brain_questions")) return { rows: [{ status: "answered" }] };
      return undefined;
    };
    await expect(inSession(() => answerQuestion("q1", { answer: "y", conditional: false }))).rejects.toMatchObject({ status: 409 });
    expect(sqls().some((s) => s.startsWith("INSERT INTO brain_facts"))).toBe(false);
  });
});

describe("fact review", () => {
  const row = (over = {}) => ({ id: "f1", status: "candidate", version: 2, category: "pricing", topic_key: "prix", statement: "Pose 45 €", ...over });
  it("rejects stale versions", async () => {
    handler = (sql) => (sql.startsWith("SELECT id,status,version") ? { rows: [row()] } : undefined);
    await expect(inSession(() => reviewFact("f1", { action: "approve", expectedVersion: 1 }))).rejects.toMatchObject({ status: 409 });
  });
  it("approve (edited) supersedes the other versions of the topic", async () => {
    handler = (sql) => (sql.startsWith("SELECT id,status,version") ? { rows: [row()] } : sql.includes("SET status='superseded'") ? { rows: [{ id: "f0" }], rowCount: 1 } : undefined);
    const r = await inSession(() => reviewFact("f1", { action: "approve", statement: "Pose : 48 € HT/m²", expectedVersion: 2 }));
    expect(r).toMatchObject({ status: "approved", superseded: 1 });
    const approve = query.mock.calls.find(([s]) => String(s).includes("SET status='approved'"))!;
    expect(approve[1]).toEqual(["f1", "ws-a", "tenant-a", "Pose : 48 € HT/m²", "user-a", "approved_edited"]);
    expect(sqls().some((s) => s.includes("UPDATE brain_questions SET answered_fact_id"))).toBe(true);
  });
  it("reject clears the stored quotes and re-opens questions it answered", async () => {
    handler = (sql) => (sql.startsWith("SELECT id,status,version") ? { rows: [row({ status: "approved" })] } : undefined);
    await inSession(() => reviewFact("f1", { action: "reject", expectedVersion: 2 }));
    expect(sqls().find((s) => s.includes("SET status='rejected'"))).toContain("quotes='[]'::jsonb");
    expect(sqls().some((s) => s.startsWith("UPDATE brain_questions q SET status='open'"))).toBe(true);
  });
  it("only candidates can be approved", async () => {
    handler = (sql) => (sql.startsWith("SELECT id,status,version") ? { rows: [row({ status: "rejected" })] } : undefined);
    await expect(inSession(() => reviewFact("f1", { action: "approve", expectedVersion: 2 }))).rejects.toMatchObject({ status: 409 });
  });
});

describe("regeneration (new info available)", () => {
  const msg = { id: "11111111-1111-4111-8111-111111111111", provider: "gmail", connected_account_id: "acc", status: "drafted", draft_state: "created" };
  it("queues a NEW draft job; never deletes the old draft", async () => {
    handler = (sql) =>
      sql.startsWith("SELECT id,provider,connected_account_id") ? { rows: [msg] } :
      sql.includes("AS pending") ? { rows: [{ n: "0", pending: "0" }] } : undefined;
    const r = await inSession(() => requestRegeneration(msg.id));
    expect(r.notice).toMatch(/L’ancien brouillon reste/);
    expect(sqls().some((s) => s.startsWith("INSERT INTO brain_jobs") && s.includes("'regenerate_draft'"))).toBe(true);
    expect(sqls().some((s) => /\bDELETE\b/i.test(s))).toBe(false);
  });
  it("refuses while one is pending and after three", async () => {
    handler = (sql) =>
      sql.startsWith("SELECT id,provider,connected_account_id") ? { rows: [msg] } :
      sql.includes("AS pending") ? { rows: [{ n: "1", pending: "1" }] } : undefined;
    await expect(inSession(() => requestRegeneration(msg.id))).rejects.toMatchObject({ status: 409 });
    handler = (sql) =>
      sql.startsWith("SELECT id,provider,connected_account_id") ? { rows: [msg] } :
      sql.includes("AS pending") ? { rows: [{ n: "3", pending: "0" }] } : undefined;
    await expect(inSession(() => requestRegeneration(msg.id))).rejects.toMatchObject({ status: 409 });
  });
});
