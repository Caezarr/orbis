import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  advanceCursor,
  CURSOR_OVERLAP_MS,
  enqueueDueIncremental,
  incrementalSince,
  nextCursor,
  slotRequestKey,
  windowDaysFor,
} from "./schedule";

const identity = { userId: "u", workspaceId: "ws-a", tenantId: "tenant-a" };
const at = (iso: string) => new Date(iso);
const query = vi.fn();
const db = { query } as unknown as PoolClient;
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("cursor logic", () => {
  it("next batch starts at the cursor minus a small overlap", () => {
    const cursor = at("2026-10-02T10:00:00Z");
    expect(incrementalSince(cursor, at("2026-10-02T10:15:00Z")).getTime()).toBe(
      cursor.getTime() - CURSOR_OVERLAP_MS,
    );
    expect(
      windowDaysFor(at("2026-10-02T09:55:00Z"), at("2026-10-02T10:15:00Z")),
    ).toBe(1);
    expect(
      windowDaysFor(at("2026-01-01T00:00:00Z"), at("2026-10-02T00:00:00Z")),
    ).toBe(31);
  });
  it("advances to the newest message handled", () => {
    expect(
      nextCursor(
        [
          {
            received_at: at("2026-10-02T10:01:00Z"),
            status: "drafted",
            flags: [],
          },
          {
            received_at: at("2026-10-02T10:07:00Z"),
            status: "skipped",
            flags: [],
          },
          { received_at: null, status: "skipped", flags: [] },
        ],
        at("2026-10-02T10:00:00Z"),
      ),
    ).toEqual(at("2026-10-02T10:07:00Z"));
  });
  it("never moves backwards for an empty or older batch", () => {
    const current = at("2026-10-02T10:00:00Z");
    expect(nextCursor([], current)).toBe(current);
    expect(
      nextCursor(
        [
          {
            received_at: at("2026-10-02T09:58:00Z"),
            status: "drafted",
            flags: [],
          },
        ],
        current,
      ),
    ).toBe(current);
  });
  it("stays before messages that still need a pass (draft quota, uncertain draft)", () => {
    expect(
      nextCursor(
        [
          {
            received_at: at("2026-10-02T10:09:00Z"),
            status: "drafted",
            flags: [],
          },
          {
            received_at: at("2026-10-02T10:05:00Z"),
            status: "classified",
            flags: ["awaiting_draft_quota"],
          },
          {
            received_at: at("2026-10-02T10:06:00Z"),
            status: "uncertain",
            flags: [],
          },
        ],
        at("2026-10-02T10:00:00Z"),
      ),
    ).toEqual(new Date(at("2026-10-02T10:05:00Z").getTime() - 1));
  });
  it("one request key per account and slot", () => {
    const a = slotRequestKey("acc", at("2026-10-02T10:01:00Z"), 15);
    expect(slotRequestKey("acc", at("2026-10-02T10:14:59Z"), 15)).toBe(a);
    expect(slotRequestKey("acc", at("2026-10-02T10:15:00Z"), 15)).not.toBe(a);
  });
});

describe("enqueueDueIncremental", () => {
  const settings = {
    continuous_enabled: true,
    provider: "gmail",
    connected_account_id: "acc",
    interval_minutes: 15,
    cursor_at: at("2026-10-02T10:00:00Z"),
    next_run_at: at("2026-10-02T10:15:00Z"),
  };
  it("returns nothing when the workspace is not due (or not opted in)", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await enqueueDueIncremental(db, identity)).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      "continuous_enabled AND next_run_at<=$3",
    );
    expect(query.mock.calls[0][1].slice(0, 2)).toEqual(["ws-a", "tenant-a"]);
  });
  it("queues one incremental batch after the cursor and schedules the next poll", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT continuous_enabled"))
        return { rows: [settings] };
      if (sql.startsWith("SELECT 1 FROM inbox_batches"))
        return { rows: [], rowCount: 0 };
      if (sql.startsWith("INSERT INTO inbox_batches"))
        return { rows: [{ id: "new" }] };
      return { rows: [], rowCount: 1 };
    });
    const now = at("2026-10-02T10:16:00Z");
    expect(await enqueueDueIncremental(db, identity, now)).toBe("new");
    const insert = query.mock.calls.find(([sql]) =>
      sql.startsWith("INSERT INTO inbox_batches"),
    )!;
    expect(insert[0]).toContain("'incremental'");
    expect(insert[0]).toContain(
      "ON CONFLICT(workspace_id,request_key) DO NOTHING",
    );
    expect(insert[1]).toEqual(
      expect.arrayContaining([
        "ws-a",
        "tenant-a",
        "u",
        "gmail",
        "acc",
        slotRequestKey("acc", now, 15),
      ]),
    );
    expect(insert[1].at(-1)).toEqual(
      new Date(settings.cursor_at.getTime() - CURSOR_OVERLAP_MS),
    );
    const reschedule = query.mock.calls.find(([sql]) =>
      sql.startsWith("UPDATE inbox_settings SET next_run_at"),
    )!;
    expect(reschedule[1]).toEqual(["ws-a", "tenant-a", now, 15]);
  });
  it("does not stack a second incremental batch while one is pending", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT continuous_enabled"))
        return { rows: [settings] };
      if (sql.startsWith("SELECT 1 FROM inbox_batches"))
        return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    expect(await enqueueDueIncremental(db, identity)).toBeNull();
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
      false,
    );
    expect(
      query.mock.calls.some(([sql]) =>
        sql.startsWith("UPDATE inbox_settings SET next_run_at"),
      ),
    ).toBe(true);
  });
  it("advanceCursor only touches the settings of the batch's account, tenant-scoped", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT cursor_at"))
        return { rows: [{ cursor_at: settings.cursor_at }] };
      if (sql.startsWith("SELECT received_at"))
        return {
          rows: [
            {
              received_at: at("2026-10-02T10:12:00Z"),
              status: "drafted",
              flags: [],
            },
          ],
        };
      return { rows: [], rowCount: 1 };
    });
    expect(
      await advanceCursor(db, identity, {
        id: "b1",
        connectedAccountId: "acc",
      }),
    ).toEqual(at("2026-10-02T10:12:00Z"));
    for (const [, params] of query.mock.calls)
      expect(params.slice(0, 2)).toEqual(["ws-a", "tenant-a"]);
    const update = query.mock.calls.find(([sql]) =>
      sql.startsWith("UPDATE inbox_settings SET cursor_at"),
    )!;
    expect(update[1]).toEqual([
      "ws-a",
      "tenant-a",
      "acc",
      at("2026-10-02T10:12:00Z"),
    ]);
  });
});

describe("enqueueDueIncremental plan gate", () => {
  it("a refused plan gate queues nothing but still moves the schedule (no hot loop)", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("SELECT continuous_enabled"))
        return {
          rows: [
            {
              continuous_enabled: true,
              provider: "gmail",
              connected_account_id: "acc",
              interval_minutes: 15,
              cursor_at: null,
              next_run_at: new Date("2026-10-02T10:15:00Z"),
            },
          ],
        };
      return { rows: [], rowCount: 0 };
    });
    const allow = vi.fn(async () => false);
    expect(await enqueueDueIncremental(db, identity, new Date("2026-10-02T10:16:00Z"), { allow })).toBeNull();
    expect(allow).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("UPDATE inbox_settings SET next_run_at"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO inbox_batches"))).toBe(false);
    // continuous_enabled is not switched off: drafting resumes after upgrade/rollover.
    expect(query.mock.calls.some(([sql]) => sql.includes("continuous_enabled=false"))).toBe(false);
  });
});
