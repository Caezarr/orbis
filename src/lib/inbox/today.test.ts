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
import {
  workspaceStorage,
  type WorkspaceContext,
} from "@/lib/platform/context";
import {
  markTodaySeen,
  setContinuous,
  settingsSchema,
  todayDigest,
} from "./today";

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
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "500");
  firstRun = { provider: "gmail", connected_account_id: "acc" };
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("kind='first_run' AND status='completed'"))
      return { rows: firstRun ? [firstRun] : [] };
    if (sql.startsWith("SELECT max(received_at)"))
      return { rows: [{ cursor: new Date("2026-10-02T09:00:00Z") }] };
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
  it("marks seen for the session user", async () => {
    await inSession(() => markTodaySeen());
    expect(query.mock.calls[0][1]).toEqual(["ws-a", "tenant-a", "user-a"]);
  });
});
