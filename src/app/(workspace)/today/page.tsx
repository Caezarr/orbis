"use client";
import Link from "next/link";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";
import s from "@/components/product/product.module.css";
export default function Page() {
  const { data, loading } = useWorkspace<StoreState>();
  if (loading || !data) return <p role="status">Ouverture de votre équipe…</p>;
  const missions = data.missions.filter((m) => m.flowId);
  const runs = data.runs.filter((r) => r.engine === "agent-v1");
  const pending = runs.filter(
    (r) =>
      r.state === "waiting_input" ||
      (r.state === "succeeded" &&
        !data.evaluations.find((e) => e.id === r.evaluationId)?.humanFeedback
          ?.accepted),
  );
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <span className={s.eyebrow}>
            Votre entreprise, avec plus de capacité
          </span>
          <h1>
            Gardez le cap.
            <br />
            Déléguez le travail.
          </h1>
          <p>
            {missions.length
              ? `${missions.length} mission(s) configurée(s). Retrouvez les livrables et les décisions qui vous attendent.`
              : "Commençons par le travail que vous aimeriez ne plus faire seul."}
          </p>
        </div>
        <Link href="/audit" className={s.primary}>
          Déléguer un nouveau besoin
        </Link>
      </header>
      {pending.length > 0 && (
        <section className={s.paper}>
          <h2>{pending.length} résultat(s) à examiner</h2>
          <div className={s.list}>
            {pending.slice(0, 6).map((r) => (
              <Link
                key={r.id}
                className={s.row}
                href={`/missions/${r.missionId}/lab`}
              >
                <h3>{data.missions.find((m) => m.id === r.missionId)?.name}</h3>
                <p>
                  {r.state === "waiting_input"
                    ? "Informations ou corrections nécessaires"
                    : "Livrable prêt pour votre revue"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className={s.banner}>
        <div>
          <h2>Un besoin précis. Une équipe adaptée.</h2>
          <p>
            Audit, plan métier, outils et règles : tout commence avec le
            résultat que vous attendez.
          </p>
        </div>
        <Link href="/catalog" className={s.secondary}>
          Explorer les 100 cas
        </Link>
      </div>
      <div className={s.grid}>
        {missions.map((m) => (
          <article className={s.card} key={m.id}>
            <small>
              {m.state === "configuring"
                ? "Contexte à compléter"
                : m.state === "ready"
                  ? "Résultat à examiner"
                  : "Mission configurée"}
            </small>
            <h2>{m.name}</h2>
            <p>
              {
                data.missionVersions.find((v) => v.id === m.draftVersionId)
                  ?.outcome
              }
            </p>
            <Link href={`/missions/${m.id}/lab`}>Ouvrir la mission</Link>
          </article>
        ))}
      </div>
      {!missions.length && (
        <section className={s.paper}>
          <h2>Votre équipe n’a pas encore de mission.</h2>
          <p>
            Décrivez votre activité pour obtenir des recommandations ou
            choisissez un cas dans le catalogue. Les chiffres de ce tableau de
            bord proviennent uniquement des missions et runs enregistrés.
          </p>
          <Link
            href="/audit?audience=integrator"
            className={`${s.secondary} mt-5`}
          >
            Préparer un dossier client
          </Link>
        </section>
      )}
    </div>
  );
}
