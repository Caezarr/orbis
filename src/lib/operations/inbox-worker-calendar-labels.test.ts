import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), setTenant: vi.fn() }));
vi.mock("@/lib/platform/db", () => ({
  transaction: mock.transaction,
  setTenantContext: mock.setTenant,
}));
vi.mock("@/lib/runtime/provider", () => ({
  generationSettings: (n: number) => ({ maxOutputTokens: n }),
  providerStatus: () => ({ configured: true }),
  getModel: vi.fn(),
}));
vi.mock("@/lib/runtime/agent-engine", () => ({ contextSnapshot: vi.fn() }));
import type { MailMessage } from "@/lib/integrations/mailbox-normalize";
import { runOneInboxBatch } from "./inbox-worker";

const identity = { userId: "user", workspaceId: "ws-a", tenantId: "tenant-a" };
const claimed = {
  id: "batch-1",
  workspace_id: "ws-a",
  tenant_id: "tenant-a",
  kind: "first_run",
  provider: "outlook",
  connected_account_id: "account",
  mission_version: "inbox-replies@1",
  mode: "scoped_autonomy",
  window_days: 14,
  max_messages: 50,
  max_drafts: 5,
  attempts: 1,
  lease_token: "lease",
};
const meetingMail: MailMessage = {
  provider: "outlook",
  id: "m1",
  threadId: "t1",
  from: { address: "client@example.com" },
  replyTo: [],
  to: [],
  subject: "Visite",
  receivedAt: "2026-10-02T10:00:00.000Z",
  text: "Pouvez-vous passer voir le chantier ?",
  labels: [],
  headers: {},
  isDraft: false,
  fromOwner: false,
};
const createReplyDraft = vi.fn();
const mailbox = vi.fn();
const model = { classify: vi.fn(), draft: vi.fn() };
const calendarAccounts = vi.fn();
const freeBusy = vi.fn();
const calendar = vi.fn();
const setOrbiLabels = vi.fn();
const labels = vi.fn();
const entitlement = vi.fn();
let features: Record<string, unknown> | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ORBIS_INBOX_DRAFTS_ENABLED", "true");
  vi.stubEnv("ORBIS_OPERATIONS_MONTHLY_CAP_CENTS", "1000");
  features = { calendar_enabled: true, labels_enabled: true, timezone: "Europe/Brussels" };
  entitlement.mockResolvedValue({ canProcess: true, draftsRemaining: 10, plan: "trial", mailboxes: 1 });
  createReplyDraft.mockImplementation(async (input: { threadId: string; recipient: string }) => ({
    draftId: "d1",
    threadId: input.threadId,
    payloadHash: "h",
    policyHash: "p",
    simulated: false,
    reconciled: false,
    recipients: [input.recipient],
    created: true,
  }));
  mailbox.mockImplementation(() => ({
    listInbound: vi.fn(async () => [meetingMail]),
    listSent: vi.fn(async () => []),
    readThread: vi.fn(async () => [meetingMail]),
    createReplyDraft,
  }));
  model.classify.mockResolvedValue({ output: { classification: "quote_request", reason: "x" }, usage: { inputTokens: 1, outputTokens: 1 } });
  model.draft.mockResolvedValue({ output: { body: "Bonjour,\n\nAvec plaisir.\n\nCordialement", questions: [], citations: [] }, usage: { inputTokens: 1, outputTokens: 1 } });
  calendarAccounts.mockResolvedValue(["cal-1"]);
  freeBusy.mockResolvedValue([]);
  calendar.mockImplementation(() => ({ provider: "outlookcalendar", policyHash: "p", freeBusy }));
  labels.mockImplementation(() => ({ provider: "outlook", policyHash: "p", setOrbiLabels }));
  mock.transaction.mockImplementation((fn) => fn({ query: mock.query }));
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("SELECT 1 FROM memberships")) return { rowCount: 1, rows: [{}] };
    if (sql.startsWith("SELECT * FROM inbox_batches")) return { rows: [claimed] };
    if (sql.includes("attempts=attempts+1")) return { rows: [claimed] };
    if (sql.startsWith("SELECT calendar_enabled")) return { rows: features ? [features] : [] };
    if (sql.includes("SELECT id,status,classification FROM inbox_messages"))
      return { rows: [{ id: "row-1", status: "seen", classification: null }] };
    if (sql.includes("draft_state='none' RETURNING id")) return { rows: [{ id: "row-1" }], rowCount: 1 };
    if (sql.includes("LEFT JOIN inbox_labels"))
      return { rows: [{ id: "row-1", message_id: "m1", classification: "quote_request", status: "drafted", label_keys: null, state: null }] };
    if (sql.startsWith("SELECT state FROM workspace_state"))
      return {
        rows: [
          {
            state: {
              workspace: { id: "ws-a", tenantId: "tenant-a" },
              profile: null,
              sources: [],
              instructions: [],
              memory: [],
              missions: [],
              missionVersions: [],
            },
          },
        ],
      };
    if (sql.includes("reserved")) return { rows: [{ reserved: "0" }] };
    return { rows: [], rowCount: 1 };
  });
});
afterEach(() => vi.unstubAllEnvs());
const deps = () => ({ mailbox, model, calendarAccounts, calendar, labels, entitlement } as never);

