"use client";

import Link from "next/link";
import { useState } from "react";
import s from "./brain.module.css";

export type QuestionView = {
  id: string;
  label: string;
  occurrences: number;
  drafts: number;
  lastSeenAt: string;
};
export type NewInfoView = {
  inboxMessageId: string;
  subjectPreview?: string;
  draftedAt?: string;
  simulated: boolean;
  regeneration?: { status: string; draftState: string };
};

/**
 * « Questions d’Orbi »: each [[À CONFIRMER]] becomes one question, answered
 * once. The answer is stored as a validated fact of the company sheet and is
 * never asked again. Drafts that needed it can be regenerated in one click (a
 * NEW draft; the old one stays in the mailbox).
 */
export function OrbiQuestions({
  count,
  questions,
  newInfo,
  canAnswer,
  mailbox,
  onChange,
}: {
  count: number;
  questions: QuestionView[];
  newInfo: NewInfoView[];
  canAnswer: boolean;
  mailbox: string;
  onChange: () => Promise<void> | void;
}) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function regenerate(id: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/v1/brain/regenerations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboxMessageId: id }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Impossible de préparer un nouveau brouillon.");
      setNotice(body.notice);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de préparer un nouveau brouillon.");
    } finally {
      setBusy("");
    }
  }

  if (!count && !newInfo.length) return null;
  return (
    <section className={`${s.root} ${s.section}`} aria-labelledby="orbi-questions">
      <div className={s.sectionHead}>
        <h2 id="orbi-questions">
          Questions d’Orbi <span className={s.count}>({count})</span>
        </h2>
        <Link href="/fiche" className={s.fine}>
          Voir la fiche entreprise
        </Link>
      </div>
      {count > 0 && (
        <p className={s.fine} style={{ margin: 0 }}>
          Répondez une fois : la réponse rejoint votre fiche entreprise et Orbi ne vous la redemandera plus.
        </p>
      )}
      {error && <p className={s.alert} role="alert">{error}</p>}
      {notice && <p className={s.notice} role="status">{notice}</p>}
      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          question={q}
          canAnswer={canAnswer}
          onDone={async (message) => {
            setNotice(message);
            setError("");
            await onChange();
          }}
          onError={setError}
        />
      ))}
      {count > questions.length && (
        <p className={s.fine}>Les {questions.length} questions les plus fréquentes sont affichées.</p>
      )}
      {newInfo.length > 0 && (
        <div className={s.group}>
          <h3>Nouvelle info disponible</h3>
          <p className={s.fine} style={{ margin: 0 }}>
            Ces brouillons ont été préparés avant votre réponse. Orbi peut en préparer un nouveau ; l’ancien reste dans
            votre dossier Brouillons de {mailbox} (Orbi ne supprime jamais rien).
          </p>
          <ul className={s.list}>
            {newInfo.map((d) => {
              const pending = d.regeneration?.status === "queued" || d.regeneration?.status === "running";
              const done = d.regeneration?.status === "completed" && d.regeneration.draftState !== "none";
              return (
                <li className={s.row} key={d.inboxMessageId}>
                  <span>{d.subjectPreview ?? "Brouillon sans objet"}</span>
                  {pending ? (
                    <span className={s.badge}>Nouveau brouillon en préparation…</span>
                  ) : done ? (
                    <span className={s.ok}>
                      {d.regeneration?.draftState === "simulated" ? "Nouveau brouillon simulé" : "Nouveau brouillon prêt"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={s.secondary}
                      disabled={busy === d.inboxMessageId}
                      onClick={() => void regenerate(d.inboxMessageId)}
                    >
                      Préparer un nouveau brouillon
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function QuestionCard({
  question: q,
  canAnswer,
  onDone,
  onError,
}: {
  question: QuestionView;
  canAnswer: boolean;
  onDone: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [conditional, setConditional] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = `answer-${q.id}`;
  async function send(path: string, body?: unknown) {
    setBusy(true);
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error ?? "Enregistrement impossible.");
      return json;
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className={s.question}>
      <h3>{q.label}</h3>
      <p className={s.fine} style={{ margin: 0 }}>
        Demandée {q.occurrences} fois{q.drafts ? ` · dans ${q.drafts} brouillon${q.drafts > 1 ? "s" : ""}` : ""}
      </p>
      {canAnswer ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(`/api/v1/brain/questions/${q.id}`, { answer: answer.trim(), conditional })
              .then((r: { affectedDrafts?: unknown[] }) =>
                onDone(
                  `Réponse enregistrée dans votre fiche entreprise. Orbi ne vous la redemandera plus.${
                    r.affectedDrafts?.length ? " Des brouillons peuvent être mis à jour ci-dessous." : ""
                  }`,
                ),
              )
              .catch((err: Error) => onError(err.message));
          }}
        >
          <div className={s.field}>
            <label htmlFor={id}>{conditional ? "De quoi cela dépend-il ?" : "Votre réponse"}</label>
            <textarea
              id={id}
              value={answer}
              maxLength={400}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={conditional ? "Ex. : tel prix jusqu’à tel seuil, sur devis au-delà" : "Votre réponse, comme vous l’écririez à un client"}
            />
          </div>
          <label className={s.check} style={{ marginTop: 8 }}>
            <input type="checkbox" checked={conditional} onChange={(e) => setConditional(e.target.checked)} />
            Ça dépend (réponse sous conditions)
          </label>
          <div className={s.actions} style={{ marginTop: 10 }}>
            <button type="submit" className={s.primary} disabled={busy || !answer.trim()}>
              Enregistrer la réponse
            </button>
            <button
              type="button"
              className={s.ghost}
              disabled={busy}
              onClick={() =>
                send(`/api/v1/brain/questions/${q.id}/dismiss`)
                  .then(() => onDone("Question écartée."))
                  .catch((err: Error) => onError(err.message))
              }
            >
              Pas pertinent
            </button>
          </div>
        </form>
      ) : (
        <p className={s.fine} style={{ margin: 0 }}>Un propriétaire ou un administrateur peut y répondre.</p>
      )}
    </article>
  );
}
