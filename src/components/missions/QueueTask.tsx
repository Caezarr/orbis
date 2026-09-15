"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { businessWorkflows } from "@/lib/workflows/blueprints";
import type { TaskPriceSnapshot } from "@/lib/billing/task-quote";
import s from "./studio.module.css";
export function QueueTask({
  missionId,
  text,
}: {
  missionId: string;
  text: string;
}) {
  const router = useRouter();
  const [workflowId, setWorkflowId] = useState("");
  const [baseline, setBaseline] = useState("");
  const [offer, setOffer] = useState<{
    quote: TaskPriceSnapshot;
    text: string;
    workflowId: string;
    key: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  async function quote() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/operations?missionId=${encodeURIComponent(missionId)}&workflowId=${encodeURIComponent(workflowId)}`,
        { signal: AbortSignal.timeout(15000) },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not prepare a quote.");
      if (!result.quote)
        throw new Error("Connect your workspace database to queue tasks.");
      setOffer({
        quote: result.quote,
        text,
        workflowId,
        key: crypto.randomUUID(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare quote.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function enqueue() {
    if (
      !offer ||
      pending.current ||
      offer.text !== text ||
      offer.workflowId !== workflowId
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/operations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": offer.key,
        },
        body: JSON.stringify({
          missionId,
          workflowId,
          text,
          expectedTotalCents: offer.quote.totalCents,
          expectedRateVersion: offer.quote.rateVersion,
          ...(baseline ? { baselineMinutes: Number(baseline) } : {}),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not queue task.");
      router.push(`/tasks/${encodeURIComponent(result.id)}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not queue task. Retry uses the same request.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Queue a task">
      <h3>Prepare work in the background</h3>
      <label className={s.label}>
        How many minutes does this usually take you? (optional)
        <input
          type="number"
          min={1}
          max={10080}
          step={1}
          value={baseline}
          disabled={busy}
          onChange={(e) => {
            setBaseline(e.target.value);
            setOffer(null);
          }}
          placeholder="For example, 30"
        />
      </label>
      <p className={s.fine}>
        A saved task, a result to review, and a record in Today. This step
        prepares a document; it does not send or publish anything.
      </p>
      <label className={s.label}>
        Business workflow
        <select
          value={workflowId}
          disabled={busy}
          onChange={(e) => {
            setWorkflowId(e.target.value);
            setOffer(null);
          }}
        >
          <option value="">Choose the workflow</option>
          {businessWorkflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={s.primary}
        disabled={busy || !workflowId || text.trim().length < 10}
        onClick={() => void quote()}
      >
        Review task price
      </button>
      {offer && (
        <>
          <p>
            {new Intl.NumberFormat("en", {
              style: "currency",
              currency: "EUR",
            }).format(offer.quote.totalCents / 100)}{" "}
            per accepted result. Failed or cancelled tasks do not count.
          </p>
          <button
            type="button"
            className={s.primary}
            disabled={
              busy || offer.text !== text || offer.workflowId !== workflowId
            }
            onClick={() => void enqueue()}
          >
            Accept quote and queue task
          </button>
          {offer.text !== text && <p>Request changed. Review a new quote.</p>}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
