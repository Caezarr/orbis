"use client";

import { useState, type FormEvent } from "react";
import s from "./account.module.css";

const WORD = "SUPPRIMER";

/**
 * « Vos données » (GDPR): export (owner/admin) and workspace deletion (owner).
 * The server re-checks everything (role, recent sign-in, typed word).
 */
export function AccountData({ role }: { role: string | null }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reauth, setReauth] = useState(false);
  const owner = role === "owner";
  const canExport = role === "owner" || role === "admin";

  async function erase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setReauth(false);
    try {
      const response = await fetch("/api/v1/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
      if (response.ok) {
        // Full navigation on purpose: the session cookies were just cleared server-side.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login?deleted=1");
        return;
      }
      if (result.code === "reauth_required") setReauth(true);
      setError(result.error ?? "Suppression impossible. Réessayez.");
    } catch {
      setError("Connexion au service impossible. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={s.card} aria-labelledby="account-data-title" lang="fr">
      <h2 id="account-data-title">Vos données</h2>
      <div className={s.block}>
        <h3>Exporter les données de l’espace</h3>
        <p>
          Un fichier ZIP (JSON et CSV) : profil, fiche entreprise, questions, demandes et relances, métadonnées des
          brouillons, rapport hebdomadaire et état de l’abonnement. Le corps des e-mails reçus n’est jamais stocké, il
          n’y figure donc pas.
        </p>
        {canExport ? (
          <a className={s.secondary} href="/api/v1/account/export" download>
            Télécharger l’export
          </a>
        ) : (
          <p className={s.fine}>Réservé au propriétaire et aux administrateurs.</p>
        )}
      </div>
      <div className={s.block}>
        <h3>Supprimer l’espace et le compte</h3>
        <p>
          Révoque l’accès à vos boîtes mail, résilie immédiatement l’abonnement (sans remboursement automatique au
          prorata) et efface définitivement toutes les données de l’espace. Les brouillons déjà créés dans votre boîte
          mail y restent. Exportez vos données avant si vous en avez besoin. Cette action est irréversible.
        </p>
        {owner ? (
          <form onSubmit={erase} className={s.form}>
            <label>
              Tapez {WORD} pour confirmer
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                maxLength={40}
              />
            </label>
            <p className={s.fine}>Par sécurité, une connexion de moins de 15 minutes est exigée.</p>
            {error && (
              <p className={s.alert} role="alert">
                {error}{" "}
                {reauth && <a href="/login?returnTo=%2Fsettings">Se reconnecter</a>}
              </p>
            )}
            <button className={s.danger} disabled={busy || confirm !== WORD}>
              {busy ? "Suppression…" : "Supprimer définitivement"}
            </button>
          </form>
        ) : (
          <p className={s.fine}>Seul le propriétaire de l’espace peut le supprimer.</p>
        )}
      </div>
    </section>
  );
}
