"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { WeeklyReport } from "@/lib/followups/report";
import { durationFr } from "./ReportView";
import s from "./followups.module.css";

export type WeekSummary = { report: WeeklyReport; followupsReady: number; openRequests: number };

/** Today: this week's measured counts + follow-ups to review. Silent when the feature is off. */
export function WeekCard() {
  const [data, setData] = useState<WeekSummary | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/v1/report/today", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => live && body && setData(body as WeekSummary))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return data ? <WeekCardView data={data} /> : null;
}

export function WeekCardView({ data }: { data: WeekSummary }) {
  const r = data.report;
  return (
    <section className={`${s.root} ${s.panel} ${s.card}`} aria-labelledby="week-card">
      <div className={s.weekNav} style={{ justifyContent: "space-between" }}>
        <h2 id="week-card">Cette semaine, mesuré</h2>
        <Link className={s.secondary} href="/rapport">
          Voir le rapport
        </Link>
      </div>
      <div className={s.tiles}>
        <div className={s.tile}>
          <strong>{r.drafts.prepared}</strong>
          <span>brouillons préparés</span>
        </div>
        <div className={s.tile}>
          <strong>{r.outcomes.sent_as_is}</strong>
          <span>envoyés tels quels</span>
          <small>sur {r.outcomes.measured} mesurés</small>
        </div>
        <div className={s.tile}>
          <strong>{r.questionsAnswered}</strong>
          <span>questions répondues</span>
        </div>
        <div className={s.tile}>
          <strong>{durationFr(r.responseTime.medianMinutes)}</strong>
          <span>délai médian de 1re réponse</span>
          <small>
            {r.responseTime.total ? `${r.responseTime.measured}/${r.responseTime.total} demandes mesurées` : "aucune demande"}
          </small>
        </div>
      </div>
      {(data.followupsReady > 0 || data.openRequests > 0) && (
        <p className={s.notice}>
          {data.followupsReady > 0 && (
            <>
              <Link href="/demandes">
                {data.followupsReady} relance{data.followupsReady > 1 ? "s" : ""} à relire
              </Link>
              {" · "}
            </>
          )}
          {data.openRequests} demande{data.openRequests > 1 ? "s" : ""} en cours
        </p>
      )}
    </section>
  );
}
