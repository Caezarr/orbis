import type { Metadata } from "next";
import Link from "next/link";
import { Orbi } from "@/components/product/Orbi";
import s from "./system-page.module.css";

export const metadata: Metadata = {
  title: "Page introuvable — Orbis",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className={s.page} lang="fr">
      <header className={s.top}>
        <Link href="/" className={s.brand}>
          <span aria-hidden="true" />
          Orbis
        </Link>
      </header>
      <div className={s.center}>
        <Orbi mood="thinking" size={168} float priority />
        <p className={s.eyebrow}>Erreur 404</p>
        <h1>Je ne trouve pas cette page.</h1>
        <p>Le lien est peut-être incomplet, ou la page a été déplacée. Rien n’a été modifié dans votre espace.</p>
        <div className={s.actions}>
          <Link href="/today" className={s.primary}>
            Aller à mon espace
          </Link>
          <Link href="/" className={s.secondary}>
            Accueil d’Orbis
          </Link>
        </div>
      </div>
    </main>
  );
}
