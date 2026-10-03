import { z } from "zod";
import type { Composio } from "@composio/core";
import { hash } from "./action-broker";
import {
  BrokerPolicyError,
  pinnedConfig,
  verifiedExecutor,
  workspaceAccounts,
} from "./broker-exec";
import { authConfigId, integrationUser, toolkitSlug } from "./composio";
import { parseData } from "./mailbox-normalize";

/*
 * Calendar path of the broker: READ free/busy only. It never creates, moves,
 * answers or deletes an event (event creation is a later autonomy level).
 *   1. Closed, frozen tool map (one read operation per provider). Slugs never
 *      come from env, API input, email content or a model.
 *   2. assertCalendarPolicy() refuses any slug outside the map or matching a
 *      write pattern, at import time and on every call.
 *   3. Arguments are built by code from a bounded time window; no field comes
 *      from mail or model output. Outlook asks only for start/end/showAs (no
 *      subject, body, attendees or location).
 *   4. OAuth scopes are the minimal read scopes (docs/product/inbox-calendar-labels.md):
 *      Google `calendar.freebusy` (non-sensitive), Microsoft `Calendars.ReadBasic`.
 *
 * Tool slugs and arguments verified with the Composio CLI schemas (2026-10-03):
 *   GOOGLECALENDAR_FREE_BUSY_QUERY (googlecalendar 20261001_00)
 *   OUTLOOK_GET_CALENDAR_VIEW      (outlook 20261002_00)
 * Response shapes are parsed defensively; validate with a real account.
 */
export const calendarProviders = ["googlecalendar", "outlookcalendar"] as const;
export type CalendarProvider = (typeof calendarProviders)[number];
export type CalendarOperation = "free_busy";
export const CALENDAR_TOOLS: Readonly<
  Record<CalendarProvider, Readonly<Record<CalendarOperation, string>>>
> = Object.freeze({
  googlecalendar: Object.freeze({ free_busy: "GOOGLECALENDAR_FREE_BUSY_QUERY" }),
  outlookcalendar: Object.freeze({ free_busy: "OUTLOOK_GET_CALENDAR_VIEW" }),
});
const ALLOWED = new Set(
  Object.values(CALENDAR_TOOLS).flatMap((ops) => Object.values(ops)),
);
const FORBIDDEN_SLUG =
  /CREATE|INSERT|UPDATE|PATCH|DELETE|REMOVE|MOVE|QUICK_ADD|IMPORT|ACL|WATCH|CLEAR|DUPLICATE|SEND|RESPOND|ACCEPT|DECLINE|CANCEL|FORWARD|BATCH|MAIL|MESSAGE|DRAFT/;
export const CALENDAR_POLICY = {
  id: "calendar-freebusy-v1",
  allowedOperations: ["free_busy"] as CalendarOperation[],
  externalWrites: [] as CalendarOperation[],
  createEvents: false,
} as const;
export const CALENDAR_POLICY_HASH = hash({
  policy: CALENDAR_POLICY,
  tools: CALENDAR_TOOLS,
});
export class CalendarPolicyError extends Error {}

export function assertCalendarPolicy(
  provider: CalendarProvider,
  operation: CalendarOperation,
  slug: string,
) {
  if (!calendarProviders.includes(provider))
    throw new CalendarPolicyError("Unsupported calendar provider.");
  if (!CALENDAR_POLICY.allowedOperations.includes(operation))
    throw new CalendarPolicyError("Calendar operation is not allowed.");
  if (CALENDAR_TOOLS[provider][operation] !== slug || !ALLOWED.has(slug))
    throw new CalendarPolicyError("Calendar tool is not in the allowlist.");
  if (FORBIDDEN_SLUG.test(slug))
    throw new CalendarPolicyError("Calendar tool has a forbidden effect.");
}
for (const provider of calendarProviders)
  for (const [operation, slug] of Object.entries(CALENDAR_TOOLS[provider]))
    assertCalendarPolicy(provider, operation as CalendarOperation, slug);

