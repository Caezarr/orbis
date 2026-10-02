"use client";

import { useEffect, useState } from "react";
import { ReportView, type ReportData } from "./ReportView";
import s from "./followups.module.css";

export function Report() {
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await fetch(`/api/v1/report${week ? `?week=${week}` : ""}`, { cache: "no-store" });
        if (r.status === 503) return live && setUnavailable(true);
        if (!r.ok) throw new Error();
        const body = (await r.json()) as ReportData;
        if (live) setData(body);
      } catch {
        if (live) setError("Impossible de charger le rapport pour l’instant.");
      }
    })();
    return () => {
      live = false;
    };
  }, [week]);
  if (unavailable)
    return (
      <div className={`${s.root} ${s.page}`}>
        <header className={s.head}>
          <h1>Rapport de la semaine</h1>
          <p>Le rapport s’active avec les brouillons de réponse. Il n’est pas encore disponible sur ce déploiement.</p>
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
          <p role="status">Chargement du rapport…</p>
        )}
      </div>
    );
  return <ReportView report={data} onWeek={setWeek} isCurrent={!week} />;
}