describe("worker: calendar-aware drafts and visible triage", () => {
  it("flags off: no feature query, no calendar, no labels (unchanged behaviour)", async () => {
    await runOneInboxBatch(identity, deps());
    expect(mock.query.mock.calls.some(([sql]) => String(sql).includes("inbox_features"))).toBe(false);
    expect(calendarAccounts).not.toHaveBeenCalled();
    expect(labels).not.toHaveBeenCalled();
    expect(model.draft.mock.calls[0][0].meeting).toBeUndefined();
  });
  it("flags + opt-ins on: reads the workspace calendar, proposes slots, labels the message", async () => {
    vi.stubEnv("ORBIS_INBOX_CALENDAR", "true");
    vi.stubEnv("ORBIS_INBOX_LABELS", "true");
    await runOneInboxBatch(identity, deps());
    expect(calendarAccounts).toHaveBeenCalledWith("outlookcalendar", "tenant-a", "ws-a");
    expect(calendar).toHaveBeenCalledWith("outlookcalendar", { tenantId: "tenant-a", workspaceId: "ws-a", connectedAccountId: "cal-1" });
    expect(freeBusy).toHaveBeenCalledTimes(1);
    const meeting = model.draft.mock.calls[0][0].meeting;
    expect(meeting).toMatchObject({ mode: "slots", timezone: "Europe/Brussels", hoursAssumed: true });
    const body = createReplyDraft.mock.calls[0][0].body as string;
    for (const s of meeting.slots) expect(body).toContain(s.label);
    expect(labels).toHaveBeenCalledWith("outlook", { tenantId: "tenant-a", workspaceId: "ws-a", connectedAccountId: "account" });
    expect(setOrbiLabels).toHaveBeenCalledWith("m1", ["quote", "draft_ready"]);
    for (const [sql, params] of mock.query.mock.calls)
      if (/inbox_(features|labels)/.test(String(sql))) expect(params).toEqual(expect.arrayContaining(["ws-a", "tenant-a"]));
  });
  it("opt-ins off: asks the client for availabilities, never reads the calendar, no labels", async () => {
    vi.stubEnv("ORBIS_INBOX_CALENDAR", "true");
    vi.stubEnv("ORBIS_INBOX_LABELS", "true");
    features = undefined;
    await runOneInboxBatch(identity, deps());
    expect(calendarAccounts).not.toHaveBeenCalled();
    expect(model.draft.mock.calls[0][0].meeting).toMatchObject({ mode: "ask_availability", reason: "calendar_off" });
    expect(labels).not.toHaveBeenCalled();
  });
  it("a label failure never fails the batch", async () => {
    vi.stubEnv("ORBIS_INBOX_LABELS", "true");
    setOrbiLabels.mockRejectedValue(new Error("boom"));
    const result = await runOneInboxBatch(identity, deps());
    expect(result).toMatchObject({ processed: true, failure: null });
    expect(createReplyDraft).toHaveBeenCalledTimes(1);
  });
});
