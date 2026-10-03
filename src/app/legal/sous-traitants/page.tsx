import type { Metadata } from "next";
import Link from "next/link";
import { Todo } from "@/components/legal/Todo";

export const metadata: Metadata = {
  title: "Sous-traitants — Orbis",
  description: "Prestataires techniques auxquels Orbis fait appel pour fournir le service.",
  robots: { index: true, follow: true },
};

type Row = {
  name: string;
  status: React.ReactNode;
  role: string;
  data: string;
  location: React.ReactNode;
  safeguards: React.ReactNode;
};

const ROWS: Row[] = [
  {
    name: "Supabase",
    status: "Actif",
    role: "Authentification des comptes et base de données PostgreSQL du service.",
    data: "Adresse e-mail du compte, données de l’espace de travail (fiche entreprise, métadonnées des e-mails traités, aperçus temporaires, demandes, réglages, données de facturation de référence).",
    location: <Todo>région Supabase — UE prévue, à confirmer</Todo>,
    safeguards: <Todo>DPA Supabase, garanties de transfert le cas échéant</Todo>,
  },
  {
    name: "Vercel",
    status: "Actif",
    role: "Hébergement de l’application et exécution des fonctions serveur.",
    data: "Données traitées en transit par l’application (requêtes, contenu des e-mails pendant leur traitement), journaux techniques.",
    location: <Todo>région des fonctions Vercel</Todo>,
    safeguards: <Todo>DPA Vercel, clauses contractuelles types</Todo>,
  },
  {
    name: "OpenAI",
    status: (
      <>
        Selon la configuration — <Todo>actif / inactif</Todo>
      </>
    ),
    role: "Modèle d’IA : classement des e-mails, rédaction des brouillons, proposition de la fiche entreprise.",
    data: "Contenu des e-mails entrants et envoyés transmis pour traitement, fiche entreprise validée.",
    location: <Todo>localisation du traitement OpenAI</Todo>,
    safeguards: (
      <>
        Conditions API du fournisseur ; <Todo>vérifier / activer l’option zéro rétention</Todo>, clauses contractuelles types
      </>
    ),
  },
  {
    name: "Anthropic",
    status: (
      <>
        Selon la configuration — <Todo>actif / inactif</Todo>
      </>
    ),
    role: "Modèle d’IA (alternative à OpenAI) : mêmes usages.",
    data: "Contenu des e-mails entrants et envoyés transmis pour traitement, fiche entreprise validée.",
    location: <Todo>localisation du traitement Anthropic</Todo>,
    safeguards: (
      <>
        Conditions API du fournisseur ; <Todo>vérifier / activer l’option zéro rétention</Todo>, clauses contractuelles types
      </>
    ),
  },
  {
    name: "Composio",
    status: "Actif",
    role: "Connexion OAuth à Gmail ou Outlook, détention des jetons d’accès, appels à la messagerie (lecture, création de brouillons).",
    data: "Jetons OAuth de la boîte connectée, contenu des e-mails lus et des brouillons créés, en transit.",
    location: <Todo>localisation Composio</Todo>,
    safeguards: <Todo>DPA Composio, clauses contractuelles types</Todo>,
  },
  {
    name: "Stripe",
    status: "Actif",
    role: "Paiement de l’abonnement, portail client, factures.",
    data: "Identité et coordonnées de facturation, moyen de paiement (saisi directement chez Stripe), historique d’abonnement.",
    location: <Todo>localisation Stripe</Todo>,
    safeguards: <Todo>DPA Stripe, clauses contractuelles types</Todo>,
  },
  {
    name: "PostHog",
    status: "Optionnel — désactivé si non configuré",
    role: "Mesure du parcours produit (funnel) à partir d’événements.",
    data: "Événements comportant uniquement des identifiants techniques, sans contenu d’e-mail.",
    location: <Todo>région PostHog (UE ou US)</Todo>,
    safeguards: <Todo>DPA PostHog, clauses contractuelles types</Todo>,
  },
  {
    name: "Sentry",
    status: "Optionnel — désactivé si non configuré",
    role: "Suivi des erreurs techniques.",
    data: "Traces d’erreur ; adresses e-mail, contenu des e-mails et jetons filtrés avant envoi.",
    location: <Todo>région Sentry</Todo>,
    safeguards: <Todo>DPA Sentry, clauses contractuelles types</Todo>,
  },
];

export default function Page() {
  return (
    <article>
      <h1>Sous-traitants</h1>
      <p className="text-sm text-muted">
        Dernière mise à jour : <Todo>date</Todo>
      </p>
      <p>
        Orbis fait appel aux prestataires ci-dessous pour fournir le service. Chacun n’accède qu’aux données nécessaires à
        sa fonction. Le fournisseur du modèle d’IA (OpenAI ou Anthropic) est choisi dans la configuration serveur
        d’Orbis : un seul est utilisé à un instant donné. Les prestataires marqués « optionnel » ne reçoivent aucune donnée
        s’ils ne sont pas configurés.
      </p>
      <p>
        Toute modification de cette liste sera annoncée <Todo>délai et modalités d’information préalable des clients</Todo>.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2">Prestataire</th>
              <th scope="col" className="px-3 py-2">Rôle</th>
              <th scope="col" className="px-3 py-2">Données</th>
              <th scope="col" className="px-3 py-2">Localisation</th>
              <th scope="col" className="px-3 py-2">Garanties</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.name} className="border-t border-line align-top">
                <th scope="row" className="px-3 py-3 font-semibold">
                  {row.name}
                  <span className="mt-1 block text-xs font-normal text-muted">{row.status}</span>
                </th>
                <td className="px-3 py-3">{row.role}</td>
                <td className="px-3 py-3">{row.data}</td>
                <td className="px-3 py-3">{row.location}</td>
                <td className="px-3 py-3">{row.safeguards}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        Voir aussi la <Link href="/legal/confidentialite">politique de confidentialité</Link>.
      </p>
    </article>
  );
}
