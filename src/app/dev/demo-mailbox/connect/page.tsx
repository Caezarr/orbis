import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { demoMailboxActive, isProductionRuntime } from "@/lib/integrations/demo-mailbox/guard";
import { demoStore } from "@/lib/integrations/demo-mailbox/store";
import s from "../demo.module.css";

export const metadata: Metadata = {
  title: "Connexion démo · Orbis",
  robots: { index: false, follow: false },
};

/**
 * Stand-in for the Google / Microsoft consent screen (local demo mailbox only;
 * 404 in production). The decision is posted to a session-scoped route that
 * only accepts this workspace's own pending demo account.
 */
export default async function DemoConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (isProductionRuntime()) notFound();
  await connection();
  if (!demoMailboxActive()) notFound();
  const id = (await searchParams).account;
  const state = demoStore().read();
  const account =
    typeof id === "string" ? state.accounts.find((a) => a.id === id && a.status === "INITIATED") : undefined;
  if (!account) notFound();
  const provider = account.provider === "gmail" ? "Gmail" : "Outlook";
  return (
    <main className={s.page}>
      <div className={s.consent}>
        <p className={s.banner}>Boîte mail de démonstration (développement local). Aucun compte réel n’est connecté.</p>
        <h1 className={s.title}>Autoriser Orbis sur {provider} ?</h1>
        <p className={s.muted}>
          Compte : <strong>{state.owner.email}</strong> ({state.company.name}, données fictives)
        </p>
        <ul className={s.scopes}>
          <li>Lire les e-mails reçus et envoyés</li>
          <li>Créer des brouillons de réponse</li>
          <li>Jamais envoyer, transférer ni supprimer</li>
        </ul>
        <form method="post" action="/api/dev/demo-mailbox/consent">
          <input type="hidden" name="account" value={account.id} />
          <div className={s.actions}>
            <button className={s.primary} type="submit" name="decision" value="approve">
              Autoriser
            </button>
            <button className={s.secondary} type="submit" name="decision" value="deny">
              Refuser
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
