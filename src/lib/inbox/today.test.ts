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
const entitlement = vi.hoisted(() => ({ canProcess: true }));
vi.mock("@/lib/billing/entitlements-store", () => ({
  currentEntitlement: vi.fn(async () => entitlement),
}));
import type { PoolClient } from "pg";
import {
  workspaceStorage,
  type WorkspaceContext,
} from "@/lib/platform/context";
import {
  inboxSettings,
  markTodaySeen,
  setContinuous,
  settingsSchema,
  todayDigest,
} from "./today";
import { DECIDED_AT_SQL } from "./decided";

const query = vi.fn();
const ctx: WorkspaceContext = {
  tenantId: "tenant-a",
  workspaceId: "ws-a",
  userId: "user-a",
  role: "owner",
  state: {} as WorkspaceContext["state"],
  db: { query } as unknown as PoolClient,
};
const inSession = <T>(fn: () => Promise<T>) => workspaceStorage.run(ctx, fn);
let firstRun: Record<string, unknown> | undefined;
let settingsRow: Record<string, unknown> | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  entitlement.canProcess = true;
  settingsRow = undefined;
  vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "500");
  firstRun = { provider: "gmail", connected_account_id: "acc" };
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("kind='first_run' AND status='completed'"))
      return { rows: firstRun ? [firstRun] : [] };
    if (sql.startsWith("SELECT max(received_at)"))
      return { rows: [{ cursor: new Date("2026-10-02T09:00:00Z") }] };
    if (sql.startsWith("SELECT continuous_enabled,provider"))
      return { rows: settingsRow ? [settingsRow] : [] };
    if (sql.includes("AS drafts"))
      return {
        rows: [{ drafts: "2", questions: "1", review: "0", skipped: "4" }],
      };
    return { rows: [], rowCount: 1 };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("continuous drafting toggle", () => {
  it("accepts only {continuousEnabled}", () => {
    expect(settingsSchema.safeParse({ continuousEnabled: true }).success).toBe(
      true,
    );
    expect(
      settingsSchema.safeParse({ continuousEnabled: true, tenantId: "x" })
        .success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({ continuousEnabled: true, monthlyCapCents: 1 })
        .success,
    ).toBe(false);
  });
  it("cannot be enabled before a completed first run", async () => {
    firstRun = undefined;
    await expect(inSession(() => setContinuous(true))).rejects.toMatchObject({
      status: 409,
    });
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).startsWith("INSERT INTO inbox_settings"),
      ),
    ).toBe(false);
  });
  it("enables for the first-run mailbox with the cursor at the newest handled message", async () => {
    await inSession(() => setContinuous(true));
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).startsWith("INSERT INTO inbox_settings"),
    )!;
    expect(insert[0]).not.toContain("monthly_cap_cents");
    expect(insert[1]).toEqual([
      "ws-a",
      "tenant-a",
      "gmail",
      "acc",
      15,
      new Date("2026-10-02T09:00:00Z"),
      "user-a",
    ]);
  });
  it("disables without touching the cursor", async () => {
    await inSession(() => setContinuous(false));
    const update = query.mock.calls.find(([sql]) =>
      String(sql).startsWith("UPDATE inbox_settings"),
    )!;
    expect(update[0]).toContain("continuous_enabled=false");
    expect(update[0]).not.toContain("cursor_at");
    expect(update[1]).toEqual(["ws-a", "tenant-a"]);
  });
});

describe("continuous drafting paused by the plan", () => {
  const on = {
    continuous_enabled: true,
    provider: "gmail",
    interval_minutes: 15,
    cursor_at: null,
    next_run_at: new Date("2026-11-26T09:15:00Z"),
    monthly_cap_cents: null,
  };
  it("says paused when continuous mode is on but the plan blocks processing (same gate as the dispatcher)", async () => {
    settingsRow = on;
    entitlement.canProcess = false;
    const view = await inSession(() => inboxSettings());
    expect(view.continuousEnabled).toBe(true);
    expect(view.paused).toBe(true);
  });
  it("is not paused while the plan allows processing, nor when continuous mode is off", async () => {
    settingsRow = on;
    expect((await inSession(() => inboxSettings())).paused).toBe(false);
    settingsRow = { ...on, continuous_enabled: false, next_run_at: null };
    entitlement.canProcess = false;
    expect((await inSession(() => inboxSettings())).paused).toBe(false);
  });
});

describe("today digest", () => {
  it("counts decisions since the last visit (default 7 days) for the session user only", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const digest = await inSession(() => todayDigest(now));
    expect(digest.since).toBe("2026-09-25T12:00:00.000Z");
    expect(digest.counts).toEqual({
      draftsReady: 2,
      questionsPending: 1,
      needsReview: 0,
      skipped: 4,
    });
    const visit = query.mock.calls.find(([sql]) =>
      String(sql).startsWith("SELECT seen_at"),
    )!;
    expect(visit[1]).toEqual(["ws-a", "tenant-a", "user-a"]);
    for (const [sql, params] of query.mock.calls)
      if (/inbox_(messages|batches|settings|visits)/.test(sql))
        expect(params.slice(0, 2)).toEqual(["ws-a", "tenant-a"]);
  });
  it("counts messages to check and skipped ones by when Orbi decided them, not by updated_at", async () => {
    await inSession(() => todayDigest(new Date("2026-10-02T12:00:00Z")));
    const [sql] = query.mock.calls.find(([q]) => String(q).includes("AS review"))!;
    for (const name of ["review", "skipped"]) {
      const line = String(sql).split("\n").find((l) => l.includes(`AS ${name}`))!;
      expect(line).toContain(`${DECIDED_AT_SQL}>$3`);
      expect(line).not.toContain("updated_at");
    }
    expect(String(sql)).not.toMatch(/tenant_id=\$2 AND updated_at/);
  });
  it("marks seen for the session user", async () => {
    await inSession(() => markTodaySeen());
    expect(query.mock.calls[0][1]).toEqual(["ws-a", "tenant-a", "user-a"]);
  });
});
