"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ContinuousToggle,
  type ContinuousSettings,
} from "@/app/start/ContinuousToggle";
import { DraftCard } from "@/app/start/DraftCard";
import type { InboxMessageView } from "@/lib/start/flow";
import s from "@/app/start/start.module.css";

type Digest = {
  since: string;
  counts: {
    draftsReady: number;
    questionsPending: number;
    needsReview: number;
    skipped: number;
  };
  drafts: InboxMessageView[];
  settings: ContinuousSettings;
};

const day = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Today = decisions first: drafts to review since the last visit. Hidden when inbox drafts are off. */
export function InboxToday() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/inbox/today", {
        cache: "no-store",
      });
      if (response.status === 503 || response.status === 401) {
        setDigest(null);
        return;
      }
      if (!response.ok) throw new Error("unavailable");
      setDigest((await response.json()) as Digest);
      setError("");
    } catch {
      setError("Impossible de charger vos brouillons pour l’instant.");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  async function markSeen() {
    setMarking(true);
    try {
      const response = await fetch("/api/v1/inbox/today", { method: "POST" });
      if (!response.ok) throw new Error("failed");
      await load();
    } catch {
      setError("Impossible d’enregistrer votre visite. Réessayez.");
    } finally {
      setMarking(false);
    }
  }

  if (!digest && !error) return null;
  if (!digest)
    return (
      <section className={s.digest} aria-label="Vos décisions du jour">
        <p className={s.alert} role="alert">
          {error}
        </p>
      </section>
    );

  const { counts } = digest;
  const mailbox = digest.settings.provider === "outlook" ? "Outlook" : "Gmail";
  const nothing = counts.draftsReady + counts.needsReview === 0;
  return (
    <section className={s.digest} aria-label="Vos décisions du jour">
      <div className={s.digestHead}>
        <h2>Vos décisions</h2>
        <span className={s.fine}>Depuis {day(digest.since)}</span>
      </div>
      <div className={s.tiles}>
        <div className={s.tile}>
          <strong>{counts.draftsReady}</strong>
          brouillon{counts.draftsReady > 1 ? "s" : ""} à relire
        </div>
        <div className={s.tile}>
          <strong>{counts.questionsPending}</strong>
          avec des questions à confirmer
        </div>
        <div className={s.tile}>
          <strong>{counts.needsReview}</strong>à vérifier par vous
        </div>
        <div className={s.tile}>
          <strong>{counts.skipped}</strong>
          laissé{counts.skipped > 1 ? "s" : ""} de côté
        </div>
      </div>
      {error && (
        <p className={s.alert} role="alert">
          {error}
        </p>
      )}
      {nothing ? (
        <p className={s.notice}>
          Rien de nouveau à relire. Les brouillons apparaissent ici dès qu’Orbi
          en prépare.
        </p>
      ) : (
        digest.drafts.map((m) => (
          <DraftCard key={m.id} message={m} mailbox={mailbox} />
        ))
      )}
      {counts.draftsReady > digest.drafts.length && (
        <p className={s.fine}>
          Les {digest.drafts.length} plus récents sont affichés ; les autres
          sont dans le dossier Brouillons de {mailbox}.
        </p>
      )}
      <div className={s.actions}>
        <button
          type="button"
          className={s.secondary}
          onClick={() => void markSeen()}
          disabled={marking}
        >
          {marking ? "Enregistrement…" : "Marquer comme vu"}
        </button>
      </div>
      <ContinuousToggle
        initial={digest.settings}
        onChange={(settings) => setDigest((d) => (d ? { ...d, settings } : d))}
      />
    </section>
  );
}
