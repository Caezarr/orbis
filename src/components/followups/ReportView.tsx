"use client";

import Link from "next/link";
import type { WeeklyReport } from "@/lib/followups/report";
import s from "./followups.module.css";

export type ReportData = WeeklyReport & { previous: WeeklyReport };
const dayFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" }).format(new Date(iso));
export function weekLabel(week: WeeklyReport["week"]) {
  const last = new Date(new Date(week.end).getTime() - 3_600_000).toISOString();
  return `Semaine du ${dayFr(week.start)} au ${dayFr(last)}`;
}
export function durationFr(minutes: number | null) {
  if (minutes === null) return "non mesuré";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 48) return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
  return `${Math.round(h / 24)} j`;
}
const pct = (v: number | null) => (v === null ? "non mesuré" : `${Math.round(v * 100)} %`);

function Tile({ label, value, previous, note }: { label: string; value: number | string; previous?: number | string; note?: string }) {
  return (
    <div className={s.tile}>
      <strong>{value}</strong>
      <span>{label}</span>
      {previous !== undefined && <small>Semaine précédente : {previous}</small>}
      {note && <small>{note}</small>}
    </div>
  );
}

export function ReportView({
  report,
  onWeek,
  isCurrent,
}: {
  report: ReportData;
  onWeek?: (monday: string | null) => void;
  isCurrent: boolean;
}) {
  const r = report;
  const p = r.previous;
  const o = r.outcomes;
  const outcomeTotal = o.sent_as_is + o.sent_edited + o.not_used;
  const share = (n: number) => (outcomeTotal ? `${(n / outcomeTotal) * 100}%` : "0");
  return (
    <div className={`${s.root} ${s.page}`}>
      <header className={s.head}>
        <h1>Rapport de la semaine</h1>
        <p>
          Uniquement des mesures : chaque chiffre correspond à un événement enregistré dans Orbi pendant la semaine (heure de
          Paris). Rien n’est extrapolé.
        </p>
      </header>
      <div className={s.weekNav}>
        <strong>{weekLabel(r.week)}</strong>
        {onWeek && (
          <span className={s.actions}>
            <button type="button" className={s.secondary} onClick={() => onWeek(p.week.monday)}>
              Semaine précédente
            </button>
            {!isCurrent && (
              <button type="button" className={s.ghost} onClick={() => onWeek(null)}>
                Cette semaine
              </button>
            )}
          </span>
        )}
      </div>

      <section className={s.panel} aria-labelledby="r-mail">
        <h2 id="r-mail">Boîte mail</h2>
        <div className={s.tiles}>
          <Tile label="e-mails entrants lus par Orbi" value={r.emails.received} previous={p.emails.received} />
          <Tile label="e-mails classés" value={r.emails.classified} previous={p.emails.classified} />
          <Tile
            label="demandes de clients et de devis"
            value={(r.emails.byClass.customer_request ?? 0) + (r.emails.byClass.quote_request ?? 0)}
            previous={(p.emails.byClass.customer_request ?? 0) + (p.emails.byClass.quote_request ?? 0)}
          />
          <Tile
            label="brouillons préparés"
            value={r.drafts.prepared}
            previous={p.drafts.prepared}
            note={`${r.drafts.inbox} réponses · ${r.drafts.regenerated} refaits · ${r.drafts.followups} relances`}
          />
        </div>
      </section>

      <section className={s.panel} aria-labelledby="r-outcomes">
        <h2 id="r-outcomes">Ce que vous avez fait des brouillons</h2>
        {outcomeTotal === 0 ? (
          <p className={s.empty}>
            Pas encore de mesure cette semaine. Orbi compare un brouillon à ce que vous avez réellement envoyé dans la
            conversation, au plus tôt 30 minutes après sa création.
          </p>
        ) : (
          <>
            <div className={s.bar} role="img" aria-label={`${o.sent_as_is} envoyés tels quels, ${o.sent_edited} modifiés, ${o.not_used} non utilisés`}>
              <span style={{ width: share(o.sent_as_is), background: "#16845b" }} />
              <span style={{ width: share(o.sent_edited), background: "#305ee8" }} />
              <span style={{ width: share(o.not_used), background: "#c3cbd8" }} />
            </div>
            <ul className={s.legend}>
              <li>
                <i style={{ background: "#16845b" }} />
                {o.sent_as_is} envoyé{o.sent_as_is > 1 ? "s" : ""} tel{o.sent_as_is > 1 ? "s" : ""} quel{o.sent_as_is > 1 ? "s" : ""}
              </li>
              <li>
                <i style={{ background: "#305ee8" }} />
                {o.sent_edited} modifié{o.sent_edited > 1 ? "s" : ""} avant envoi
              </li>
              <li>
                <i style={{ background: "#c3cbd8" }} />
                {o.not_used} non utilisé{o.not_used > 1 ? "s" : ""}
              </li>
            </ul>
            <p className={s.fine}>
              Taux envoyé tel quel : {pct(o.asIsRate)} sur {o.measured} brouillon{o.measured > 1 ? "s" : ""} mesuré
              {o.measured > 1 ? "s" : ""} (semaine précédente : {pct(p.outcomes.asIsRate)}).
              {o.pending > 0 ? ` ${o.pending} en attente de mesure.` : ""}
            </p>
          </>
        )}
      </section>

      <section className={s.panel} aria-labelledby="r-brain">
        <h2 id="r-brain">Orbi apprend votre entreprise</h2>
        <div className={s.tiles}>
          <Tile label="questions répondues" value={r.questionsAnswered} previous={p.questionsAnswered} />
          <Tile label="faits validés dans la fiche" value={r.factsValidated} previous={p.factsValidated} />
        </div>
      </section>

      <section className={s.panel} aria-labelledby="r-requests">
        <h2 id="r-requests">Demandes et relances</h2>
        <div className={s.tiles}>
          <Tile label="nouvelles demandes" value={r.requests.new} previous={p.requests.new} />
          <Tile label="relances préparées" value={r.drafts.followups} previous={p.drafts.followups} />
          <Tile label="gagnées (votre décision)" value={r.requests.won} />
          <Tile label="perdues (votre décision)" value={r.requests.lost} />
          <Tile
            label="délai médian de 1re réponse"
            value={durationFr(r.responseTime.medianMinutes)}
            note={
              r.responseTime.total
                ? `Calculé sur ${r.responseTime.measured} demande${r.responseTime.measured > 1 ? "s" : ""} sur ${r.responseTime.total} (${pct(r.responseTime.coverage)}) : les autres n’ont pas encore de réponse connue.`
                : "Aucune demande reçue cette semaine."
            }
          />
        </div>
        <p className={s.fine}>
          Délai = votre premier message envoyé dans la conversation moins l’heure de réception de la demande, uniquement quand
          les deux horaires sont connus.
        </p>
      </section>

      <section className={s.panel} aria-labelledby="r-estimate">
        <h2 id="r-estimate">Temps gagné</h2>
        {r.estimate ? (
          <>
            <p className={s.notice}>
              <strong>Estimation : environ {durationFr(r.estimate.minutes)}</strong>
            </p>
            <p className={s.fine}>
              {r.estimate.label} Les brouillons modifiés ne sont pas comptés. Ce n’est pas une mesure.
            </p>
          </>
        ) : r.baselineMinutes ? (
          <p className={s.empty}>
            Aucun brouillon mesuré comme envoyé tel quel cette semaine : pas d’estimation (votre référence :{" "}
            {r.baselineMinutes} min par réponse).
          </p>
        ) : (
          <p className={s.empty}>
            Orbi n’affiche pas de temps gagné sans votre référence. Indiquez combien de minutes il vous faut pour écrire une
            réponse dans les réglages de la page <Link href="/demandes">Demandes</Link> : l’estimation apparaîtra ici,
            signalée comme telle.
          </p>
        )}
      </section>
    </div>
  );
}
