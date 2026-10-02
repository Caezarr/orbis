import { afterEach, describe, expect, it, vi } from "vitest";
import {
  capForSubscription,
  currentPeriod,
  entitlementsEnforced,
  planWindow,
  resolveEntitlement,
  type SubscriptionFacts,
  type TrialFacts,
} from "./entitlements";
import { ensureTrialStarted, loadEntitlement } from "./entitlements-store";
import { planCatalog } from "./plans";

const at = (iso: string) => new Date(iso);
const trial = (over: Partial<TrialFacts> = {}): TrialFacts => ({
  startedAt: at("2026-10-01T00:00:00Z"),
  endsAt: at("2026-10-15T00:00:00Z"),
  draftLimit: 50,
  ...over,
});
const sub = (over: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({
  plan: "solo",
  status: "active",
  periodStart: at("2026-10-05T00:00:00Z"),
  periodEnd: at("2026-11-05T00:00:00Z"),
  cancelAtPeriodEnd: false,
  ...over,
});
afterEach(() => vi.unstubAllEnvs());

describe("entitlement state machine", () => {
  it("offers a full trial before the first mailbox batch", () => {
    const e = resolveEntitlement({ subscription: null, trial: null, draftsUsed: 0, now: at("2026-10-01T00:00:00Z") });
    expect(e).toMatchObject({ state: "trialing", plan: "trial", canProcess: true, draftsRemaining: 50, trialDaysRemaining: 14, periodStart: null });
  });
  it("trial: counts days and drafts, whichever runs out first", () => {
    const now = at("2026-10-11T12:00:00Z");
    expect(resolveEntitlement({ subscription: null, trial: trial(), draftsUsed: 12, now })).toMatchObject({
      state: "trialing",
      canProcess: true,
      draftsRemaining: 38,
      trialDaysRemaining: 4,
    });
  });
  it("trial ends by days even with drafts left", () => {
    const e = resolveEntitlement({ subscription: null, trial: trial(), draftsUsed: 3, now: at("2026-10-15T00:00:00Z") });
    expect(e).toMatchObject({ state: "expired", reason: "trial_expired", canProcess: false, draftsRemaining: 0 });
  });
  it("trial ends by drafts even with days left", () => {
    const e = resolveEntitlement({ subscription: null, trial: trial(), draftsUsed: 50, now: at("2026-10-03T00:00:00Z") });
    expect(e).toMatchObject({ state: "expired", reason: "trial_drafts_used", canProcess: false });
  });
  it("a running trial keeps the limits recorded at its start", () => {
    vi.stubEnv("ORBIS_TRIAL_DRAFTS", "5");
    const e = resolveEntitlement({ subscription: null, trial: trial({ draftLimit: 50 }), draftsUsed: 10, now: at("2026-10-03T00:00:00Z") });
    expect(e).toMatchObject({ canProcess: true, includedDrafts: 50, draftsRemaining: 40 });
  });
  it("upgrade mid-trial: the paid period replaces the trial window immediately", () => {
    const now = at("2026-10-06T00:00:00Z");
    const w = planWindow({ subscription: sub(), trial: trial(), now });
    expect(w).toMatchObject({ state: "active", plan: "solo", periodStart: at("2026-10-05T00:00:00Z"), includedDrafts: 300 });
    // Trial drafts made before the subscription are not counted (count uses the paid window).
    expect(resolveEntitlement({ subscription: sub(), trial: trial(), draftsUsed: 0, now })).toMatchObject({ canProcess: true, draftsRemaining: 300 });
  });
  it("paid plan: quota reached keeps the plan active but stops processing", () => {
    const e = resolveEntitlement({ subscription: sub(), trial: null, draftsUsed: 300, now: at("2026-10-20T00:00:00Z") });
    expect(e).toMatchObject({ state: "active", canProcess: false, reason: "quota_reached", draftsRemaining: 0 });
  });
  it.each(["past_due", "unpaid"])("%s: read-only, no new processing", (status) => {
    const e = resolveEntitlement({ subscription: sub({ status }), trial: null, draftsUsed: 0, now: at("2026-10-20T00:00:00Z") });
    expect(e).toMatchObject({ state: "past_due", canProcess: false, reason: "past_due" });
  });
  it.each(["canceled", "incomplete_expired", "paused"])("%s: canceled, cap zero", (status) => {
    const e = resolveEntitlement({ subscription: sub({ status }), trial: trial(), draftsUsed: 0, now: at("2026-10-06T00:00:00Z") });
    expect(e).toMatchObject({ state: "canceled", canProcess: false, reason: "canceled", monthlyCapCents: 0 });
  });
  it("past_due → active again after payment (state follows the synced status)", () => {
    const now = at("2026-10-20T00:00:00Z");
    expect(resolveEntitlement({ subscription: sub({ status: "past_due" }), trial: null, draftsUsed: 0, now }).canProcess).toBe(false);
    expect(resolveEntitlement({ subscription: sub({ status: "active" }), trial: null, draftsUsed: 0, now }).canProcess).toBe(true);
  });
  it("incomplete checkout leaves the trial in place", () => {
    const e = resolveEntitlement({ subscription: sub({ status: "incomplete" }), trial: trial(), draftsUsed: 1, now: at("2026-10-03T00:00:00Z") });
    expect(e).toMatchObject({ state: "trialing", plan: "trial", canProcess: true });
  });
  it("unknown Stripe status fails closed", () => {
    expect(resolveEntitlement({ subscription: sub({ status: "something_new" }), trial: null, draftsUsed: 0, now: at("2026-10-06T00:00:00Z") }).canProcess).toBe(false);
  });
  it("cancel at period end stays active until Stripe ends it", () => {
    const e = resolveEntitlement({ subscription: sub({ cancelAtPeriodEnd: true }), trial: null, draftsUsed: 0, now: at("2026-10-06T00:00:00Z") });
    expect(e).toMatchObject({ state: "active", canProcess: true, cancelAtPeriodEnd: true });
  });
});

describe("period rollover", () => {
  it("uses the synced Stripe period while it is current", () => {
    expect(currentPeriod(at("2026-10-05T00:00:00Z"), at("2026-11-05T00:00:00Z"), at("2026-10-20T00:00:00Z"))).toEqual({
      start: at("2026-10-05T00:00:00Z"),
      end: at("2026-11-05T00:00:00Z"),
    });
  });
  it("rolls forward when the renewal webhook is late, so the quota resets on time", () => {
    const now = at("2026-11-06T00:00:00Z");
    const w = planWindow({ subscription: sub(), trial: null, now });
    expect(w.periodStart).toEqual(at("2026-11-05T00:00:00Z"));
    expect(w.periodEnd).toEqual(at("2026-12-05T00:00:00Z"));
    // 300 drafts last period do not block the new one.
    expect(resolveEntitlement({ subscription: sub(), trial: null, draftsUsed: 0, now }).canProcess).toBe(true);
  });
  it("clamps month ends (31 Jan → 28 Feb)", () => {
    expect(currentPeriod(at("2027-01-31T00:00:00Z"), null, at("2027-02-10T00:00:00Z")).end).toEqual(at("2027-02-28T00:00:00Z"));
  });
});

describe("plan caps", () => {
  it("maps subscription status to the cap to sync", () => {
    const catalog = planCatalog({ ORBIS_PLAN_SOLO_CAP_CENTS: "2500" });
    expect(capForSubscription("active", "solo", catalog)).toEqual({ capPlan: "solo", cents: 2500 });
    expect(capForSubscription("past_due", "solo", catalog)).toEqual({ capPlan: "solo", cents: 2500 });
    expect(capForSubscription("canceled", "equipe", catalog)).toEqual({ capPlan: "none", cents: 0 });
    expect(capForSubscription("incomplete", "solo", catalog)).toBeNull();
  });
  it("enforcement is on unless explicitly disabled", () => {
    expect(entitlementsEnforced({})).toBe(true);
    expect(entitlementsEnforced({ ORBIS_ENTITLEMENTS_ENFORCED: "false" })).toBe(false);
  });
});

describe("entitlement store (PostgreSQL adapter)", () => {
  it("counts drafts inside the current period only and reads the subscription by tenant", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT plan,status")) return { rows: [{ plan: "Business", status: "active", current_period_start: at("2026-10-05T00:00:00Z"), current_period_end: at("2026-11-05T00:00:00Z"), cancel_at_period_end: false }] };
      if (sql.startsWith("SELECT started_at")) return { rows: [] };
      if (sql.startsWith("SELECT count(*)")) return { rows: [{ n: "1500" }] };
      return { rows: [] };
    });
    const e = await loadEntitlement({ query } as never, { workspaceId: "ws", tenantId: "t" }, at("2026-10-20T00:00:00Z"));
    expect(e).toMatchObject({ plan: "equipe", state: "active", canProcess: false, reason: "quota_reached" });
    const count = query.mock.calls.find(([sql]) => sql.startsWith("SELECT count(*)")) as unknown as [string, unknown[]];
    expect(count[0]).toContain("draft_state IN ('created','simulated')");
    expect(count[1]).toEqual(["ws", "t", at("2026-10-05T00:00:00Z"), at("2026-11-05T00:00:00Z")]);
  });
  it("starts the trial once (insert-only) and applies the trial cap via the definer function", async () => {
    const query = vi.fn(async (sql: string) => (sql.startsWith("INSERT INTO billing_trials") ? { rowCount: 1, rows: [] } : { rowCount: 0, rows: [] }));
    expect(await ensureTrialStarted({ query } as never, { workspaceId: "ws", tenantId: "t" }, at("2026-10-01T00:00:00Z"))).toBe(true);
    const insert = query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO billing_trials")) as unknown as [string, unknown[]];
    expect(insert[0]).toContain("ON CONFLICT(workspace_id) DO NOTHING");
    expect(insert[1]).toEqual(["ws", "t", at("2026-10-01T00:00:00Z"), 14, 50, "v1-2026-10"]);
    const sync = query.mock.calls.find(([sql]) => sql.startsWith("SELECT orbis_sync_workspace_plan_cap")) as unknown as [string, unknown[]];
    expect(sync[1]).toEqual(["t", "trial", 800]);
    query.mockClear();
    query.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await ensureTrialStarted({ query } as never, { workspaceId: "ws", tenantId: "t" })).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.startsWith("SELECT orbis_sync"))).toBe(false);
  });
});
