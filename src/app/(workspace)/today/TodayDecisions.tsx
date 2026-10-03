"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ContinuousToggle,
  type ContinuousSettings,
} from "@/app/start/ContinuousToggle";
import {
  OrbiQuestions,
  type NewInfoView,
  type QuestionView,
} from "@/components/brain/OrbiQuestions";
import {
  WeekCardView,
  type WeekSummary,
} from "@/components/followups/WeekCard";
import type { RequestsData } from "@/components/followups/RequestsView";
import { EmptyState } from "@/components/shell/EmptyState";
import { DECISIONS_EVENT } from "@/components/shell/AppShell";
import {
  CLASSIFICATION_LABELS,
  splitPlaceholders,
  type InboxMessageView,
} from "@/lib/start/flow";
import {
  mailboxName,
  moveSelection,
  plural,
  shortcutFor,
  todayState,
  uncertainties,
} from "@/lib/inbox/today-view";
import s from "./today.module.css";

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
type Load =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "error" }
  | { status: "ready"; digest: Digest };

const longDate = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
const today = () =>
  new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/**
 * Today = décisions d'abord (doc 17, Phase 2): drafts to review, Orbi's
 * questions, follow-ups due. Then a compact, measured summary. Every number
 * comes from the API (counts of stored rows): nothing is estimated here.
 */
