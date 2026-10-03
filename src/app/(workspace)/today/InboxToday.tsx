"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ContinuousToggle,
  type ContinuousSettings,
} from "@/app/start/ContinuousToggle";
import { DraftCard } from "@/app/start/DraftCard";
import { DigestToggle } from "./DigestToggle";
import type { InboxMessageView } from "@/lib/start/flow";
import {
  OrbiQuestions,
  type NewInfoView,
  type QuestionView,
} from "@/components/brain/OrbiQuestions";
import { OrbiEmpty, OrbiSays } from "@/components/product/OrbiSays";
import Link from "next/link";
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
  mode?: "test" | "scoped_autonomy";
  questions?: { count: number; questions: QuestionView[] };
  newInfo?: NewInfoView[];
  canAnswer?: boolean;
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
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/inbox/today", {
        cache: "no-store",
      });
      if (response.status === 503 || response.status === 401) {
        setDigest(null);
        // 503: inbox drafts are off on this deployment. 401: no session, the shell handles it.
        setUnavailable(response.status === 503);
        return;
      }
      setUnavailable(false);
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

  if (!digest && unavailable)
    return (
      <section className={s.digest} aria-label="Vos décisions du jour">
        <OrbiEmpty
          title="Vos décisions du jour arriveront ici."
          actions={<Link href="/start">Reprendre le démarrage</Link>}
        >
          <p>
            Dès que votre boîte mail est branchée, je dépose ici les brouillons à relire et les questions que je dois
            vous poser. Rien n’est jamais envoyé sans vous.
          </p>
          <p>Les brouillons de réponse ne sont pas encore activés sur ce déploiement.</p>
        </OrbiEmpty>
      </section>
    );
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
  // One Orbi per viewport: the « Questions d’Orbi » block below has its own when questions are pending.
  const orbiAsks = (digest.questions?.count ?? 0) > 0 || (digest.newInfo?.length ?? 0) > 0;
  return (
    <section className={s.digest} aria-label="Vos décisions du jour">
      <div className={s.digestHead}>
        <h2>Vos décisions</h2>
        <span className={s.fine}>Depuis {day(digest.since)}</span>
      </div>
      {digest.mode !== "scoped_autonomy" && (
        <p className={s.test} role="note">
          <strong>Mode test.</strong> Les brouillons sont simulés : rien n’est
          écrit dans votre boîte {mailbox}, et rien n’est jamais envoyé.
        </p>
      )}
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
        orbiAsks ? (
          <p className={s.notice}>
            Rien de nouveau à relire. Les brouillons apparaissent ici dès
            qu’Orbi en prépare.
          </p>
        ) : (
          <OrbiSays>
            <p>
              <strong>Rien de nouveau à relire.</strong>
            </p>
            <p>Je dépose ici chaque brouillon dès qu’il est prêt.</p>
          </OrbiSays>
        )
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
      <OrbiQuestions
        count={digest.questions?.count ?? 0}
        questions={digest.questions?.questions ?? []}
        newInfo={digest.newInfo ?? []}
        canAnswer={!!digest.canAnswer}
        mailbox={mailbox}
        onChange={load}
      />
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
      <DigestToggle />
    </section>
  );
}
