import {
  CLASSIFICATION_LABELS,
  flagLabel,
  splitPlaceholders,
  type InboxMessageView,
} from "@/lib/start/flow";
import s from "./start.module.css";

/** One reply draft to review. Shared by the /start results and the Today decisions. */
export function DraftCard({
  message: m,
  mailbox,
}: {
  message: InboxMessageView;
  mailbox: string;
}) {
  const flags = [...new Set(m.flags.map(flagLabel).filter(Boolean))];
  return (
    <article className={s.draft}>
      <header>
        <span className={s.badge}>
          {CLASSIFICATION_LABELS[m.classification ?? ""] ?? "Demande"}
        </span>
        {m.subjectPreview && <h3>{m.subjectPreview}</h3>}
      </header>
      <p className={s.draftBody}>
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
      {m.questions.length > 0 && (
        <div className={s.questions}>
          <h4>À confirmer avant d’envoyer</h4>
          <ul>
            {m.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {flags.length > 0 && (
        <ul className={s.flags}>
          {flags.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      )}
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
        ) : (
          m.draft?.simulated && (
            <span className={s.muted}>
              Brouillon simulé : non écrit dans {mailbox}.
            </span>
          )
        )}
      </div>
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
    </article>
  );
}