export function TodayDecisions() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [followups, setFollowups] = useState<RequestsData["items"]>([]);
  const [selected, setSelected] = useState(-1);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");
  const cards = useRef<(HTMLElement | null)[]>([]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/inbox/today", {
        cache: "no-store",
      });
      if (response.status === 503 || response.status === 401)
        return setLoad({ status: "unavailable" });
      if (!response.ok) throw new Error("unavailable");
      setLoad({ status: "ready", digest: (await response.json()) as Digest });
      setError("");
    } catch {
      setLoad((current) =>
        current.status === "ready" ? current : { status: "error" },
      );
    }
    // Optional parts: silent when the pipeline is off.
    try {
      const r = await fetch("/api/v1/report/today", { cache: "no-store" });
      const summary = r.ok ? ((await r.json()) as WeekSummary) : null;
      setWeek(summary);
      if (summary?.followupsReady) {
        const list = await fetch("/api/v1/requests?followup=ready", {
          cache: "no-store",
        });
        setFollowups(
          list.ok ? ((await list.json()) as RequestsData).items : [],
        );
      } else setFollowups([]);
    } catch {
      setWeek(null);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  const digest = load.status === "ready" ? load.digest : null;
  const drafts = useMemo(() => digest?.drafts ?? [], [digest]);
  const questionCount = digest?.questions?.count ?? 0;
  const followupCount = week?.followupsReady ?? 0;

  // The shell badge shows what waits for the user (drafts, questions, follow-ups).
  useEffect(() => {
    if (!digest) return;
    window.dispatchEvent(
      new CustomEvent(DECISIONS_EVENT, {
        detail: digest.counts.draftsReady + questionCount + followupCount,
      }),
    );
  }, [digest, questionCount, followupCount]);

  // Keyboard: j/k move between drafts, o opens the selected one, e goes to the next question.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return;
      const action = shortcutFor({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        target: e.target as HTMLElement | null,
      });
      if (!action) return;
      if (action === "next" || action === "previous") {
        if (!drafts.length) return;
        e.preventDefault();
        const next = moveSelection(
          selected,
          action === "next" ? 1 : -1,
          drafts.length,
        );
        setSelected(next);
        const card = cards.current[next];
        card?.focus({ preventScroll: true });
        card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else if (action === "open") {
        const url = drafts[selected]?.draft?.openUrl;
        if (!url) return;
        e.preventDefault();
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const field = document.querySelector<HTMLTextAreaElement>(
          'section[aria-labelledby="orbi-questions"] textarea',
        );
        if (!field) return;
        e.preventDefault();
        field.focus();
        field.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drafts, selected]);

  async function markSeen() {
    setMarking(true);
    try {
      const response = await fetch("/api/v1/inbox/today", { method: "POST" });
      if (!response.ok) throw new Error("failed");
      setSelected(-1);
      await refresh();
    } catch {
      setError("Impossible d’enregistrer votre passage. Réessayez.");
    } finally {
      setMarking(false);
    }
  }

  if (load.status === "loading")
    return (
      <div className={s.page}>
        <p role="status" className={s.fine}>
          Chargement de vos décisions…
        </p>
      </div>
    );
  if (load.status === "unavailable")
    return (
      <div className={s.page}>
        <EmptyState
          headingLevel={1}
          title="Aujourd’hui"
          mood="thinking"
          action={{ href: "/start", label: "Reprendre la mise en route" }}
        >
          <p>
            C’est ici qu’Orbi vous présente chaque matin les brouillons à relire
            et les questions à trancher. Les brouillons ne sont pas encore
            activés sur ce déploiement : il n’y a donc rien à relire pour
            l’instant.
          </p>
        </EmptyState>
      </div>
    );
  if (load.status === "error" || !digest)
    return (
      <div className={s.page}>
        <p className={s.alert} role="alert">
          Impossible de charger vos décisions pour l’instant.{" "}
          <button
            type="button"
            className={s.linkButton}
            onClick={() => void refresh()}
          >
            Réessayer
          </button>
        </p>
      </div>
    );

  const { counts, settings } = digest;
  const mailbox = mailboxName(settings.provider);
  const waiting = counts.draftsReady + questionCount + followupCount;
  const state = todayState({
    drafts: counts.draftsReady,
    questions: questionCount,
    followups: followupCount,
    settings,
  });

  return (
    <div className={s.page}>
      <header className={s.head}>
        <p className={s.eyebrow}>{today()}</p>
        <h1>
          {waiting > 0
            ? plural(
                waiting,
                "décision vous attend",
                "décisions vous attendent",
              )
            : "Rien ne vous attend"}
        </h1>
        <p>
          Orbi prépare, vous décidez. Rien n’est jamais envoyé à vos clients
          sans vous.
          {drafts.length > 0 && (
            <span className={s.keys} aria-hidden="true">
              <kbd>j</kbd> <kbd>k</kbd> pour passer d’un brouillon à l’autre ·{" "}
              <kbd>o</kbd> pour l’ouvrir
              {questionCount > 0 && (
                <>
                  {" "}
                  · <kbd>e</kbd> pour répondre à une question
                </>
              )}
            </span>
          )}
        </p>
      </header>

      {digest.mode !== "scoped_autonomy" && state !== "connect" && (
        <p className={s.test} role="note">
          <strong>Mode test.</strong> Les brouillons sont simulés : rien n’est
          écrit dans {mailbox}, et rien n’est jamais envoyé.
        </p>
      )}
      {error && (
        <p className={s.alert} role="alert">
          {error}
        </p>
      )}

      {state === "connect" && (
        <EmptyState
          title="Connectez votre boîte mail"
          action={{ href: "/start", label: "Connecter Outlook ou Gmail" }}
        >
          <p>
            Orbi lit vos demandes entrantes et prépare des réponses en
            brouillon, dans votre boîte. Il lui faut un premier passage sur
            Outlook ou Gmail. Comptez environ trois minutes.
          </p>
        </EmptyState>
      )}
      {state === "continuous_off" && (
        <EmptyState title="Activez les brouillons en continu" mood="welcome">
          <p>
            Le premier passage est terminé. Pour que chaque nouvelle demande
            reçoive un brouillon prêt à relire, activez la vérification
            automatique de {mailbox}.
          </p>
          <ContinuousToggle
            initial={settings}
            onChange={(next) =>
              setLoad({
                status: "ready",
                digest: { ...digest, settings: next },
              })
            }
          />
        </EmptyState>
      )}
      {state === "quiet" && (
        <EmptyState title="Tout est à jour" mood="done">
          <p>
            Aucun brouillon à relire ni question en attente. Orbi vérifie{" "}
            {mailbox} toutes les {settings.intervalMinutes} minutes et vous
            présentera ici la prochaine demande.
          </p>
        </EmptyState>
      )}

      {drafts.length > 0 && (
        <section className={s.section} aria-labelledby="drafts-title">
          <div className={s.sectionHead}>
            <h2 id="drafts-title">
              Brouillons à relire{" "}
              <span className={s.count}>{counts.draftsReady}</span>
            </h2>
            <span className={s.fine}>Depuis {longDate(digest.since)}</span>
          </div>
          <ol className={s.drafts}>
            {drafts.map((m, i) => (
              <li key={m.id}>
                <TodayDraft
                  message={m}
                  mailbox={mailbox}
                  selected={i === selected}
                  onSelect={() => setSelected(i)}
                  cardRef={(el) => {
                    cards.current[i] = el;
                  }}
                />
              </li>
            ))}
          </ol>
          {counts.draftsReady > drafts.length && (
            <p className={s.fine}>
              Les {drafts.length} plus récents sont affichés. Les autres vous
              attendent dans le dossier Brouillons de {mailbox}.
            </p>
          )}
        </section>
      )}

      <OrbiQuestions
        count={questionCount}
        questions={digest.questions?.questions ?? []}
        newInfo={digest.newInfo ?? []}
        canAnswer={!!digest.canAnswer}
        mailbox={mailbox}
        onChange={refresh}
      />

      {followupCount > 0 && (
        <section className={s.section} aria-labelledby="followups-title">
          <div className={s.sectionHead}>
            <h2 id="followups-title">
              Relances à relire <span className={s.count}>{followupCount}</span>
            </h2>
            <Link href="/relances" className={s.secondary}>
              Voir les relances
            </Link>
          </div>
          <ul className={s.followups}>
            {followups.slice(0, 3).map((item) => {
              const f = item.followups.find((x) => x.status === "drafted");
              return (
                <li key={item.id}>
                  <div>
                    <strong>
                      {item.contact
                        ? item.contact.name || item.contact.email
                        : "Contact effacé"}
                    </strong>
                    {item.need && (
                      <span className={s.fine}> · {item.need}</span>
                    )}
                  </div>
                  {f?.preview && (
                    <p className={s.excerpt}>{f.preview.slice(0, 180)}</p>
                  )}
                  <a
                    className={s.ghost}
                    href={item.openUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Ouvrir la conversation
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {counts.needsReview > 0 && (
        <p className={s.notice}>
          {plural(counts.needsReview, "message demande", "messages demandent")}{" "}
          votre coup d’œil dans {mailbox} : Orbi n’a pas préparé de brouillon
          (destinataire à vérifier ou création non confirmée).
        </p>
      )}

      {state !== "connect" && (
        <section className={s.summary} aria-label="Résumé mesuré">
          {week ? (
            <WeekCardView data={week} />
          ) : (
            <p className={s.fine}>
              Depuis {longDate(digest.since)} :{" "}
              {plural(
                counts.draftsReady,
                "brouillon préparé",
                "brouillons préparés",
              )}
              ,{" "}
              {plural(
                counts.skipped,
                "mail laissé de côté",
                "mails laissés de côté",
              )}{" "}
              (newsletters, notifications, réponses automatiques).
            </p>
          )}
          <div className={s.footer}>
            {counts.draftsReady + counts.needsReview > 0 && (
              <button
                type="button"
                className={s.secondary}
                onClick={() => void markSeen()}
                disabled={marking}
              >
                {marking ? "Enregistrement…" : "Marquer comme vu"}
              </button>
            )}
            <Link href="/settings#boite" className={s.ghost}>
              Réglages de la boîte mail
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

function TodayDraft({
  message: m,
  mailbox,
  selected,
  onSelect,
  cardRef,
}: {
  message: InboxMessageView;
  mailbox: string;
  selected: boolean;
  onSelect: () => void;
  cardRef: (el: HTMLElement | null) => void;
}) {
  const { items, warnings } = uncertainties(m);
  return (
    <article
      ref={cardRef}
      tabIndex={-1}
      className={s.draft}
      data-selected={selected || undefined}
      onFocus={onSelect}
      onClick={onSelect}
      aria-label={
        m.subjectPreview ? `Brouillon : ${m.subjectPreview}` : "Brouillon"
      }
    >
      <header className={s.draftHead}>
        <span className={s.badge}>
          {CLASSIFICATION_LABELS[m.classification ?? ""] ?? "Demande"}
        </span>
        <h3>{m.subjectPreview ?? "Sans objet"}</h3>
      </header>
      {(items.length > 0 || warnings.length > 0) && (
        <div className={s.unsure}>
          <h4>Orbi n’était pas sûr de</h4>
          {items.length > 0 && (
            <ul>
              {items.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      <p className={s.body}>
        {splitPlaceholders(m.draftPreview ?? "").map((part, i) =>
          part.placeholder ? (
            <mark key={i} className={s.placeholder}>
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      <div className={s.draftActions}>
        {m.draft?.openUrl ? (
          <a
            href={m.draft.openUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={s.primary}
          >
            Ouvrir dans {mailbox}
          </a>
        ) : m.draft?.simulated ? (
          <span className={s.fine}>
            Brouillon simulé : rien n’a été écrit dans {mailbox}.
          </span>
        ) : null}
        {m.citations.length > 0 && (
          <details className={s.sources}>
            <summary>Sources ({m.citations.length})</summary>
            <ul>
              {m.citations.map((c, i) => (
                <li key={`${c.sourceId}-${i}`}>
                  <strong>{c.sourceName}</strong>
                  <blockquote>{c.excerpt}</blockquote>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </article>
  );
}
