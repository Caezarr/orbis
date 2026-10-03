"use client";

import { useEffect, useState } from "react";
import s from "./account.module.css";

type View = {
  calendarEnabled: boolean;
  labelsEnabled: boolean;
  timezone: "Europe/Paris" | "Europe/Brussels";
  provider?: "gmail" | "outlook";
  calendar: { available: boolean; provider?: "googlecalendar" | "outlookcalendar" };
  labels: { available: boolean; applied: number };
  canEdit: boolean;
};
const LABELS = [
  "Orbi · Devis",
  "Orbi · Client",
  "Orbi · Fournisseur",
  "Orbi · Admin",
  "Orbi · Brouillon prêt",
];
const CALENDAR_NAME = {
  googlecalendar: "Google Agenda",
  outlookcalendar: "l’agenda Outlook",
} as const;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Action impossible. Réessayez.");
  return body;
}

/**
 * Agenda et tri visible (docs/product/inbox-calendar-labels.md). Hidden when
 * inbox drafts are off or neither option exists on this deployment.
 */
export function InboxFeatureSettings() {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/v1/inbox/features")
      .then((r) => (r.ok ? (r.json() as Promise<View>) : null))
      .then((v) => live && setView(v))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!view || (!view.calendar.available && !view.labels.available)) return null;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }
  const update = (patch: Partial<Pick<View, "calendarEnabled" | "labelsEnabled" | "timezone">>) =>
    run(async () =>
      setView(await call<View>("/api/v1/inbox/features", { method: "PUT", body: JSON.stringify(patch) })),
    );
  const calendar = (action: "connect" | "verify") =>
    run(async () => {
      const result = await call<{ redirectUrl?: string; status?: string }>("/api/v1/inbox/features/calendar", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        return;
      }
      setMessage(
        result.status === "connected"
          ? "Agenda connecté."
          : result.status === "not_connected"
            ? "Aucun agenda connecté pour le moment."
            : "Vérification impossible pour le moment.",
      );
    });
  const cleanup = () =>
    run(async () => {
      let last = { remaining: 0, skippedRealInTestMode: 0 };
      for (let i = 0; i < 10; i++) {
        last = await call<{ remaining: number; skippedRealInTestMode: number; removed: number }>(
          "/api/v1/inbox/labels/cleanup",
          { method: "POST", body: "{}" },
        );
        if (!last.remaining || last.skippedRealInTestMode) break;
      }
      setView((v) => (v ? { ...v, labelsEnabled: false, labels: { ...v.labels, applied: last.remaining } } : v));
      setMessage(
        last.remaining
          ? `Libellés désactivés. ${last.remaining} message(s) restent à nettoyer : relancez le retrait.`
          : "Libellés désactivés et retirés de votre messagerie.",
      );
    });
  const disabled = busy || !view.canEdit;
  const calendarName = view.calendar.provider ? CALENDAR_NAME[view.calendar.provider] : "votre agenda";

  return (
    <section className={s.card} aria-labelledby="inbox-features-title" lang="fr">
      <h2 id="inbox-features-title">Agenda et tri dans votre messagerie</h2>
      {view.calendar.available && (
        <div className={s.block}>
          <h3>Proposer des créneaux depuis votre agenda</h3>
          <p>
            Quand un client demande un rendez-vous, une visite ou un appel, Orbi lit uniquement vos plages occupées
            et propose 2 ou 3 créneaux libres dans le brouillon, selon vos horaires. Aucun rendez-vous n’est créé.
            Sans agenda, le brouillon demande ses disponibilités au client.
          </p>
          <label className={s.fine}>
            <input
              type="checkbox"
              checked={view.calendarEnabled}
              disabled={disabled}
              onChange={(e) => update({ calendarEnabled: e.target.checked })}
            />{" "}
            Proposer des créneaux
          </label>
          <label className={s.fine}>
            Fuseau horaire{" "}
            <select
              value={view.timezone}
              disabled={disabled}
              onChange={(e) => update({ timezone: e.target.value as View["timezone"] })}
            >
              <option value="Europe/Paris">Paris</option>
              <option value="Europe/Brussels">Bruxelles</option>
            </select>
          </label>
          {view.calendarEnabled && view.canEdit && (
            <div>
              <button type="button" className={s.secondary} disabled={busy} onClick={() => calendar("connect")}>
                Connecter {calendarName}
              </button>{" "}
              <button type="button" className={s.secondary} disabled={busy} onClick={() => calendar("verify")}>
                Vérifier la connexion
              </button>
            </div>
          )}
        </div>
      )}
      {view.labels.available && (
        <div className={s.block}>
          <h3>Afficher le tri d’Orbi dans votre messagerie</h3>
          <p>
            Orbi ajoute ses libellés aux messages qu’il a triés : {LABELS.join(", ")}. Rien n’est déplacé, archivé ni
            supprimé, et vos propres libellés restent intacts. Vous pouvez tout retirer à tout moment.
          </p>
          <label className={s.fine}>
            <input
              type="checkbox"
              checked={view.labelsEnabled}
              disabled={disabled}
              onChange={(e) => update({ labelsEnabled: e.target.checked })}
            />{" "}
            Afficher les libellés Orbi
          </label>
          {view.canEdit && view.labels.applied > 0 && (
            <button type="button" className={s.secondary} disabled={busy} onClick={cleanup}>
              Retirer les libellés Orbi ({view.labels.applied})
            </button>
          )}
        </div>
      )}
      {!view.canEdit && <p className={s.fine}>Réservé au propriétaire et aux administrateurs.</p>}
      {message && <p className={s.fine}>{message}</p>}
      {error && (
        <p className={s.alert} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
