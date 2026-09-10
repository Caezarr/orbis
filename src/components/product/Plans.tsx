"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { BusinessAudit } from "@/lib/product/audit";
import { findFlow, rankFlows, capabilityLabels } from "@/lib/product/catalog";
import { toolSuggestions } from "@/lib/product/tool-suggestions";
import s from "./product.module.css";
export function Plans({
  auditId,
  flowId,
}: {
  auditId?: string;
  flowId?: string;
}) {
  const router = useRouter();
  const { reload } = useWorkspace();
  const [items, setItems] = useState<BusinessAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(flowId ?? "");
  const [sourcing, setSourcing] = useState<
    Record<string, "own" | "managed" | "later">
  >({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/v1/business-audits")
      .then(async (r) => {
        if (!r.ok) throw new Error("Dossiers indisponibles.");
        return r.json();
      })
      .then((d) => {
        if (active) {
          setItems(d.items);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  const audit = auditId ? items.find((a) => a.id === auditId) : items[0];
  const recommendations = audit
    ? rankFlows(
        `${audit.description} ${audit.success} ${audit.volume}`,
        audit.department,
      )
    : [];
  const flow = findFlow(selected) || recommendations[0]?.flow;
  const savedSourcing =
    audit?.installations.find((i) => i.flowId === flow?.id)?.sourcing ?? {};
  async function install() {
    if (!audit || !flow) return;
    setBusy(true);
    setError("");
    try {
      const choices = Object.fromEntries(
        flow.capabilities.map((c) => [
          c,
          sourcing[c] ?? savedSourcing[c] ?? "later",
        ]),
      );
      const r = await fetch(`/api/v1/business-audits/${audit.id}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: flow.id, sourcing: choices }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message);
      await reload();
      router.push(`/missions/${data.missionId}/setup`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Installation impossible.");
      setBusy(false);
    }
  }
  function download() {
    if (!audit || !flow) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            company: audit.company,
            brief: audit.description,
            success: audit.success,
            constraints: audit.constraints,
            flow,
            sourcing,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orbis-plan-${flow.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  if (loading) return <p role="status">Ouverture des dossiers…</p>;
  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <span className={s.eyebrow}>Votre plan d’action</span>
          <h1>
            {audit
              ? `${audit.company}, avec plus de capacité.`
              : "Votre premier dossier commence ici."}
          </h1>
          <p>
            Des résultats précis, vos règles, et un choix d’outils pour chaque
            besoin.
          </p>
        </div>
        <Link href="/audit" className={s.primary}>
          Nouvel audit
        </Link>
      </header>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <nav className={s.history} aria-label="Dossiers">
        {items.map((a) => (
          <Link className={s.secondary} key={a.id} href={`/plans?id=${a.id}`}>
            {a.company}
          </Link>
        ))}
      </nav>
      {audit && flow ? (
        <div className={s.split}>
          <div>
            <section className={s.paper}>
              <h2>Les cas qui correspondent à votre besoin</h2>
              <p>{audit.success}</p>
              <div className={`${s.list} mt-5`}>
                {recommendations.map(({ flow: f, reason }) => (
                  <button
                    key={f.id}
                    className={s.row}
                    style={{
                      textAlign: "left",
                      borderColor: f.id === flow.id ? "#305ee8" : undefined,
                    }}
                    onClick={() => {
                      setSelected(f.id);
                      setSourcing({});
                    }}
                  >
                    <h3>{f.title}</h3>
                    <p>{reason}</p>
                  </button>
                ))}
              </div>
              <Link href="/catalog" className={`${s.secondary} mt-5`}>
                Explorer les 100 cas
              </Link>
            </section>
            <section className={`${s.paper} mt-5`}>
              <h2>{flow.title}</h2>
              <ol className={s.steps}>
                {flow.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className={s.note}>Critère de réussite : {flow.acceptance}</p>
              <h2 className="mt-6!">Une mémoire propre à cette mission</h2>
              <p>
                {flow.memory} Une correction doit être approuvée avant
                d’influencer un nouveau résultat.
              </p>
            </section>
          </div>
          <aside className={`${s.paper} ${s.summary}`}>
            <h2>Vos outils. Ou les nôtres.</h2>
            <p>
              Choisissez une préférence pour chaque capacité. Les connexions et
              leur disponibilité seront vérifiées avant exécution.
            </p>
            {flow.capabilities.map((c) => (
              <label className={s.toolRow} key={c}>
                <strong>{capabilityLabels[c]}</strong>
                <small>{toolSuggestions[c]} · suggestions à confirmer, pas des connexions actives.</small>
                <select
                  value={sourcing[c] ?? savedSourcing[c] ?? "later"}
                  onChange={(e) =>
                    setSourcing((old) => ({
                      ...old,
                      [c]: e.target.value as "own" | "managed" | "later",
                    }))
                  }
                >
                  <option value="later">À décider avec mon intégrateur</option>
                  <option value="own">Utiliser mon propre outil</option>
                  <option value="managed">
                    Demander une option fournie par Orbis
                  </option>
                </select>
              </label>
            ))}
            <p className={s.note}>
              Préférences enregistrées, aucun achat ni connexion simulée. La
              première étape prépare un livrable avec les sources que vous
              ajouterez et une clé IA serveur. La fourniture gérée nécessite une
              offre et des connecteurs opérationnels.
            </p>
            <button disabled={busy} onClick={install} className={s.primary}>
              {busy ? "Configuration…" : "Préparer cette mission"}
            </button>
            <button onClick={download} className={`${s.secondary} mt-3`}>
              Exporter le plan intégrateur
            </button>
            <p className="mt-5">
              Budget cible déclaré : {audit.budget} €/mois. Non facturé.
            </p>
          </aside>
        </div>
      ) : (
        <div className={s.empty}>
          <h2>Définissons ce que vous voulez déléguer.</h2>
          <p>Vos audits et les missions associées seront retrouvables ici.</p>
          <Link href="/audit" className={`${s.primary} mt-5`}>
            Commencer mon audit
          </Link>
        </div>
      )}
    </div>
  );
}
