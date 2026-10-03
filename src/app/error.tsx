"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Orbi } from "@/components/product/Orbi";
import s from "./system-page.module.css";

/**
 * Root error boundary. Orbi asks the user to retry; no stack or raw message is shown
 * (production messages are generic anyway), only the digest to quote to support.
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className={s.page} lang="fr">
      <header className={s.top}>
        <Link href="/" className={s.brand}>
          <span aria-hidden="true" />
          Orbis
        </Link>
      </header>
      <div className={s.center} role="alert">
        <Orbi mood="thinking" size={152} />
        <p className={s.eyebrow}>Un souci de notre côté</p>
        <h1>Cette page n’a pas pu s’afficher.</h1>
        <p>Rien n’a été envoyé. Réessayez : si le problème continue, revenez à votre espace.</p>
        <div className={s.actions}>
          <button type="button" className={s.primary} onClick={() => retry()}>
            Réessayer
          </button>
          <Link href="/today" className={s.secondary}>
            Aller à mon espace
          </Link>
        </div>
        {error.digest && (
          <p className={s.ref}>
            Référence : <code>{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
