"use client";

import { useEffect, useState } from "react";
import s from "@/app/start/start.module.css";

type DigestSettings = {
  enabled: boolean;
  recipient?: string;
  canSubscribe: boolean;
  delivery: "simulated" | "unsupported";
  lastDay?: string;
};

/**
 * Daily digest opt-in for the signed-in user. Off by default; hidden when the
 * deployment has not enabled the digest (the settings route answers 503).
 */
export function DigestToggle() {
  const [settings, setSettings] = useState<DigestSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/digest/settings", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as DigestSettings) : null))
      .then((value) => {
        if (active && value) setSettings(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!settings) return null;
  const on = settings.enabled;

  async function toggle() {
    if (saving || !settings) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/digest/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !on }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          response.status === 403
            ? "Votre rôle dans cet espace ne permet pas de recevoir le résumé."
            : ((body as { error?: string }).error ?? "Le réglage n’a pas pu être enregistré. Réessayez."),
        );
        return;
      }
      setSettings(body as DigestSettings);
    } catch {
      setError("Le réglage n’a pas pu être enregistré. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={s.aside} aria-label="Résumé quotidien par e-mail">
      <div className={s.toggleRow}>
        <div className={s.toggleText}>
          <h3>Résumé quotidien par e-mail</h3>
          <p>
            Chaque matin, le nombre de brouillons à relire et de questions en attente. Aucun nom, aucun extrait de
            message dans l’e-mail. Pas d’e-mail les jours sans rien à relire.
          </p>
          {on && settings.recipient && <p className={s.fine}>Destinataire : {settings.recipient} (l’adresse de votre compte).</p>}
          {/* No real e-mail transport is built yet: say so instead of implying delivery. */}
          <p className={s.fine}>
            {settings.delivery === "simulated"
              ? "L’envoi n’est pas encore branché sur ce déploiement : le résumé est préparé chaque matin mais n’est pas envoyé."
              : "L’envoi est mal configuré sur ce déploiement : aucun résumé n’est envoyé."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className={on ? s.primary : s.secondary}
          disabled={saving || (!on && !settings.canSubscribe)}
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
