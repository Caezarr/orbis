"use client";

import { useCallback, useEffect, useState } from "react";
import s from "./brain.module.css";

type Quote = { quote: string; messageId: string; sentAt: string };
export type FactView = {
  id: string;
  category: string;
  statement: string;
  condition: string | null;
  status: "candidate" | "approved" | "rejected" | "superseded";
  origin: "sent_mail" | "question_answer" | "edit_diff";
  quotes: Quote[];
  evidenceAt: string | null;
  version: number;
  reviewedAt: string | null;
  createdAt: string;
  active: boolean;
  conflictKey: string | null;
};
export type Overview = {
  categories: { id: string; label: string }[];
  facts: FactView[];
  counts: { candidates: number; approved: number; conflicts: number };
  profile: {
    name: string;
    website?: string;
    summary: string;
    claims: { label: string; value: string; sourceUrl?: string }[];
  } | null;
  extraction: {
    status: string;
    stats: Record<string, unknown>;
    createdAt: string;
    completedAt?: string;
    error?: string;
  } | null;
  canReview: boolean;
};

export const dateFr = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
const ORIGIN: Record<FactView["origin"], string> = {
  sent_mail: "Tiré de vos mails envoyés",
  question_answer: "Votre réponse",
  edit_diff: "Appris de votre correction",
};

function extractionLine(e: Overview["extraction"]) {
  if (!e) return "Orbi n’a pas encore lu vos mails envoyés.";
  const n = (k: string) => Number(e.stats?.[k] ?? 0);
  if (e.status === "queued" || e.status === "running")
    return "Lecture de vos mails envoyés en cours…";
  if (e.status === "failed")
    return e.error ?? "La lecture a échoué. Rien n’a été envoyé.";
  const base = `Dernière lecture le ${dateFr(e.completedAt ?? e.createdAt)} : ${n("processed")} réponse${n("processed") > 1 ? "s" : ""} lue${n("processed") > 1 ? "s" : ""}, ${n("candidates")} fait${n("candidates") > 1 ? "s" : ""} proposé${n("candidates") > 1 ? "s" : ""}.`;
  return e.status === "budget_exhausted"
    ? `${base} Budget mensuel atteint : la lecture reprendra quand il le permettra.`
    : base;
}

