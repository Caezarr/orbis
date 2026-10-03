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
import {
  calendarAction,
  cleanupWorkspaceLabels,
  featuresSchema,
  featuresView,
  labelsFeatureEnabled,
  setFeatures,
} from "./features";

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
beforeEach(() => {
  vi.resetAllMocks();
  query.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM inbox_batches")) return { rows: [{ provider: "outlook" }] };
    if (sql.includes("count(*)")) return { rows: [{ n: "0", total: "0", real: "0" }] };
    return { rows: [], rowCount: 1 };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("features settings", () => {
  it("accepts only the three opt-in fields (no tenant, no provider)", () => {
    expect(featuresSchema.safeParse({ labelsEnabled: true }).success).toBe(true);
    expect(featuresSchema.safeParse({ timezone: "Europe/Brussels" }).success).toBe(true);
    expect(featuresSchema.safeParse({}).success).toBe(false);
    expect(featuresSchema.safeParse({ labelsEnabled: true, tenantId: "x" }).success).toBe(false);
    expect(featuresSchema.safeParse({ timezone: "America/New_York" }).success).toBe(false);
    expect(featuresSchema.safeParse({ calendarEnabled: true, calendarProvider: "x" }).success).toBe(false);
  });
  it("defaults off, and deployment flags gate everything", async () => {
    const view = await inSession(() => featuresView());
    expect(view).toMatchObject({ calendarEnabled: false, labelsEnabled: false, calendar: { available: false }, labels: { available: false } });
    await expect(inSession(() => setFeatures({ labelsEnabled: true }))).rejects.toMatchObject({ status: 409 });
    await expect(inSession(() => setFeatures({ calendarEnabled: true }))).rejects.toMatchObject({ status: 409 });
  });
  it("Gmail labels need their own flag (gmail.modify)", () => {
    vi.stubEnv("ORBIS_INBOX_LABELS", "true");
    expect(labelsFeatureEnabled("outlook")).toBe(true);
    expect(labelsFeatureEnabled("gmail")).toBe(false);
    vi.stubEnv("ORBIS_INBOX_LABELS_GMAIL", "true");
    expect(labelsFeatureEnabled("gmail")).toBe(true);
  });
  it("writes only the session workspace (tenant from session)", async () => {
    vi.stubEnv("ORBIS_INBOX_LABELS", "true");
    await inSession(() => setFeatures({ labelsEnabled: true }));
    const call = query.mock.calls.find(([sql]) => String(sql).startsWith("INSERT INTO inbox_features"))!;
    expect(call[1].slice(0, 2)).toEqual(["ws-a", "tenant-a"]);
    expect(call[1][5]).toBe("user-a");
    for (const [sql, params] of query.mock.calls)
      if (/inbox_(features|labels|batches)/.test(String(sql))) expect(params).toEqual(expect.arrayContaining(["ws-a", "tenant-a"]));
  });
  it("calendar provider is derived from the mailbox, never from the client", async () => {
    vi.stubEnv("ORBIS_INBOX_CALENDAR", "true");
    vi.stubEnv("COMPOSIO_API_KEY", "k");
    vi.stubEnv("COMPOSIO_AUTH_CONFIG_OUTLOOK_CALENDAR", "ac_cal");
    vi.stubEnv("COMPOSIO_TOOL_VERSION_OUTLOOK_CALENDAR", "20261002_00");
    const link = vi.fn(async () => ({ redirectUrl: "https://connect.composio.dev/x" }));
    const result = await inSession(() => calendarAction("connect", "https://app.test", { link }));
    expect(result).toMatchObject({ provider: "outlookcalendar" });
    expect(link).toHaveBeenCalledWith(
      "orbis:tenant-a:ws-a",
      { config: "ac_cal", toolkit: "outlook" },
      "https://app.test/settings?calendar=connected",
    );
    const accounts = vi.fn(async () => ["ca_1"]);
    await expect(inSession(() => calendarAction("verify", "https://app.test", { accounts }))).resolves.toMatchObject({ status: "connected" });
    expect(accounts).toHaveBeenCalledWith("outlookcalendar", "tenant-a", "ws-a");
  });
  it("cleanup turns labels off first, then only touches the session's ledger", async () => {
    await inSession(() => cleanupWorkspaceLabels("test"));
    const first = query.mock.calls[0];
    expect(String(first[0])).toMatch(/^UPDATE inbox_features SET labels_enabled=false/);
    expect(first[1]).toEqual(["ws-a", "tenant-a", "user-a"]);
    const select = query.mock.calls.find(([sql]) => String(sql).includes("FROM inbox_labels"))!;
    expect(select[1].slice(0, 2)).toEqual(["ws-a", "tenant-a"]);
  });
});