/** At most three weeks are read per call (Graph/Google also bound the window). */
export const MAX_WINDOW_DAYS = 21;
const windowInput = z
  .object({ from: z.date(), to: z.date() })
  .strict()
  .refine(
    (w) =>
      w.to.getTime() > w.from.getTime() &&
      w.to.getTime() - w.from.getTime() <= MAX_WINDOW_DAYS * 86_400_000,
    "Invalid calendar window",
  );
const OUTLOOK_EVENT_FIELDS = ["start", "end", "showAs", "isCancelled", "isAllDay"];

export function buildCalendarArguments(
  provider: CalendarProvider,
  operation: CalendarOperation,
  input: { from: Date; to: Date; pageToken?: string },
): Record<string, unknown> {
  if (operation !== "free_busy")
    throw new CalendarPolicyError("Calendar operation is not allowed.");
  const { from, to } = windowInput.parse({ from: input.from, to: input.to });
  if (provider === "googlecalendar")
    return {
      items: ["primary"],
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone: "UTC",
    };
  const page =
    input.pageToken === undefined
      ? undefined
      : z.string().min(1).max(4096).parse(input.pageToken);
  return {
    user_id: "me",
    start_datetime: from.toISOString(),
    end_datetime: to.toISOString(),
    timezone: "UTC",
    select: OUTLOOK_EVENT_FIELDS,
    top: 250,
    page_token: page,
  };
}

export type BusyInterval = { start: number; end: number };
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
/** Graph returns `2026-10-07T08:00:00.0000000` (zone in a sibling field): UTC requested. */
function instant(raw: unknown, zone?: unknown) {
  if (typeof raw !== "string" || raw.length > 40) return NaN;
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const utc =
    !hasOffset && (zone === undefined || zone === "UTC" || zone === "")
      ? `${raw.replace(/(\.\d{3})\d*$/, "$1")}Z`
      : raw;
  if (!hasOffset && zone !== undefined && zone !== "UTC" && zone !== "")
    return NaN; // Unknown zone: refuse rather than guess.
  return Date.parse(utc);
}

/**
 * Busy intervals. Fails closed: an error entry, an unknown shape or an
 * unparseable interval throws (the caller then asks the client for their
 * availabilities instead of proposing possibly busy slots).
 */
