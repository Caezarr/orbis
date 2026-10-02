"use client";

import { useEffect, useState } from "react";
import { RequestsView, type Filters, type RequestAction, type RequestsData } from "./RequestsView";
import s from "./followups.module.css";

const DONE: Record<RequestAction["action"], string> = {
  won: "Demande marquée gagnée.",
  lost: "Demande marquée perdue.",
  reopen: "Demande rouverte.",
  snooze: "Relances en pause pendant 7 jours.",
  dismiss_followups: "Orbi ne proposera plus de relance pour cette demande.",
  resume_followups: "Relances reprises.",
  erase_contact: "Contact effacé. Les brouillons déjà dans votre boîte mail n’ont pas été modifiés.",
};

export function Requests() {
  const [data, setData] = useState<RequestsData | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
    fetch(`/api/v1/requests?${params}`, { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 503) return setUnavailable(true);
        if (!r.ok) throw new Error();
        setData((await r.json()) as RequestsData);
      })
      .catch(() => live && setError("Impossible de charger les demandes pour l’instant."));
    return () => {
      live = false;
    };
  }, [filters, reload]);

  async function act(id: string, action: RequestAction) {
    if (action.action === "erase_contact" && !window.confirm("Effacer le nom, l’adresse et le résumé de cette demande ? C’est définitif."))
      return;
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/v1/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? "Action impossible.");
      setNotice(DONE[action.action]);
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy(null);
    }
  }
  async function saveSettings(settings: RequestsData["settings"]) {
    setBusy("settings");
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/v1/requests/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followupsEnabled: settings.enabled,
          businessDays: settings.businessDays,
          maxStages: settings.maxStages,
          replyBaselineMinutes: settings.replyBaselineMinutes,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? "Enregistrement impossible.");
      setNotice("Réglages enregistrés.");
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(null);
    }
  }

  if (unavailable)
    return (
      <div className={`${s.root} ${s.page}`}>
        <header className={s.head}>
          <h1>Demandes</h1>
          <p>Les demandes s’activent avec les brouillons de réponse. Elles ne sont pas encore disponibles sur ce déploiement.</p>
        </header>
      </div>
    );
  if (!data)
    return (
      <div className={`${s.root} ${s.page}`}>
        {error ? (
          <p className={s.alert} role="alert">
            {error}
          </p>
        ) : (
          <p role="status">Chargement des demandes…</p>
        )}
      </div>
    );
  return (
    <RequestsView
      data={data}
      filters={filters}
      busy={busy}
      error={error}
      notice={notice}
      onFilter={setFilters}
      onAction={(id, a) => void act(id, a)}
      onSaveSettings={(v) => void saveSettings(v)}
    />
  );
}
