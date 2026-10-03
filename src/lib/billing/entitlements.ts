import { planCatalog, type PaidPlanKey, type PlanDefinition, type PlanKey } from "./plans";

/**
 * Entitlement state machine (pure). Inputs are server-side facts only:
 * - the Stripe subscription row synced by the signature-verified webhook,
 * - the workspace trial row (started at the first mailbox batch),
 * - the number of reply drafts created in the current period.
 *
 * States: trialing → (expired | active); active ⇄ past_due; * → canceled.
 * "Quota reached" is not a state: the plan stays active/trialing with
 * `canProcess=false` and reason `quota_reached` until the next period/upgrade.
 */
export type EntitlementState = "trialing" | "active" | "past_due" | "canceled" | "expired";
export type BlockReason =
  | "trial_expired"
  | "trial_drafts_used"
  | "quota_reached"
  | "past_due"
  | "canceled";

export type SubscriptionFacts = {
  plan: PaidPlanKey;
  /** Raw Stripe subscription status. */
  status: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};
export type TrialFacts = {
  startedAt: Date;
  endsAt: Date;
  draftLimit: number;
};

export type PlanWindow = {
  state: EntitlementState;
  plan: PlanKey;
  /** Drafts are counted in [periodStart, periodEnd). Null start = trial not started. */
  periodStart: Date | null;
  periodEnd: Date | null;
  includedDrafts: number;
  monthlyCapCents: number;
  mailboxes: number;
  cancelAtPeriodEnd: boolean;
  /** Set when the plan itself forbids processing, whatever the usage. */
  blocked?: BlockReason;
};
export type Entitlement = PlanWindow & {
  draftsUsed: number;
  draftsRemaining: number;
  canProcess: boolean;
  reason?: BlockReason;
  /** Trial only: whole days left (0 on the last day). */
  trialDaysRemaining?: number;
};

const DAY = 86_400_000;
/** Stripe statuses that grant a paid plan. Stripe-side trials are not used but treated as paid. */
const PAID = new Set(["active", "trialing"]);
const UNPAID = new Set(["past_due", "unpaid"]);
const ENDED = new Set(["canceled", "incomplete_expired", "paused"]);

function addMonths(date: Date, months: number) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
/**
 * Current billing period. Stripe renews monthly; if the renewal webhook is late
 * (now past periodEnd while still active), roll forward whole months from the
 * known anchor so the quota resets on time instead of blocking the customer.
 */
export function currentPeriod(start: Date | null, end: Date | null, now: Date) {
  if (!start && !end) {
    const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { start: s, end: addMonths(s, 1) };
  }
  let s = start ?? addMonths(end!, -1);
  let e = end ?? addMonths(s, 1);
  for (let i = 0; e.getTime() <= now.getTime() && i < 120; i++) {
    s = e;
    e = addMonths(s, 1);
  }
  return { start: s, end: e };
}

