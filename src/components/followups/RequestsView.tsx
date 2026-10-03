"use client";

import { splitPlaceholders } from "@/lib/start/flow";
import type { RequestView } from "@/lib/followups/service";
import type { PipelineStatus } from "@/lib/followups/detect";
import s from "./followups.module.css";

export type RequestsData = {
  items: RequestView[];
  counts: Record<PipelineStatus, number>;
  settings: { enabled: boolean; businessDays: number; maxStages: number; replyBaselineMinutes: number | null };
  mode: "test" | "scoped_autonomy";
  canEdit: boolean;
  canAdmin: boolean;
};
export type RequestAction =
  | { action: "won" | "lost" | "reopen" | "dismiss_followups" | "resume_followups" | "erase_contact" }
  | { action: "snooze"; days: number };
export type Filters = { status?: PipelineStatus; kind?: "customer_request" | "quote_request"; q?: string; followup?: "ready" };

const STATUS_CHIPS: { id: PipelineStatus; label: string }[] = [
  { id: "nouveau", label: "Nouveau" },
  { id: "repondu", label: "Répondu" },
  { id: "relance", label: "Relancé" },
  { id: "gagne", label: "Gagné" },
  { id: "perdu", label: "Perdu" },
];
const FOLLOWUP_STATUS: Record<string, string> = {
  drafting: "En préparation",
  drafted: "Brouillon de relance prêt",
  needs_review: "À vérifier (destinataire)",
  uncertain: "Création non confirmée",
  failed: "Échec, nouvel essai plus tard",
  not_needed: "Pas de relance nécessaire",
  dismissed: "Écartée",
};
export const dateFr = (iso: string | null, withTime = false) =>
  iso
    ? new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        day: "numeric",
        month: "short",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      }).format(new Date(iso))
    : "—";
