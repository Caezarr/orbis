"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import s from "./workspace.module.css";
type Ledger = {
  enabled: boolean;
  canPay: boolean;
  dueCents: number;
  items: {
    task_id: string;
    title: string;
    quoted_cents: number;
    due_cents: number;
    disposition: string;
    payment_status: string | null;
    created_at: string;
  }[];
};
const money = (cents: number) =>
  new Intl.NumberFormat("en", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export function TaskLedger() {
  const [ledger, setLedger] = useState<Ledger | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refresh, setRefresh] = useState(0);
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/billing/tasks", { signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok)
          throw new Error(data.error ?? "Could not load task billing.");
        setLedger(data);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [refresh]);
  async function pay() {
    if (!ledger || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/billing/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedCents: ledger.dueCents }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Could not open payment.");
      const url = new URL(data.url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
        throw new Error("Invalid payment destination.");
      window.location.assign(url.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open payment.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={s.section} aria-label="Task billing">
      <h2>Your accepted tasks</h2>
      <p>
        One result, one charge. No token billing. Failed and cancelled tasks are
        not billed.
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className={s.secondary}
        disabled={busy}
        onClick={() => setRefresh((n) => n + 1)}
      >
        Refresh balance
      </button>
      {!ledger && !error && <p role="status">Loading task balance…</p>}
      {ledger && (
        <>
          <h3>{money(ledger.dueCents)} to pay</h3>
          {!ledger.enabled && (
            <p>
              Task payments are disabled. New tasks run in preview mode without
              a charge.
            </p>
          )}
          {ledger.enabled && ledger.canPay && ledger.dueCents > 0 && (
            <button
              type="button"
              className={s.primary}
              disabled={busy || ledger.dueCents < 50}
              onClick={() => void pay()}
            >
              {busy
                ? "Opening secure payment…"
                : `Review and pay ${money(ledger.dueCents)}`}
            </button>
          )}
          {ledger.dueCents > 0 && ledger.dueCents < 50 && (
            <p>Payment becomes available at €0.50.</p>
          )}
          {!ledger.canPay && (
            <p>Your workspace owner or administrator can settle the balance.</p>
          )}
          {!ledger.items.length && (
            <p>
              No accepted tasks yet. Your first accepted result will appear
              here.
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {ledger.items.map((item) => (
              <li
                key={item.task_id}
                className={s.row}
                style={{ flexWrap: "wrap", gap: 12 }}
              >
                <Link
                  href={`/tasks/${encodeURIComponent(item.task_id)}`}
                  style={{ flex: "1 1 220px" }}
                >
                  {item.title}
                </Link>
                <span>
                  {item.disposition === "preview"
                    ? "Preview · no charge"
                    : item.disposition === "included"
                      ? "Included in your plan"
                      : item.payment_status === "paid"
                        ? "Paid"
                        : item.payment_status === "pending"
                          ? "Payment processing"
                          : "Awaiting payment"}
                </span>
                <strong>{money(item.due_cents)}</strong>
              </li>
            ))}
          </ul>
          <p>
            <small>
              Latest 100 accepted results. Balance includes all unpaid results.
              Payment is confirmed by Stripe, not by returning from checkout.
            </small>
          </p>
        </>
      )}
    </section>
  );
}
