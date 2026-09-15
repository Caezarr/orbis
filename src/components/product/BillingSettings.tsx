"use client";
import { useEffect, useRef, useState } from "react";
import { TaskPricing } from "./TaskPricing";
import { TaskLedger } from "./TaskLedger";
import s from "./workspace.module.css";
type Billing = {
  configured: boolean;
  canManage: boolean;
  hasCustomer?: boolean;
  subscription: null | { plan: string; status: string; seats: number };
};
export function BillingSettings() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const pending = useRef(false);
  const request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setError("Billing is taking too long to load. Try again.");
      controller.abort();
    }, 15000);
    fetch("/api/v1/billing", { signal: controller.signal })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok)
          throw new Error(result.error ?? "Could not load billing. Try again.");
        setBilling(result);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Could not load billing.");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [retry]);
  async function open(
    kind: "checkout" | "portal",
    selection?: { plan: "Solo" | "Business" | "Partner"; seats: number | null },
  ) {
    if (pending.current) return;
    if (selection?.plan === "Partner") {
      setError("Contact your Orbis account team to define your Partner setup.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const key = JSON.stringify(selection);
      if (request.current?.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      const r = await fetch(`/api/v1/billing/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selection, requestId: request.current!.id }),
      });
      const result = await r.json();
      if (!r.ok)
        throw new Error(result.error ?? "Could not open billing. Try again.");
      const url = new URL(result.url);
      if (
        url.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
      )
        throw new Error("Invalid payment destination.");
      window.location.assign(url.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open billing.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Billing" aria-busy={busy}>
      {error && (
        <p role="alert">
          {error}{" "}
          {!billing && (
            <button
              type="button"
              className={s.secondary}
              onClick={() => setRetry((n) => n + 1)}
            >
              Try again
            </button>
          )}
        </p>
      )}
      {!billing && !error && <p role="status">Loading billing…</p>}
      {billing && (
        <>
          {billing.subscription && (
            <p>
              {billing.subscription.plan} · {billing.subscription.seats} seats ·{" "}
              {billing.subscription.status}
            </p>
          )}
          {!billing.canManage && (
            <p>Your workspace owner or administrator manages billing.</p>
          )}
          {billing.canManage && !billing.configured && (
            <p>
              Payment setup is not complete. Your administrator needs to connect
              the billing configuration before checkout is available.
            </p>
          )}
          {billing.canManage && billing.hasCustomer && (
            <button
              type="button"
              disabled={busy}
              className={s.secondary}
              onClick={() => open("portal")}
            >
              Manage subscription and invoices
            </button>
          )}
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, margin: "24px 0" }}
          >
            <TaskPricing
              onSelectPlan={
                billing.configured && billing.canManage && !billing.subscription
                  ? (selection) => {
                      void open("checkout", selection);
                    }
                  : undefined
              }
            />
          </fieldset>
          {busy && <p role="status">Opening secure payment…</p>}
          <p>
            Only your confirmed subscription is shown here. Returning from
            checkout alone does not activate a plan.
          </p>
        </>
      )}
      <TaskLedger />
    </section>
  );
}