function statusClass(status: PipelineStatus) {
  return status === "gagne" ? s.ok : status === "perdu" ? s.bad : status === "nouveau" ? s.warn : s.badge;
}
function Body({ text }: { text: string }) {
  return (
    <p>
      {splitPlaceholders(text).map((part, i) =>
        part.placeholder ? (
          <mark key={i} className={s.placeholder}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

export function RequestsView({
  data,
  filters,
  busy,
  error,
  notice,
  onFilter,
  onAction,
  onSaveSettings,
}: {
  data: RequestsData;
  filters: Filters;
  busy: string | null;
  error?: string;
  notice?: string;
  onFilter: (f: Filters) => void;
  onAction: (id: string, action: RequestAction) => void;
  onSaveSettings?: (settings: RequestsData["settings"]) => void;
}) {
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  return (
    <div className={`${s.root} ${s.page}`}>
      <header className={s.head}>
        <h1>Demandes</h1>
        <p>
          Chaque demande de client ou de devis reçue devient une ligne. Le statut avance tout seul quand vous répondez ou
          relancez ; « gagné » et « perdu » restent votre décision. Aucune valeur n’est inventée : le besoin, le budget et le
          délai ne sont remplis que s’ils figurent mot pour mot dans le mail du client.
        </p>
      </header>
      {data.mode !== "scoped_autonomy" && (
        <p className={s.test} role="note">
          Mode test : les brouillons de relance sont simulés, rien n’est écrit dans votre boîte mail.
        </p>
      )}
      {error && (
        <p className={s.alert} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={s.notice} role="status">
          {notice}
        </p>
      )}

      <section className={s.panel} aria-label="Filtres">
        <div className={s.chips} role="group" aria-label="Statut">
          <button type="button" className={s.chip} aria-pressed={!filters.status && !filters.followup} onClick={() => onFilter({ ...filters, status: undefined, followup: undefined })}>
            Toutes ({total})
          </button>
          {STATUS_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={s.chip}
              aria-pressed={filters.status === c.id}
              onClick={() => onFilter({ ...filters, status: filters.status === c.id ? undefined : c.id, followup: undefined })}
            >
              {c.label} ({data.counts[c.id] ?? 0})
            </button>
          ))}
          <button
            type="button"
            className={s.chip}
            aria-pressed={filters.followup === "ready"}
            onClick={() => onFilter({ ...filters, status: undefined, followup: filters.followup === "ready" ? undefined : "ready" })}
          >
            Relances à relire
          </button>
        </div>
        <div className={s.toolbar}>
          <input
            className={s.search}
            type="search"
            placeholder="Rechercher un contact ou un besoin"
            aria-label="Rechercher"
            defaultValue={filters.q ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") onFilter({ ...filters, q: (e.target as HTMLInputElement).value.trim() || undefined });
            }}
          />
          <select
            className={s.select}
            aria-label="Type"
            value={filters.kind ?? ""}
            onChange={(e) => onFilter({ ...filters, kind: (e.target.value || undefined) as Filters["kind"] })}
          >
            <option value="">Tous les types</option>
            <option value="quote_request">Devis</option>
            <option value="customer_request">Demandes</option>
          </select>
          {data.canAdmin && (
            <a className={s.secondary} href="/api/v1/requests/export" download>
              Exporter en CSV
            </a>
          )}
        </div>
      </section>

      {data.items.length === 0 ? (
        <p className={s.empty}>
          Aucune demande pour ce filtre. Les demandes apparaissent ici dès qu’Orbi a classé un mail de client ou de devis.
        </p>
      ) : (
        <ul className={s.list}>
          {data.items.map((item) => (
            <li key={item.id} className={s.item} data-status={item.status}>
              <div className={s.itemHead}>
                <p className={s.contact}>
                  {item.contact ? item.contact.name || item.contact.email : "Contact effacé"}
                  {item.contact?.name && item.contact.email && <small>{item.contact.email}</small>}
                </p>
                <span className={s.actions} style={{ gap: 6 }}>
                  <span className={s.badge}>{item.kind === "quote_request" ? "Devis" : "Demande"}</span>
                  <span className={statusClass(item.status)}>{item.statusLabel}</span>
                </span>
              </div>
              <p className={s.need}>
                {item.need ?? <span className={s.missing}>Besoin à lire dans le mail (aucun résumé vérifiable)</span>}
              </p>
              <dl className={s.facts}>
                <div>
                  <dt>Reçu</dt>
                  <dd>{dateFr(item.receivedAt, true)}</dd>
                </div>
                <div>
                  <dt>Budget</dt>
                  <dd>{item.budget ? `« ${item.budget} »` : "non indiqué"}</dd>
                </div>
                <div>
                  <dt>Délai</dt>
                  <dd>{item.deadline ? `« ${item.deadline} »` : "non indiqué"}</dd>
                </div>
                <div>
                  <dt>1re réponse</dt>
                  <dd>{dateFr(item.firstRepliedAt, true)}</dd>
                </div>
                <div>
                  <dt>Brouillons</dt>
                  <dd>{item.drafts}</dd>
                </div>
              </dl>
              {item.followups
                .filter((f) => f.status !== "dismissed" && f.status !== "not_needed")
                .map((f) => (
                  <div key={f.id} className={s.followup}>
                    <span className={f.status === "drafted" ? s.ok : f.status === "needs_review" ? s.warn : s.badge}>
                      Relance {f.stage} · {FOLLOWUP_STATUS[f.status] ?? f.status}
                      {f.simulated ? " (simulé)" : ""}
                      {f.draftedAt ? ` · ${dateFr(f.draftedAt, true)}` : ""}
                    </span>
                    {f.preview && <Body text={f.preview} />}
                    {f.status === "drafted" && (
                      <p className={s.fine}>
                        {f.simulated
                          ? "Mode test : ce brouillon n’a pas été écrit dans votre boîte."
                          : "Le brouillon est dans la conversation, dans votre boîte mail. Rien n’est envoyé sans vous."}
                      </p>
                    )}
                  </div>
                ))}
              {item.snoozedUntil && new Date(item.snoozedUntil) > new Date() && (
                <p className={s.fine}>Relances en pause jusqu’au {dateFr(item.snoozedUntil)}.</p>
              )}
              {item.followupsDismissed && <p className={s.fine}>Pas de relance pour cette demande.</p>}
              {data.canEdit && (
                <div className={s.actions}>
                  {item.status === "gagne" || item.status === "perdu" ? (
                    <button type="button" className={s.secondary} disabled={busy === item.id} onClick={() => onAction(item.id, { action: "reopen" })}>
                      Rouvrir
                    </button>
                  ) : (
                    <>
                      <button type="button" className={s.secondary} disabled={busy === item.id} onClick={() => onAction(item.id, { action: "won" })}>
                        Gagné
                      </button>
                      <button type="button" className={s.secondary} disabled={busy === item.id} onClick={() => onAction(item.id, { action: "lost" })}>
                        Perdu
                      </button>
                      {item.followupsDismissed ? (
                        <button type="button" className={s.ghost} disabled={busy === item.id} onClick={() => onAction(item.id, { action: "resume_followups" })}>
                          Reprendre les relances
                        </button>
                      ) : (
                        <>
                          <button type="button" className={s.ghost} disabled={busy === item.id} onClick={() => onAction(item.id, { action: "snooze", days: 7 })}>
                            Relancer plus tard (7 j)
                          </button>
                          <button type="button" className={s.ghost} disabled={busy === item.id} onClick={() => onAction(item.id, { action: "dismiss_followups" })}>
                            Ne pas relancer
                          </button>
                        </>
                      )}
                    </>
                  )}
                  <a className={s.ghost} href={item.openUrl} target="_blank" rel="noreferrer">
                    Ouvrir la conversation
                  </a>
                  {data.canAdmin && item.contact && (
                    <button type="button" className={s.ghost} disabled={busy === item.id} onClick={() => onAction(item.id, { action: "erase_contact" })}>
                      Effacer le contact
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <FollowupSettings settings={data.settings} canAdmin={data.canAdmin} busy={busy === "settings"} onSave={onSaveSettings} />
      <p className={s.fine}>
        Données personnelles : Orbi garde le nom et l’adresse e-mail du client pour votre propre suivi commercial (intérêt
        légitime), jamais le texte de son mail. Ces données sont effacées 24 mois après la dernière activité, à la demande
        (« Effacer le contact ») ou avec l’espace de travail.
      </p>
    </div>
  );
}

function FollowupSettings({
  settings,
  canAdmin,
  busy,
  onSave,
}: {
  settings: RequestsData["settings"];
  canAdmin: boolean;
  busy: boolean;
  onSave?: (settings: RequestsData["settings"]) => void;
}) {
  return (
    <section className={s.panel} aria-labelledby="followup-settings">
      <h2 id="followup-settings">Relances</h2>
      <p className={s.fine}>
        Quand votre dernier message (devis, offre ou réponse) reste sans réponse du client pendant{" "}
        {settings.businessDays} jours ouvrés (week-ends et jours fériés exclus), Orbi prépare un brouillon de relance dans la
        même conversation, adressé à ce client uniquement. Au plus {settings.maxStages} relance
        {settings.maxStages > 1 ? "s" : ""} par demande. Chaque brouillon compte dans votre quota. Les relances passent avec
        les brouillons en continu.
      </p>
      {canAdmin && onSave && (
        <form
          className={s.settings}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const baseline = String(f.get("baseline") ?? "").trim();
            onSave({
              enabled: f.get("enabled") === "on",
              businessDays: Number(f.get("days")),
              maxStages: Number(f.get("stages")),
              replyBaselineMinutes: baseline ? Number(baseline) : null,
            });
          }}
        >
          <label className={s.check}>
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} /> Proposer des relances
          </label>
          <label className={s.field}>
            Jours ouvrés sans réponse
            <input type="number" name="days" min={1} max={30} defaultValue={settings.businessDays} required />
          </label>
          <label className={s.field}>
            Relances au maximum
            <input type="number" name="stages" min={1} max={2} defaultValue={settings.maxStages} required />
          </label>
          <label className={s.field}>
            Votre référence : minutes pour écrire une réponse (facultatif)
            <input type="number" name="baseline" min={1} max={240} defaultValue={settings.replyBaselineMinutes ?? ""} />
          </label>
          <div className={s.actions}>
            <button type="submit" className={s.primary} disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
