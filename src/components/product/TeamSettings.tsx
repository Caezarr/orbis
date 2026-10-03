"use client";
import { useState } from "react";
import { useWorkspace } from "@/components/shell/WorkspaceProvider";
import type { StoreState } from "@/lib/domain/types";
import s from "./workspace.module.css";

const ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  operator: "Opérateur",
  expert: "Expert",
  viewer: "Lecteur",
};
type Tab = "people" | "groups" | "roles" | "usage";
const TABS: { id: Tab; label: string; full?: boolean }[] = [
  { id: "people", label: "Personnes" },
  { id: "groups", label: "Groupes" },
  { id: "roles", label: "Rôles" },
  // Mission run usage belongs to the frozen horizontal product.
  { id: "usage", label: "Consommation des missions", full: true },
];

/** Réglages › Équipe. `full` = frozen surfaces enabled (adds mission usage and the legacy JSON export). */
export function TeamSettings({ full = false }: { full?: boolean }) {
  const { data, loading, reload } = useWorkspace<StoreState>();
  const [tab, setTab] = useState<Tab>("people"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (loading || !data) return <p role="status">Chargement de l’équipe…</p>;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body =
        tab === "people"
          ? {
              action: "member",
              name: f.get("name"),
              email: f.get("email"),
              role: f.get("role"),
            }
          : {
              action: "group",
              name: f.get("name"),
              memberIds: f.getAll("members"),
            };
      const r = await fetch("/api/v1/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(r.status === 403 ? "Votre rôle ne permet pas de modifier l’équipe." : "Enregistrement impossible. Vérifiez les champs et réessayez.");
      await reload();
      form.reset();
      setNotice("Enregistré dans l’annuaire de l’espace.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.page} style={{ maxWidth: "none" }}>
      <nav className={s.tabs} aria-label="Sections de l’équipe">
        {TABS.filter((t) => full || !t.full).map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setError("");
              setNotice("");
            }}
          >
            {t.label}
          </button>
        ))}
        {full && (
          <a href="/api/v1/export" download="orbis-export.json">
            Export JSON (ancien format)
          </a>
        )}
      </nav>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {tab === "people" && (
        <>
          <section className={s.section}>
            <h2>Annuaire de l’espace</h2>
            <p>
              L’annuaire sert à organiser votre équipe. Les invitations par e-mail ne sont pas encore disponibles : seules
              les personnes qui se connectent avec leur propre compte ont accès à l’espace.
            </p>
            {data.memberships.map((m) => (
              <div className={s.row} key={m.id}>
                <div>
                  <strong>{m.name}</strong>
                  <p>{m.email}</p>
                </div>
                <span className={s.badge}>{ROLE_LABELS[m.role] ?? m.role}</span>
              </div>
            ))}
          </section>
          <form key="person" className={s.section} onSubmit={save}>
            <h2>Ajouter une personne</h2>
            <div className={s.grid}>
              <label>
                Nom complet
                <input name="name" required minLength={2} maxLength={100} />
              </label>
              <label>
                E-mail
                <input name="email" type="email" required maxLength={254} />
              </label>
              <label>
                Rôle
                <select name="role">
                  <option value="operator">Opérateur</option>
                  <option value="expert">Expert</option>
                  <option value="admin">Administrateur</option>
                </select>
              </label>
            </div>
            <button disabled={busy} className={`${s.primary} mt-5`}>
              {busy ? "Enregistrement…" : "Ajouter à l’annuaire"}
            </button>
          </form>
        </>
      )}
      {tab === "groups" && (
        <>
          <section className={s.section}>
            <h2>Vos groupes</h2>
            {data.teamGroups?.length ? (
              data.teamGroups.map((g) => (
                <div className={s.row} key={g.id}>
                  <div>
                    <strong>{g.name}</strong>
                    <p>
                      {g.memberIds
                        .map((id) => data.memberships.find((m) => m.id === id)?.name)
                        .filter(Boolean)
                        .join(", ") || "Aucun membre pour l’instant"}
                    </p>
                  </div>
                  <span>
                    {g.memberIds.length} personne{g.memberIds.length > 1 ? "s" : ""}
                  </span>
                </div>
              ))
            ) : (
              <p>Créez un groupe pour réunir des personnes autour d’une équipe ou d’un client.</p>
            )}
          </section>
          <form key="group" className={s.section} onSubmit={save}>
            <h2>Créer un groupe</h2>
            <label>
              Nom du groupe
              <input name="name" required minLength={2} maxLength={100} />
            </label>
            <fieldset className="my-5">
              <legend>Membres</legend>
              {data.memberships.map((m) => (
                <label key={m.id} className="my-3">
                  <span>
                    <input style={{ width: "auto", marginRight: 10 }} name="members" type="checkbox" value={m.id} />
                    {m.name}
                  </span>
                </label>
              ))}
            </fieldset>
            <button disabled={busy} className={s.primary}>
              {busy ? "Enregistrement…" : "Créer le groupe"}
            </button>
          </form>
        </>
      )}
      {tab === "roles" && (
        <section className={s.section}>
          <h2>Qui peut faire quoi</h2>
          {[
            ["Propriétaire", "Le compte, l’abonnement, la suppression de l’espace. Répond aux questions d’Orbi."],
            ["Administrateur", "Les réglages de la boîte mail et l’export des données. Répond aux questions d’Orbi."],
            ["Opérateur", "Connecte la boîte mail, relit les brouillons et suit les demandes."],
            ["Expert", "Suit les demandes et la fiche entreprise."],
          ].map(([title, description]) => (
            <div className={s.row} key={title}>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            </div>
          ))}
        </section>
      )}
      {full && tab === "usage" && (
        <section className={s.section}>
          <h2>Coûts enregistrés des missions</h2>
          <p>Entrées de coût enregistrées par les missions, pas une facture du fournisseur.</p>
          {["provider", "platform", "connector", "human_review"].map((kind) => (
            <div className={s.row} key={kind}>
              <strong>
                {{ provider: "Modèle d’IA", platform: "Plateforme", connector: "Connecteurs", human_review: "Relecture humaine" }[kind]}
              </strong>
              <span>
                {data.usage
                  .filter((u) => u.kind === kind && data.runs.some((r) => r.id === u.runId && r.engine === "agent-v1"))
                  .reduce((sum, u) => sum + u.amountEur, 0)
                  .toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
