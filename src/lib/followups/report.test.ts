import { describe, expect, it, vi } from "vitest";
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
import { countDrafts } from "@/lib/billing/entitlements-store";
import { workspaceBudgetAllows } from "@/lib/inbox/store";
import { workspaceStorage, type WorkspaceContext } from "@/lib/platform/context";
import { parisWeek } from "./calendar";
import { computeReport, loadReportInput, median, type ReportInput } from "./report";
import { actionSchema, csvCell, exportRequestsCsv, listSchema, settingsSchema } from "./service";

const week = parisWeek(new Date("2026-10-02T12:00:00Z"));
const base: ReportInput = {
  received: 40,
  classified: { customer_request: 8, quote_request: 6, supplier: 5, admin: 3, noise: 18 },
  draftsInbox: 12,
  draftsRegenerated: 1,
  followupsPrepared: 3,
  outcomes: { sent_as_is: 6, sent_edited: 3, not_used: 1, pending: 2 },
  questionsAnswered: 4,
  factsValidated: 7,
  requestsNew: 5,
  won: 1,
  lost: 0,
  responseDelaysMs: [30 * 60_000, 90 * 60_000, null, 10 * 60_000, null],
  replyBaselineMinutes: null,
};

describe("measured weekly report", () => {
  it("adds only measured counts", () => {
    const r = computeReport(base, week);
    expect(r.emails).toEqual({ received: 40, classified: 40, byClass: base.classified });
    expect(r.drafts).toEqual({ prepared: 16, inbox: 12, regenerated: 1, followups: 3 });
    expect(r.outcomes).toMatchObject({ measured: 10, asIsRate: 0.6, pending: 2 });
    expect(r.week).toEqual({ start: "2026-09-27T22:00:00.000Z", end: "2026-10-04T22:00:00.000Z", monday: "2026-09-28" });
  });
  it("median response time only over requests with both timestamps, with coverage", () => {
    const r = computeReport(base, week);
    expect(r.responseTime).toEqual({ medianMinutes: 30, measured: 3, total: 5, coverage: 0.6 });
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    const none = computeReport({ ...base, responseDelaysMs: [null, null] }, week);
    expect(none.responseTime).toEqual({ medianMinutes: null, measured: 0, total: 2, coverage: 0 });
    expect(computeReport({ ...base, responseDelaysMs: [] }, week).responseTime.coverage).toBeNull();
  });
  it("no time-saved figure without the owner's manual baseline; labelled estimate with it", () => {
    expect(computeReport(base, week).estimate).toBeNull();
    const r = computeReport({ ...base, replyBaselineMinutes: 8 }, week);
    expect(r.estimate).toMatchObject({ minutes: 48, baselineMinutes: 8, basis: 6 });
    expect(r.estimate!.label).toMatch(/^Estimation/);
    // Baseline but nothing sent as-is: still no figure.
    expect(computeReport({ ...base, replyBaselineMinutes: 8, outcomes: { ...base.outcomes, sent_as_is: 0 } }, week).estimate).toBeNull();
  });
  it("no rate when nothing was measured", () => {
    expect(computeReport({ ...base, outcomes: { sent_as_is: 0, sent_edited: 0, not_used: 0, pending: 3 } }, week).outcomes.asIsRate).toBeNull();
  });
  it("loads every count within [Monday 00:00, next Monday 00:00) Paris for the session workspace", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM pipeline_items WHERE workspace_id=$1 AND tenant_id=$2 AND first_customer_at"))
        return { rows: [{ first_customer_at: new Date("2026-09-29T08:00:00Z"), first_replied_at: new Date("2026-09-29T09:00:00Z") }, { first_customer_at: new Date("2026-09-30T08:00:00Z"), first_replied_at: null }] };
      return { rows: [{ n: "2", received: "5", sent_as_is: "1", won: "1", lost: "0" }] };
    });
    const input = await loadReportInput({ query } as never, { workspaceId: "w", tenantId: "t" }, week, null);
    for (const [, params] of query.mock.calls as unknown as [string, unknown[]][]) expect(params).toEqual(["w", "t", week.start, week.end]);
    const sqls = (query.mock.calls as unknown as [string][]).map(([s]) => s);
    expect(sqls.some((s) => s.includes("FROM followups") && s.includes("drafted_at>=$3 AND drafted_at<$4"))).toBe(true);
    expect(sqls.some((s) => s.includes("FROM brain_draft_outcomes"))).toBe(true);
    expect(input.responseDelaysMs).toEqual([3_600_000, null]);
    expect(input.requestsNew).toBe(2);
  });
});

