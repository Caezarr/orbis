import type { Metadata } from "next";
import Link from "next/link";
import { Todo } from "@/components/legal/Todo";

export const metadata: Metadata = {
  title: "Mentions légales — Orbis",
  description: "Éditeur, hébergeur et contact du service Orbis.",
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <article>
      <h1>Mentions légales</h1>
      <p className="text-sm text-muted">
        Dernière mise à jour : <Todo>date</Todo>
      </p>

      <h2>Éditeur du service</h2>
      <ul>
        <li>
          Dénomination : <Todo>nom de la société éditrice</Todo>
        </li>
        <li>
          Forme juridique : <Todo>forme juridique (SAS, SASU, SARL…)</Todo>
        </li>
        <li>
          Capital social : <Todo>montant du capital social</Todo>
        </li>
        <li>
          SIREN : <Todo>numéro SIREN</Todo> — RCS : <Todo>ville et numéro RCS</Todo>
        </li>
        <li>
          N° de TVA intracommunautaire : <Todo>numéro de TVA</Todo>
        </li>
        <li>
          Siège social : <Todo>adresse du siège social</Todo>
        </li>
        <li>
          Directeur de la publication : <Todo>nom et qualité du directeur de la publication</Todo>
        </li>
        <li>
          Contact : <Todo>adresse e-mail de contact</Todo>
        </li>
      </ul>

      <h2>Hébergeur</h2>
      <ul>
        <li>Vercel Inc.</li>
        <li>
          Adresse : <Todo>adresse postale de Vercel Inc. (à vérifier sur vercel.com)</Todo>
        </li>
        <li>
          Contact : <Todo>contact de l’hébergeur</Todo>
        </li>
      </ul>
      <p>
        La base de données et l’authentification sont fournies par Supabase. La liste complète des prestataires figure sur la
        page <Link href="/legal/sous-traitants">Sous-traitants</Link>.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        Les éléments du site et du service Orbis (textes, interface, logo, code) sont la propriété de l’éditeur ou de ses
        concédants. Toute reproduction non autorisée est interdite. Les contenus de votre entreprise (fiche entreprise,
        brouillons, données de votre espace) restent les vôtres.
      </p>

      <h2>Signaler un contenu ou un problème</h2>
      <p>
        Écrivez à <Todo>adresse e-mail de contact</Todo>. Pour les questions relatives aux données personnelles, voir la{" "}
        <Link href="/legal/confidentialite">politique de confidentialité</Link>.
      </p>
    </article>
  );
}
