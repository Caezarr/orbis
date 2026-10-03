import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth/AuthPanel";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { authOptions, safeReturnTo } from "@/lib/platform/auth";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Connexion — Orbis",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(typeof params.returnTo === "string" ? params.returnTo : undefined);
  const failed = params.error === "confirmation";
  const deleted = params.deleted === "1";
  return (
    <main className={styles.page}>
      <section className={styles.formPane}>
        <Link href="/" className={styles.brand}>
          <span aria-hidden="true" />
          Orbis
        </Link>
        <div>
          <h1>Bon retour sur Orbis.</h1>
          <p>Vos brouillons de réponse vous attendent. Rien n’est jamais envoyé sans vous.</p>
          {deleted && (
            <p role="status" className={styles.fine}>
              Votre espace a été supprimé. Merci d’avoir essayé Orbis.
            </p>
          )}
          {failed && (
            <p role="alert" className={styles.message}>
              Le lien a expiré ou a déjà servi, ou il a été ouvert dans un autre navigateur. Demandez-en un nouveau.
            </p>
          )}
          <AuthPanel options={authOptions()} returnTo={returnTo} initialMode="sign-in" />
          <LegalLinks className={styles.legal} />
        </div>
      </section>
      <aside className={styles.preview} aria-label="Aperçu de l’espace de travail">
        <div className={styles.previewInner}>
          <div className={styles.orb} aria-hidden="true" />
          <p className={styles.previewLead}>Votre boîte, en ordre.</p>
          <h2>
            Les demandes triées. <em>Les réponses prêtes.</em>
          </h2>
          <p className={styles.previewLead}>Orbi prépare des brouillons sourcés ; vous relisez et vous envoyez.</p>
          <div className={styles.mock}>
            <div className={styles.mockTop}>
              <span className={styles.dot} />
              <span>Aujourd’hui</span>
              <span style={{ marginLeft: "auto" }}>Votre espace</span>
            </div>
            <div className={styles.mockRow}>
              <div>
                <strong>Brouillons à relire</strong>
                <br />
                <small>Dans votre boîte mail</small>
              </div>
              <span>→</span>
            </div>
            <div className={styles.mockRow}>
              <div>
                <strong>Questions d’Orbi</strong>
                <br />
                <small>Une fois, jamais deux</small>
              </div>
              <span>?</span>
            </div>
            <div className={styles.mockRow}>
              <div>
                <strong>Demandes</strong>
                <br />
                <small>Relances préparées</small>
              </div>
              <span>+</span>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}
