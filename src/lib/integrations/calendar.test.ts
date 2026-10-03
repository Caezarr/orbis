import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Composio } from "@composio/core";
import {
  assertCalendarPolicy,
  buildCalendarArguments,
  CALENDAR_POLICY,
  CALENDAR_TOOLS,
  calendarClient,
  CalendarPolicyError,
  normalizeBusy,
} from "./calendar";

const from = new Date("2026-10-03T08:00:00Z");
const to = new Date("2026-10-20T08:00:00Z");

describe("calendar policy (read-only free/busy)", () => {
  it("has no write operation and refuses event-writing slugs", () => {
    expect(CALENDAR_POLICY.externalWrites).toEqual([]);
    expect(CALENDAR_POLICY.createEvents).toBe(false);
    for (const slug of [
      "GOOGLECALENDAR_CREATE_EVENT",
      "GOOGLECALENDAR_QUICK_ADD",
      "GOOGLECALENDAR_PATCH_EVENT",
      "GOOGLECALENDAR_DELETE_EVENT",
      "OUTLOOK_CALENDAR_CREATE_EVENT",
      "OUTLOOK_SEND_EMAIL",
    ])
      expect(() => assertCalendarPolicy("googlecalendar", "free_busy", slug)).toThrow(CalendarPolicyError);
    expect(() => assertCalendarPolicy("outlookcalendar", "create_event" as never, "X")).toThrow(CalendarPolicyError);
    expect(Object.isFrozen(CALENDAR_TOOLS)).toBe(true);
  });
  it("builds bounded arguments from code only", () => {
    expect(buildCalendarArguments("googlecalendar", "free_busy", { from, to })).toEqual({
      items: ["primary"],
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone: "UTC",
    });
    const outlook = buildCalendarArguments("outlookcalendar", "free_busy", { from, to });
    expect(outlook.select).toEqual(["start", "end", "showAs", "isCancelled", "isAllDay"]);
    expect(JSON.stringify(outlook)).not.toMatch(/subject|body|attendees|location/);
    expect(() =>
      buildCalendarArguments("googlecalendar", "free_busy", { from, to: new Date(from.getTime() + 30 * 86_400_000) }),
    ).toThrow();
    expect(() => buildCalendarArguments("googlecalendar", "free_busy", { from: to, to: from })).toThrow();
  });
});

describe("normalizeBusy fails closed", () => {
  it("parses Google free/busy", () => {
    const r = normalizeBusy("googlecalendar", {
      calendars: { primary: { busy: [{ start: "2026-10-05T07:00:00Z", end: "2026-10-05T08:00:00Z" }] } },
    });
    expect(r.busy).toEqual([{ start: Date.parse("2026-10-05T07:00:00Z"), end: Date.parse("2026-10-05T08:00:00Z") }]);
  });
  it("parses Outlook calendarView, skipping free and cancelled events", () => {
    const r = normalizeBusy("outlookcalendar", {
      value: [
        { start: { dateTime: "2026-10-05T07:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-10-05T08:00:00.0000000", timeZone: "UTC" }, showAs: "busy" },
        { start: { dateTime: "2026-10-05T09:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-10-05T10:00:00.0000000", timeZone: "UTC" }, showAs: "free" },
        { start: { dateTime: "2026-10-05T11:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-10-05T12:00:00.0000000", timeZone: "UTC" }, isCancelled: true },
      ],
    });
    expect(r.busy).toEqual([{ start: Date.parse("2026-10-05T07:00:00Z"), end: Date.parse("2026-10-05T08:00:00Z") }]);
  });
  it.each([
    [{}],
    [{ calendars: { primary: { errors: [{ reason: "notFound" }], busy: [] } } }],
    [{ calendars: { primary: { busy: [{ start: "nope", end: "x" }] } } }],
  ])("throws on unknown or error shapes (%#)", (data) => {
    expect(() => normalizeBusy("googlecalendar", data)).toThrow();
  });
  it("refuses an Outlook event in an unknown time zone rather than guessing", () => {
    expect(() =>
      normalizeBusy("outlookcalendar", {
        value: [{ start: { dateTime: "2026-10-05T07:00:00", timeZone: "Romance Standard Time" }, end: { dateTime: "2026-10-05T08:00:00", timeZone: "Romance Standard Time" } }],
      }),
    ).toThrow();
  });
});

describe("calendarClient", () => {
  beforeEach(() => {
    vi.stubEnv("COMPOSIO_API_KEY", "key");
    vi.stubEnv("COMPOSIO_AUTH_CONFIG_GOOGLECALENDAR", "ac_cal");
    vi.stubEnv("COMPOSIO_TOOL_VERSION_GOOGLECALENDAR", "20261001_00");
  });
  afterEach(() => vi.unstubAllEnvs());
  function sdk(data: unknown, account = "ca_1") {
    const execute = vi.fn(async () => ({ successful: true, data }));
    return {
      execute,
      sdk: {
        authConfigs: { get: vi.fn(async () => ({ status: "ENABLED", toolkit: { slug: "googlecalendar" } })) },
        connectedAccounts: {
          list: vi.fn(async () => ({
            items: [{ id: account, status: "ACTIVE", isDisabled: false, authConfig: { id: "ac_cal", isDisabled: false }, toolkit: { slug: "googlecalendar" } }],
          })),
        },
        tools: {
          getRawComposioToolBySlug: vi.fn(async (slug: string) => ({ slug, toolkit: { slug: "googlecalendar" }, version: "20261001_00" })),
          execute,
        },
      } as unknown as Composio,
    };
  }
  it("reads free/busy with the workspace user and pinned version, never another slug", async () => {
    const { sdk: client, execute } = sdk({ calendars: { primary: { busy: [] } } });
    const cal = calendarClient("googlecalendar", { tenantId: "t", workspaceId: "w", connectedAccountId: "ca_1" }, { sdk: client });
    await expect(cal.freeBusy({ from, to })).resolves.toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
    const [slug, body] = execute.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(slug).toBe("GOOGLECALENDAR_FREE_BUSY_QUERY");
    expect(body).toMatchObject({ userId: "orbis:t:w", connectedAccountId: "ca_1", version: "20261001_00" });
  });
  it("refuses an account of another workspace (cross-tenant)", async () => {
    const { sdk: client, execute } = sdk({ calendars: { primary: { busy: [] } } }, "ca_other");
    const cal = calendarClient("googlecalendar", { tenantId: "t", workspaceId: "w", connectedAccountId: "ca_1" }, { sdk: client });
    await expect(cal.freeBusy({ from, to })).rejects.toThrow(CalendarPolicyError);
    expect(execute).not.toHaveBeenCalled();
  });
  it("is not configured without a pinned version", () => {
    vi.stubEnv("COMPOSIO_TOOL_VERSION_GOOGLECALENDAR", "latest");
    expect(() => calendarClient("googlecalendar", { tenantId: "t", workspaceId: "w", connectedAccountId: "c" })).toThrow(CalendarPolicyError);
  });
});