/** « Fiche entreprise »: candidates first (conflicts flagged), then validated facts, then /start profile. */
export function CompanySheet({ initial }: { initial?: Overview }) {
  const [data, setData] = useState<Overview | null>(initial ?? null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (initial) return;
    try {
      const r = await fetch("/api/v1/brain", { cache: "no-store" });
      if (r.status === 503) {
        setUnavailable(true);
        return;
      }
      if (!r.ok) throw new Error();
      setData((await r.json()) as Overview);
    } catch {
      setError("Impossible de charger la fiche pour l’instant.");
    }
  }, [initial]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function review(fact: FactView, action: "approve" | "reject", statement?: string) {
    setBusy(fact.id);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/v1/brain/facts/${fact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, expectedVersion: fact.version, ...(statement ? { statement } : {}) }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Action impossible.");
      setNotice(
        action === "approve"
          ? "Fait validé. Orbi l’utilisera dans les prochains brouillons."
          : "Fait écarté. Sa citation a été effacée.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setBusy("");
    }
  }
  async function rerun() {
    setBusy("rerun");
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/v1/brain/extractions", {
        method: "POST",
        headers: { "Idempotency-Key": `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Lecture impossible.");
      setNotice("Lecture lancée. Les nouveaux faits apparaîtront ici, à valider.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lecture impossible.");
    } finally {
      setBusy("");
    }
  }

  if (unavailable)
    return (
      <div className={`${s.root} ${s.page}`}>
        <header className={s.head}>
          <h1>Fiche entreprise</h1>
          <p>La fiche entreprise s’active avec les brouillons de réponse. Elle n’est pas encore disponible sur ce déploiement.</p>
        </header>
      </div>
    );
  if (!data)
    return (
      <div className={`${s.root} ${s.page}`}>
        {error ? <p className={s.alert} role="alert">{error}</p> : <p role="status">Chargement de la fiche…</p>}
      </div>
    );

  const label = new Map(data.categories.map((c) => [c.id, c.label]));
  const candidates = data.facts.filter((f) => f.status === "candidate");
  const approved = data.facts.filter((f) => f.status === "approved");
  const rejected = data.facts.filter((f) => f.status === "rejected" || f.status === "superseded");
  const grouped = (facts: FactView[]) =>
    data.categories
      .map((c) => ({
        ...c,
        facts: facts
          .filter((f) => f.category === c.id)
          // Conflicts first, then newest evidence.
          .sort((a, b) =>
            a.conflictKey === b.conflictKey
              ? (b.evidenceAt ?? "").localeCompare(a.evidenceAt ?? "")
              : a.conflictKey
                ? -1
                : b.conflictKey
                  ? 1
                  : 0,
          ),
      }))
      .filter((g) => g.facts.length);

  return (
    <div className={`${s.root} ${s.page}`}>
      <header className={s.head}>
        <h1>Fiche entreprise</h1>
        <p>
          Ce qu’Orbi a appris de vos réponses envoyées, de vos réponses à ses questions et de vos corrections.
          Seuls les faits que vous validez servent à rédiger vos brouillons.
        </p>
      </header>

      <section className={s.panel} aria-label="Lecture des mails envoyés">
        <p className={s.lead} style={{ margin: 0 }}>{extractionLine(data.extraction)}</p>
        <p className={s.fine} style={{ margin: 0 }}>
          Orbi lit au plus 200 réponses envoyées des 90 derniers jours, en lecture seule. Il ne garde que de courtes
          citations de vos propres mails, sans le nom ni les coordonnées de vos clients.
        </p>
        {data.canReview && (
          <div className={s.actions}>
            <button
              type="button"
              className={s.secondary}
              onClick={() => void rerun()}
              disabled={busy === "rerun" || data.extraction?.status === "queued" || data.extraction?.status === "running"}
            >
              {busy === "rerun" ? "Lancement…" : "Relire mes mails envoyés"}
            </button>
          </div>
        )}
      </section>

      {error && <p className={s.alert} role="alert">{error}</p>}
      {notice && <p className={s.notice} role="status">{notice}</p>}

      <section className={s.section} aria-labelledby="pending-title">
        <div className={s.sectionHead}>
          <h2 id="pending-title">
            À valider <span className={s.count}>({candidates.length})</span>
          </h2>
          {data.counts.conflicts > 0 && (
            <span className={s.warn}>
              {data.counts.conflicts} conflit{data.counts.conflicts > 1 ? "s" : ""} à trancher
            </span>
          )}
        </div>
        {candidates.length === 0 ? (
          <p className={s.empty}>Rien à valider pour l’instant.</p>
        ) : (
          grouped(candidates).map((g) => (
            <div className={s.group} key={g.id}>
              <h3>{g.label}</h3>
              {g.facts.map((f) => (
                <FactCard key={f.id} fact={f} canReview={data.canReview} busy={busy === f.id} onReview={review} />
              ))}
            </div>
          ))
        )}
      </section>

      <section className={s.section} aria-labelledby="approved-title">
        <h2 id="approved-title">
          Validé <span className={s.count}>({approved.length})</span>
        </h2>
        {approved.length === 0 ? (
          <p className={s.empty}>Aucun fait validé. Les brouillons s’appuient alors sur votre site et vos documents.</p>
        ) : (
          grouped(approved).map((g) => (
            <div className={s.group} key={g.id}>
              <h3>{label.get(g.id)}</h3>
              {g.facts.map((f) => (
                <FactCard key={f.id} fact={f} canReview={data.canReview} busy={busy === f.id} onReview={review} />
              ))}
            </div>
          ))
        )}
      </section>

      {data.profile && (
        <section className={s.section} aria-labelledby="site-title">
          <h2 id="site-title">Depuis votre site</h2>
          <p className={s.fine} style={{ margin: 0 }}>
            Profil confirmé au démarrage{data.profile.website ? ` (${data.profile.website})` : ""}. Il sert aussi de source aux brouillons.
          </p>
          {data.profile.summary && <p className={s.statement}>{data.profile.summary}</p>}
          {data.profile.claims.length > 0 && (
            <ul className={s.list}>
              {data.profile.claims.map((c, i) => (
                <li className={s.row} key={`${c.label}-${i}`}>
                  <span>
                    <strong>{c.label}</strong> : {c.value}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {rejected.length > 0 && (
        <details className={s.section}>
          <summary className={s.summary}>
            Écartés ou remplacés <span className={s.count}>({rejected.length})</span>
          </summary>
          <ul className={s.list}>
            {rejected.map((f) => (
              <li className={s.row} key={f.id}>
                <span>{f.statement}</span>
                <span className={s.badge}>{f.status === "rejected" ? "Écarté" : "Remplacé"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function FactCard({
  fact: f,
  canReview,
  busy,
  onReview,
}: {
  fact: FactView;
  canReview: boolean;
  busy: boolean;
  onReview: (fact: FactView, action: "approve" | "reject", statement?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(f.statement);
  return (
    <article className={s.fact} data-conflict={!!f.conflictKey} data-status={f.status}>
      <div className={s.meta}>
        {f.conflictKey && <span className={s.warn}>Conflit : une autre version existe</span>}
        {f.status === "approved" && <span className={s.ok}>Validé {f.reviewedAt ? `le ${dateFr(f.reviewedAt)}` : ""}</span>}
        <span className={s.badge}>{ORIGIN[f.origin]}</span>
      </div>
      {editing ? (
        <label className={s.field}>
          Votre version
          <textarea value={text} maxLength={400} onChange={(e) => setText(e.target.value)} />
        </label>
      ) : (
        <p className={s.statement}>{f.statement}</p>
      )}
      {f.condition && <p className={s.condition}>Ça dépend : {f.condition}</p>}
      {f.quotes.map((q, i) => (
        <blockquote className={s.quote} key={`${q.messageId}-${i}`}>
          « {q.quote} »<cite>Votre mail envoyé le {dateFr(q.sentAt)}</cite>
        </blockquote>
      ))}
      {f.origin === "question_answer" && <p className={s.fine} style={{ margin: 0 }}>Réponse donnée le {dateFr(f.createdAt)}.</p>}
      {canReview && f.status === "candidate" && (
        <div className={s.actions}>
          {editing ? (
            <>
              <button type="button" className={s.primary} disabled={busy || text.trim().length < 3} onClick={() => void onReview(f, "approve", text.trim())}>
                Valider ma version
              </button>
              <button type="button" className={s.ghost} disabled={busy} onClick={() => { setEditing(false); setText(f.statement); }}>
                Annuler
              </button>
            </>
          ) : (
            <>
              <button type="button" className={s.primary} disabled={busy} onClick={() => void onReview(f, "approve")}>
                Valider
              </button>
              <button type="button" className={s.secondary} disabled={busy} onClick={() => setEditing(true)}>
                Modifier
              </button>
              <button type="button" className={s.ghost} disabled={busy} onClick={() => void onReview(f, "reject")}>
                Rejeter
              </button>
            </>
          )}
        </div>
      )}
      {canReview && f.status === "approved" && (
        <div className={s.actions}>
          <button type="button" className={s.ghost} disabled={busy} onClick={() => void onReview(f, "reject")}>
            Ne plus utiliser
          </button>
        </div>
      )}
    </article>
  );
}
