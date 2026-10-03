import { blockMessage, type BlockReason, type Entitlement, type EntitlementState } from "./entitlements";
import { planCatalog, type PlanKey } from "./plans";

/** Browser-safe entitlement summary (no ids, no Stripe objects). */
export type EntitlementView = {
  enforced: boolean;
  state: EntitlementState;
  plan: PlanKey;
  planLabel: string;
  canProcess: boolean;
  reason?: BlockReason;
  message?: string;
  draftsUsed: number;
  draftsIncluded: number;
  draftsRemaining: number;
  mailboxes: number;
  trialStarted: boolean;
  trialDaysRemaining?: number;
  periodEnd?: string;
  cancelAtPeriodEnd: boolean;
  /** Continuous drafting is on but cannot run (quota/plan). */
  continuousPaused: boolean;
};

export function entitlementView(e: Entitlement, extra: { enforced: boolean; continuousEnabled: boolean }): EntitlementView {
  return {
    enforced: extra.enforced,
    state: e.state,
    plan: e.plan,
    planLabel: planCatalog()[e.plan].label,
    canProcess: e.canProcess,
    ...(e.reason ? { reason: e.reason, message: blockMessage(e.reason) } : {}),
    draftsUsed: e.draftsUsed,
    draftsIncluded: e.includedDrafts,
    draftsRemaining: e.draftsRemaining,
    mailboxes: e.mailboxes,
    trialStarted: e.plan === "trial" && e.periodStart !== null,
    ...(e.trialDaysRemaining !== undefined ? { trialDaysRemaining: e.trialDaysRemaining } : {}),
    ...(e.periodEnd ? { periodEnd: e.periodEnd.toISOString() } : {}),
    cancelAtPeriodEnd: e.cancelAtPeriodEnd,
    continuousPaused: extra.continuousEnabled && !e.canProcess,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const date = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : null;

export type Banner = {
  tone: "info" | "warning" | "blocked";
  title: string;
  body?: string;
  /** Link to the plans page. */
  cta?: string;
};
/**
 * Trial / quota banner for Today and /start. Honest and quiet: nothing while a
 * paid plan has comfortable headroom; never a fake countdown.
 */
export function bannerFor(view: EntitlementView | null): Banner | null {
  if (!view || !view.enforced) return null;
  const paused = view.continuousPaused ? " Les brouillons en continu sont en pause." : "";
  if (!view.canProcess)
    return {
      tone: "blocked",
      title:
        view.reason === "quota_reached"
          ? `Quota atteint : ${view.draftsUsed}/${view.draftsIncluded} brouillons ce mois-ci.`
          : view.reason === "past_due"
            ? "Paiement en attente."
            : view.reason === "canceled"
              ? "Abonnement résilié."
              : "Essai terminé.",
      body:
        (view.reason === "quota_reached" && date(view.periodEnd)
          ? `Le traitement reprend le ${date(view.periodEnd)}, ou dès maintenant avec une formule supérieure.`
          : (view.message ?? "")) + paused,
      cta: view.reason === "past_due" || view.reason === "canceled" ? "Gérer mon abonnement" : "Choisir une formule",
    };
  if (view.plan === "trial") {
    const days = view.trialDaysRemaining ?? 0;
    return {
      tone: "info",
      title: view.trialStarted
        ? `Essai : ${plural(days, "jour")} / ${plural(view.draftsRemaining, "brouillon")} restant${view.draftsRemaining > 1 ? "s" : ""}`
        : `Essai gratuit : ${plural(days, "jour")} ou ${plural(view.draftsIncluded, "brouillon")}, au premier atteint`,
      body: view.trialStarted
        ? "L’essai s’arrête au premier des deux atteint. Rien n’est facturé sans votre accord."
        : "L’essai démarre au premier passage sur votre boîte mail. Sans carte bancaire.",
      cta: "Voir les formules",
    };
  }
  const low = view.draftsIncluded > 0 && view.draftsRemaining <= Math.max(5, Math.floor(view.draftsIncluded * 0.1));
  if (low)
    return {
      tone: "warning",
      title: `Plus que ${plural(view.draftsRemaining, "brouillon")} ce mois-ci (${view.draftsUsed}/${view.draftsIncluded}).`,
      body: date(view.periodEnd) ? `Le quota se renouvelle le ${date(view.periodEnd)}.` : undefined,
      cta: "Voir les formules",
    };
  if (view.cancelAtPeriodEnd && date(view.periodEnd))
    return { tone: "info", title: `Abonnement résilié : actif jusqu’au ${date(view.periodEnd)}.`, cta: "Gérer mon abonnement" };
  return null;
}