describe("quota and cost cap include levels 6/7", () => {
  it("follow-up drafts count in the draft quota", async () => {
    const query = vi.fn(async () => ({ rows: [{ n: "3" }] }));
    await countDrafts({ query } as never, { workspaceId: "w", tenantId: "t" }, new Date(), null);
    expect(String((query.mock.calls[0] as unknown[])[0])).toMatch(/FROM followups WHERE .*draft_state IN \('created','simulated'\)/);
  });
  it("pipeline/follow-up model spend is summed into the same monthly cap", async () => {
    vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "100");
    const query = vi.fn(async (sql: string) => (sql.includes("AS reserved") ? { rows: [{ reserved: "99" }] } : { rows: [] }));
    expect(await workspaceBudgetAllows({ query } as never, { workspaceId: "w", tenantId: "t" }, 2)).toBe(false);
    expect(String((query.mock.calls as unknown as [string][]).find(([s]) => s.includes("AS reserved"))![0])).toContain("FROM pipeline_usage");
    vi.unstubAllEnvs();
  });
});

describe("session API contracts", () => {
  it("schemas are strict (no tenant, status injection or unknown action)", () => {
    expect(actionSchema.safeParse({ action: "won", tenantId: "x" }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "send" }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "snooze", days: 0 }).success).toBe(false);
    expect(actionSchema.safeParse({ action: "snooze", days: 7 }).success).toBe(true);
    expect(settingsSchema.safeParse({ followupsEnabled: true, businessDays: 0, maxStages: 2, replyBaselineMinutes: null }).success).toBe(false);
    expect(settingsSchema.safeParse({ followupsEnabled: true, businessDays: 5, maxStages: 3, replyBaselineMinutes: null }).success).toBe(false);
    expect(settingsSchema.safeParse({ followupsEnabled: true, businessDays: 5, maxStages: 2, replyBaselineMinutes: 10 }).success).toBe(true);
    expect(listSchema.safeParse({ status: "gagne", workspace: "x" }).success).toBe(false);
  });
  it("CSV cells are quoted and neutralize spreadsheet formulas", () => {
    expect(csvCell('Pose "chêne"')).toBe('"Pose ""chêne"""');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+33 6")).toBe("\"'+33 6\"");
    expect(csvCell(null)).toBe('""');
  });
  it("CSV export contains only the session workspace's rows (query scoped by session ids)", async () => {
    const query = vi.fn(async (sql: string) =>
      sql.startsWith("SELECT i.id")
        ? {
            rows: [
              {
                id: "i1",
                kind: "quote_request",
                status: "repondu",
                contact_name: "Claire",
                contact_email: "claire@client.test",
                contact_domain: "client.test",
                contact_erased_at: null,
                need_summary: "=cmd",
                budget_text: "3 000 €",
                deadline_text: null,
                extraction_state: "done",
                first_customer_at: new Date("2026-10-01T08:00:00Z"),
                first_replied_at: null,
                thread_id: "th",
                provider: "gmail",
                drafts: 1,
                followups: null,
              },
            ],
          }
        : { rows: [] },
    );
    const ctx = { tenantId: "t", workspaceId: "w", userId: "u", role: "owner", state: {}, db: { query } } as unknown as WorkspaceContext;
    const csv = await workspaceStorage.run(ctx, () => exportRequestsCsv());
    expect(csv.startsWith("﻿date_reception,statut")).toBe(true);
    expect(csv).toContain('"Claire","claire@client.test","\'=cmd","3 000 €"');
    for (const [, params] of query.mock.calls as unknown as [string, unknown[]][]) expect(params.slice(0, 2)).toEqual(["w", "t"]);
  });
});
