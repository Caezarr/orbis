"use client";
import { useState } from "react";
import s from "./workspace.module.css";
export function RentalPreview() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    reservations: {
      id: number;
      arrivalDate: string;
      departureDate: string;
      status: string;
    }[];
    possiblyMore: boolean;
  } | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setPreview(null);
    const listingId = Number(new FormData(e.currentTarget).get("listingId"));
    try {
      const r = await fetch("/api/v1/workflows/rental-operations/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message);
      setPreview(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.section}>
      <h2>Verify a real property</h2>
      <p>
        Read up to 50 reservations from an administrator-approved Hostaway
        property. No messages, bookings or tasks are changed.
      </p>
      <form onSubmit={submit} className="mt-4">
        <label>
          Hostaway property ID
          <input type="number" name="listingId" required min={1} step={1} />
        </label>
        <button disabled={busy} className={s.secondary + " mt-4"}>
          {busy ? "Reading reservations…" : "Read reservation preview"}
        </button>
      </form>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {preview && (
        <div role="status">
          {preview.reservations.length ? (
            preview.reservations.map((r) => (
              <div className={s.row} key={r.id}>
                <strong>Reservation {r.id}</strong>
                <p>
                  {r.arrivalDate} → {r.departureDate} · {r.status}
                </p>
              </div>
            ))
          ) : (
            <p>No reservations were returned for this property.</p>
          )}
          {preview.possiblyMore && (
            <p>
              More reservations may exist. This preview is not a complete
              portfolio sync.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
