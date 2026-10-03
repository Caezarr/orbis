"use client";

import { useEffect, useRef, useState } from "react";
import type { PaidPlanKey, PlanOffer } from "@/lib/billing/plans";
import type { EntitlementView } from "@/lib/billing/view";
import { TaskLedger } from "@/components/product/TaskLedger";
import s from "./billing.module.css";

export type BillingData = {
  configured: boolean;
  canManage: boolean;
  hasCustomer: boolean;
  subscription: null | { plan: string; status: string; current_period_end?: string; cancel_at_period_end?: boolean };
  entitlement: EntitlementView | null;
  offers: PlanOffer[];
  trial: { days?: number; drafts: number; features: readonly string[] };
  taskBilling: boolean;
};

const LIVE = (status?: string) => !!status && !["canceled", "incomplete_expired"].includes(status);
const date = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;

function StatusPanel({ e }: { e: EntitlementView }) {
  const pct = e.draftsIncluded > 0 ? Math.min(100, Math.round((e.draftsUsed / e.draftsIncluded) * 100)) : 0;
  const headline =
    e.state === "trialing"
      ? e.trialStarted
        ? `Essai en cours : ${e.trialDaysRemaining ?? 0} jour${(e.trialDaysRemaining ?? 0) > 1 ? "s" : ""} et ${e.draftsRemaining} brouillon${e.draftsRemaining > 1 ? "s" : ""} restants`
        : "Essai gratuit disponible : il démarre au premier passage sur votre boîte mail"
      : e.state === "active"
        ? `Formule ${e.planLabel}`
        : e.state === "past_due"
          ? `Formule ${e.planLabel} : paiement en attente`
          : e.state === "canceled"
            ? "Abonnement résilié"
            : "Essai terminé";
  return (
    <section className={s.status} aria-label="Votre formule">
      <strong>{headline}</strong>
      {e.message && <p>{e.message}</p>}
      {(e.state === "active" || e.trialStarted) && (
        <>
          <p>
            {e.draftsUsed} / {e.draftsIncluded} brouillons utilisés
            {e.state === "active" && date(e.periodEnd) ? ` · renouvellement le ${date(e.periodEnd)}` : ""}
          </p>
          <div className={s.meter} aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
      {e.cancelAtPeriodEnd && date(e.periodEnd) && <p>Résiliation programmée : la formule reste active jusqu’au {date(e.periodEnd)}.</p>}
      {e.continuousPaused && <p>Les brouillons en continu sont en pause et reprendront automatiquement.</p>}
    </section>
  );
}

/** Pure render of the plans page (tests render it server-side). */
export function PlansView({
  data,
  busy = false,
  error = "",
  notice = "",
  onCheckout,
  onPortal,
}: {
  data: BillingData;
  busy?: boolean;
  error?: string;
  notice?: string;
  onCheckout?: (plan: PaidPlanKey) => void;
  onPortal?: () => void;
}) {
  const live = LIVE(data.subscription?.status);
  const current = data.entitlement?.plan;
  return (
    <div aria-busy={busy}>
      {notice && (
        <p className={s.status} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className={`${s.status} ${s.alert}`} role="alert">
          {error}
        </p>
      )}
      {data.entitlement && <StatusPanel e={data.entitlement} />}
      {data.canManage && data.hasCustomer && (
        <p>
          <button type="button" className={s.secondary} disabled={busy} onClick={onPortal}>
            Gérer l’abonnement, les factures ou résilier
          </button>
        </p>
      )}
      <div className={s.grid}>
        <article className={`${s.card} ${current === "trial" ? s.current : ""}`}>
          <h2>Essai gratuit</h2>
          <div className={s.price}>Gratuit</div>
          <p className={s.fine}>
            {data.trial.days} jours ou {data.trial.drafts} brouillons, au premier atteint. Sans carte bancaire.
          </p>
          <ul>
            {data.trial.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </article>
        {data.offers.map((offer) => {
          const available = offer.checkoutAvailable && data.configured && data.canManage && !live && !!onCheckout;
          return (
            <article key={offer.key} className={`${s.card} ${current === offer.key ? s.current : ""}`}>
              <h2>{offer.label}</h2>
              <div className={offer.price ? s.price : `${s.price} ${s.pending}`}>{offer.priceLabel}</div>
              <p className={s.fine}>{offer.description}</p>
              <ul>
                {offer.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {current === offer.key && live ? (
                <span className={s.fine}>Votre formule actuelle</span>
              ) : (
                <button
                  type="button"
                  className={s.primary}
                  disabled={busy || !available}
                  onClick={available ? () => onCheckout!(offer.key) : undefined}
                >
                  {!offer.checkoutAvailable ? "Bientôt disponible" : `Choisir ${offer.label}`}
                </button>
              )}
            </article>
          );
        })}
      </div>
      {!data.canManage && <p className={s.fine}>Seul un propriétaire ou un administrateur de l’espace peut souscrire ou modifier l’abonnement.</p>}
      {data.canManage && !data.configured && <p className={s.fine}>Le paiement en ligne n’est pas encore configuré sur ce déploiement.</p>}
      {data.canManage && live && <p className={s.fine}>Pour changer de formule ou résilier, passez par l’espace de facturation Stripe.</p>}
      <p className={s.fine}>
        Prix affichés depuis Stripe, au moment du paiement. Les brouillons comptent dans le quota de votre formule : ils ne sont jamais facturés à
        l’unité. Quand le quota est atteint, le traitement s’arrête proprement et reprend à la période suivante. Résiliable à tout moment, sans
        frais, depuis l’espace de facturation.
      </p>
    </div>
  );
}

export function SubscriptionPlans() {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  const request = useRef<{ plan: PaidPlanKey; id: string } | null>(null);

  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    // Returning from Stripe never activates a plan by itself: the webhook does.
    const timer = setTimeout(() => {
      if (checkout === "success")
        setNotice("Paiement transmis à Stripe. Votre formule s’active dès la confirmation de Stripe, en général en quelques secondes.");
      else if (checkout === "cancelled") setNotice("Paiement annulé. Rien n’a été facturé.");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/billing", { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Impossible de charger votre formule.");
        setData(body as BillingData);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Impossible de charger votre formule.");
      });
    return () => controller.abort();
  }, [retry]);

  async function open(kind: "checkout" | "portal", plan?: PaidPlanKey) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (plan && request.current?.plan !== plan) request.current = { plan, id: crypto.randomUUID() };
      const r = await fetch(`/api/v1/billing/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan ? { plan, requestId: request.current!.id } : {}),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Impossible d’ouvrir la page de paiement.");
      const url = new URL(body.url);
      if (url.protocol !== "https:" || !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname))
        throw new Error("Destination de paiement invalide.");
      window.location.assign(url.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible d’ouvrir la page de paiement.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!data)
    return error ? (
      <p role="alert" className={s.alert}>
        {error}{" "}
        <button type="button" className={s.secondary} onClick={() => setRetry((n) => n + 1)}>
          Réessayer
        </button>
      </p>
    ) : (
      <p role="status">Chargement de votre formule…</p>
    );
  return (
    <>
      <PlansView
        data={data}
        busy={busy}
        error={error}
        notice={notice}
        onCheckout={(plan) => void open("checkout", plan)}
        onPortal={() => void open("portal")}
      />
      {/* Accepted-task billing is not part of V1: shown only when explicitly enabled. */}
      {data.taskBilling && <TaskLedger />}
    </>
  );
}