export function normalizeBusy(provider: CalendarProvider, data: unknown) {
  const d = obj(parseData(data));
  const out: BusyInterval[] = [];
  if (provider === "googlecalendar") {
    const calendars = obj(d.calendars ?? obj(d.response_data).calendars);
    const primary = obj(
      calendars.primary ?? Object.values(calendars).find((c) => obj(c).busy),
    );
    if (Array.isArray(primary.errors) && primary.errors.length)
      throw new Error("calendar_error");
    if (!Array.isArray(primary.busy)) throw new Error("calendar_shape");
    for (const b of primary.busy) {
      const start = instant(obj(b).start);
      const end = instant(obj(b).end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
        throw new Error("calendar_shape");
      out.push({ start, end });
    }
    return { busy: out, nextPageToken: undefined };
  }
  const value = Array.isArray(d.value)
    ? d.value
    : Array.isArray(obj(d.response_data).value)
      ? (obj(d.response_data).value as unknown[])
      : Array.isArray(d.events)
        ? d.events
        : null;
  if (!value) throw new Error("calendar_shape");
  for (const raw of value) {
    const e = obj(raw);
    if (e.isCancelled === true) continue;
    const showAs = typeof e.showAs === "string" ? e.showAs.toLowerCase() : "busy";
    if (showAs === "free") continue;
    const start = instant(obj(e.start).dateTime, obj(e.start).timeZone);
    const end = instant(obj(e.end).dateTime, obj(e.end).timeZone);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
      throw new Error("calendar_shape");
    out.push({ start, end });
  }
  const next =
    d.next_page_token ?? d.nextPageToken ?? obj(d.response_data).next_page_token;
  return {
    busy: out,
    nextPageToken: typeof next === "string" && next ? next : undefined,
  };
}

function configuration(provider: CalendarProvider) {
  return provider === "googlecalendar"
    ? pinnedConfig({
        toolkit: toolkitSlug("googlecalendar"),
        config: authConfigId("googlecalendar"),
        version: process.env.COMPOSIO_TOOL_VERSION_GOOGLECALENDAR,
      })
    : pinnedConfig({
        // A separate auth config on the Outlook toolkit, so mail consent stays
        // unchanged and the calendar stays opt-in (Calendars.ReadBasic only).
        toolkit: process.env.COMPOSIO_TOOLKIT_OUTLOOK_CALENDAR?.trim() || "outlook",
        config: process.env.COMPOSIO_AUTH_CONFIG_OUTLOOK_CALENDAR,
        version:
          process.env.COMPOSIO_TOOL_VERSION_OUTLOOK_CALENDAR ||
          process.env.COMPOSIO_TOOL_VERSION_OUTLOOK,
      });
}
/** Server configuration presence only, not a verified connection. */
export function calendarConfigured(provider: CalendarProvider) {
  return configuration(provider) !== null;
}
/** Composio auth config + toolkit for the connect link (server-only). */
export function calendarAuth(provider: CalendarProvider) {
  const cfg = configuration(provider);
  return cfg ? { config: cfg.config, toolkit: cfg.toolkit } : null;
}
/** The calendar that goes with a mailbox provider. */
export const calendarFor = (mailbox: "gmail" | "outlook"): CalendarProvider =>
  mailbox === "gmail" ? "googlecalendar" : "outlookcalendar";

export async function workspaceCalendarAccounts(
  provider: CalendarProvider,
  tenantId: string,
  workspaceId: string,
  sdk?: Composio,
) {
  const cfg = configuration(provider);
  if (!cfg) throw new CalendarPolicyError("Calendar is not configured.");
  return workspaceAccounts(cfg, integrationUser(tenantId, workspaceId), sdk);
}

export type CalendarClient = {
  provider: CalendarProvider;
  policyHash: string;
  freeBusy(window: { from: Date; to: Date }): Promise<BusyInterval[]>;
};
export function calendarClient(
  provider: CalendarProvider,
  identity: { tenantId: string; workspaceId: string; connectedAccountId: string },
  options: { sdk?: Composio } = {},
): CalendarClient {
  const cfg = configuration(provider);
  if (!cfg) throw new CalendarPolicyError("Calendar is not configured.");
  const exec = verifiedExecutor(
    cfg,
    {
      userId: integrationUser(identity.tenantId, identity.workspaceId),
      connectedAccountId: identity.connectedAccountId,
    },
    options.sdk,
  );
  return {
    provider,
    policyHash: CALENDAR_POLICY_HASH,
    async freeBusy(window) {
      const slug = CALENDAR_TOOLS[provider].free_busy;
      const busy: BusyInterval[] = [];
      let pageToken: string | undefined;
      // Outlook pages; four pages of 250 events cover any realistic 3 weeks.
      for (let page = 0; page < 4; page++) {
        assertCalendarPolicy(provider, "free_busy", slug);
        const args = buildCalendarArguments(provider, "free_busy", {
          ...window,
          pageToken,
        });
        try {
          const { result } = await exec.execute(slug, args, { write: false });
          if (!result.successful) throw new Error("unsuccessful");
          const parsed = normalizeBusy(provider, result.data);
          busy.push(...parsed.busy);
          pageToken = parsed.nextPageToken;
        } catch (error) {
          if (
            error instanceof CalendarPolicyError ||
            error instanceof BrokerPolicyError
          )
            throw new CalendarPolicyError(error.message);
          throw new Error("Calendar read failed.");
        }
        if (!pageToken) return busy;
      }
      // Could not read the whole window: never claim it is free.
      throw new Error("Calendar read incomplete.");
    },
  };
}