export function planWindow(
  input: { subscription: SubscriptionFacts | null; trial: TrialFacts | null; now: Date },
  catalog: Readonly<Record<PlanKey, PlanDefinition>> = planCatalog(),
): PlanWindow {
  const { subscription, trial, now } = input;
  if (subscription && !(subscription.status === "incomplete")) {
    const plan = catalog[subscription.plan];
    const base = {
      plan: subscription.plan,
      includedDrafts: plan.includedDrafts,
      monthlyCapCents: plan.monthlyCapCents,
      mailboxes: plan.mailboxes,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
    if (PAID.has(subscription.status)) {
      const period = currentPeriod(subscription.periodStart, subscription.periodEnd, now);
      return { ...base, state: "active", periodStart: period.start, periodEnd: period.end };
    }
    if (UNPAID.has(subscription.status))
      return { ...base, state: "past_due", periodStart: subscription.periodStart, periodEnd: subscription.periodEnd, blocked: "past_due" };
    if (ENDED.has(subscription.status))
      return { ...base, state: "canceled", periodStart: subscription.periodStart, periodEnd: subscription.periodEnd, monthlyCapCents: 0, blocked: "canceled" };
    // Unknown future Stripe status: fail closed.
    return { ...base, state: "past_due", periodStart: subscription.periodStart, periodEnd: subscription.periodEnd, blocked: "past_due" };
  }
  const t = catalog.trial;
  if (!trial)
    return {
      state: "trialing",
      plan: "trial",
      periodStart: null,
      periodEnd: null,
      includedDrafts: t.includedDrafts,
      monthlyCapCents: t.monthlyCapCents,
      mailboxes: t.mailboxes,
      cancelAtPeriodEnd: false,
    };
  const window = {
    plan: "trial" as const,
    periodStart: trial.startedAt,
    periodEnd: trial.endsAt,
    // The limits recorded when the trial started win over later config changes.
    includedDrafts: trial.draftLimit,
    monthlyCapCents: t.monthlyCapCents,
    mailboxes: t.mailboxes,
    cancelAtPeriodEnd: false,
  };
  if (now.getTime() >= trial.endsAt.getTime()) return { ...window, state: "expired", blocked: "trial_expired" };
  return { ...window, state: "trialing" };
}

export function applyUsage(window: PlanWindow, draftsUsed: number, now: Date): Entitlement {
  const used = Math.max(0, Math.floor(draftsUsed));
  const remaining = Math.max(0, window.includedDrafts - used);
  let state = window.state;
  let reason = window.blocked;
  if (!reason && remaining === 0) {
    if (window.plan === "trial") {
      state = "expired";
      reason = "trial_drafts_used";
    } else reason = "quota_reached";
  }
  const entitlement: Entitlement = {
    ...window,
    state,
    draftsUsed: used,
    draftsRemaining: reason ? 0 : remaining,
    canProcess: !reason,
    ...(reason ? { reason } : {}),
  };
  if (window.plan === "trial") {
    entitlement.trialDaysRemaining = window.periodEnd
      ? Math.max(0, Math.ceil((window.periodEnd.getTime() - now.getTime()) / DAY))
      : (planCatalog().trial.trialDays ?? 0);
  }
  return entitlement;
}

export function resolveEntitlement(input: {
  subscription: SubscriptionFacts | null;
  trial: TrialFacts | null;
  draftsUsed: number;
  now: Date;
}, catalog?: Readonly<Record<PlanKey, PlanDefinition>>): Entitlement {
  return applyUsage(planWindow(input, catalog), input.draftsUsed, input.now);
}

/** Desired per-workspace monthly cap after a subscription change (null = leave unchanged). */
export function capForSubscription(status: string, plan: PaidPlanKey, catalog = planCatalog()): { capPlan: PaidPlanKey | "none"; cents: number } | null {
  if (PAID.has(status) || UNPAID.has(status)) return { capPlan: plan, cents: catalog[plan].monthlyCapCents };
  if (ENDED.has(status)) return { capPlan: "none", cents: 0 };
  return null; // incomplete: checkout not finished, keep the current (trial) cap.
}

/** French copy for a blocked entitlement (UI + API errors). */
export function blockMessage(reason: BlockReason): string {
  switch (reason) {
    case "trial_expired":
      return "Votre essai est terminé. Vos brouillons passés restent consultables ; choisissez une formule pour reprendre le traitement.";
    case "trial_drafts_used":
      return "Vous avez utilisé tous les brouillons de l’essai. Vos brouillons passés restent consultables ; choisissez une formule pour continuer.";
    case "quota_reached":
      return "Quota atteint : tous les brouillons inclus ce mois-ci ont été utilisés. Le traitement reprend à la prochaine période ou avec une formule supérieure.";
    case "past_due":
      return "Paiement en attente : aucun nouveau traitement tant que le paiement n’est pas régularisé. Vos brouillons passés restent consultables.";
    case "canceled":
      return "Abonnement résilié : aucun nouveau traitement. Vos brouillons passés restent consultables.";
  }
}

/** Enforcement can be disabled only explicitly (internal pilots without Stripe). */
export function entitlementsEnforced(env: Record<string, string | undefined> = process.env) {
  return env.ORBIS_ENTITLEMENTS_ENFORCED !== "false";
}

/**
 * Company brain jobs under the plan (V1 integration of #21 + #22).
 * - `regenerate_draft` creates a reply draft: it needs the same entitlement as
 *   an inbox draft (plan can process, at least one draft left) and the created
 *   draft counts in the draft quota (`countDrafts`).
 * - `extract_sent` (and the draft-vs-sent explanations) create no draft: they
 *   do not consume the draft quota, but their estimated cost is reserved in the
 *   same per-workspace cost cap. They still need a live plan: a paid plan whose
 *   drafts are used up may keep learning (`quota_reached`), an expired trial,
 *   unpaid or canceled plan may not (no model call).
 * Returns the blocking reason, or null when the job may run.
 */
export function brainJobBlock(
  entitlement: Pick<Entitlement, "canProcess" | "reason" | "draftsRemaining">,
  kind: "extract_sent" | "regenerate_draft",
): BlockReason | null {
  if (kind === "regenerate_draft")
    return entitlement.canProcess && entitlement.draftsRemaining >= 1
      ? null
      : (entitlement.reason ?? "quota_reached");
  if (entitlement.canProcess || entitlement.reason === "quota_reached") return null;
  return entitlement.reason ?? "canceled";
}
