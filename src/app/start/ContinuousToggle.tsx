"use client";

import { useEffect, useState } from "react";
import s from "./start.module.css";

export type ContinuousSettings = {
  continuousEnabled: boolean;
  eligible: boolean;
  provider?: "gmail" | "outlook";
  intervalMinutes: number;
  nextRunAt?: string;
  lastCheckedAt?: string;
  monthlyCapCents: number | null;
  spentCents: number;
};

const time = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

/** Explicit opt-in for continuous drafting. Off by default; owner/admin only (enforced server-side). */
export function ContinuousToggle({
  initial,
  onChange,
}: {
  initial?: ContinuousSettings | null;
  onChange?: (settings: ContinuousSettings) => void;
}) {
  // Controlled when the parent passes settings (Today); otherwise self-loading (/start).
  const [fetched, setFetched] = useState<ContinuousSettings | null>(null);
  const settings = initial ?? fetched;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) return;
    let active = true;
    fetch("/api/v1/inbox/settings", { cache: "no-store" })
      .then(async (r) =>
        r.ok ? ((await r.json()) as ContinuousSettings) : null,
      )
      .then((value) => {
        if (active && value) setFetched(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initial]);

  if (!settings) return null;
  const on = settings.continuousEnabled;
  const minutes = settings.intervalMinutes;

  async function toggle() {
    if (saving || !settings) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/inbox/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ continuousEnabled: !on }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          response.status === 403
            ? "Seul un propriétaire ou un administrateur peut changer ce réglage."
            : ((body as { error?: string }).error ??
                "Le réglage n’a pas pu être enregistré. Réessayez."),
        );
        return;
      }
      if (!initial) setFetched(body as ContinuousSettings);
      onChange?.(body as ContinuousSettings);
    } catch {
      setError("Le réglage n’a pas pu être enregistré. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={s.aside} aria-label="Brouillons en continu">
      <div className={s.toggleRow}>
        <div className={s.toggleText}>
          <h3>Brouillons en continu</h3>
          <p>
            Orbi vérifie votre boîte toutes les {minutes} minutes et prépare des
            brouillons. Rien n’est envoyé.
          </p>
          {on && (
            <p className={s.fine}>
              {time(settings.lastCheckedAt)
                ? `Dernière vérification à ${time(settings.lastCheckedAt)}.`
                : "Première vérification dans les prochaines minutes."}
            </p>
          )}
          {!settings.eligible && !on && (
            <p className={s.fine}>
              Disponible après un premier passage terminé sur votre boîte mail.
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className={on ? s.primary : s.secondary}
          disabled={saving || (!on && !settings.eligible)}
          onClick={() => void toggle()}
        >
          {saving ? "Enregistrement…" : on ? "Activé — désactiver" : "Activer"}
        </button>
      </div>
      {error && (
        <p className={s.alert} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
