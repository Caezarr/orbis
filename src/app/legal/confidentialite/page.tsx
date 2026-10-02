import type { Metadata } from "next";
import Link from "next/link";
import { Todo } from "@/components/legal/Todo";

export const metadata: Metadata = {
  title: "Politique de confidentialité — Orbis",
  description: "Données traitées par Orbis, finalités, durées de conservation, sous-traitants et droits RGPD.",
  robots: { index: true, follow: true },
};

function Retention({ rows }: { rows: [React.ReactNode, React.ReactNode][] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="px-3 py-2">Donnée</th>
            <th scope="col" className="px-3 py-2">Durée de conservation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([data, duration], i) => (
            <tr key={i} className="border-t border-line align-top">
              <td className="px-3 py-2">{data}</td>
              <td className="px-3 py-2">{duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Page() {
  return (
    <article>
      <h1>Politique de confidentialité</h1>
      <p className="text-sm text-muted">
        Dernière mise à jour : <Todo>date</Todo>
      </p>
      <p>
        Cette politique explique quelles données Orbis traite, pourquoi, combien de temps, et comment exercer vos droits
        au titre du Règlement général sur la protection des données (RGPD) et de la loi Informatique et Libertés.
      </p>

      <h2>1. Qui est responsable ?</h2>
      <p>
        Orbis est édité par <Todo>nom de la société éditrice</Todo>, <Todo>adresse du siège social</Todo>. Contact pour
        les données personnelles : <Todo>adresse e-mail du DPO ou du contact données personnelles</Todo>.
      </p>
      <p>Orbis intervient selon deux rôles distincts :</p>
      <ul>
        <li>
          <strong>Sous-traitant</strong> pour les e-mails de votre boîte connectée et les données de vos clients et
          contacts qu’ils contiennent. Votre entreprise reste responsable de traitement de ces données ; Orbis ne les
          traite que sur vos instructions, pour fournir le service. <Todo>référence au DPA (accord de sous-traitance)</Todo>
          .
        </li>
        <li>
          <strong>Responsable de traitement</strong> pour les données de votre compte utilisateur, de facturation, de
          sécurité (limitation des abus) et de mesure d’usage du produit.
        </li>
      </ul>

      <h2>2. Données traitées</h2>
      <h3>Compte</h3>
      <ul>
        <li>
          Adresse e-mail, et selon la méthode de connexion choisie : mot de passe (géré par Supabase Auth, jamais visible
          par Orbis en clair), lien de connexion par e-mail, ou connexion Google ou Microsoft si elle est proposée.
        </li>
        <li>Nom de l’espace de travail, réglages, rôle dans l’espace.</li>
      </ul>

      <h3>Boîte mail connectée</h3>
      <ul>
        <li>
          La connexion à Gmail ou Outlook passe par Composio, qui détient les jetons OAuth. Orbis ne connaît pas votre mot
          de passe de messagerie.
        </li>
        <li>
          <strong>Le corps des e-mails reçus n’est pas stocké par Orbis.</strong> Il est conservé en mémoire le temps du
          traitement et transmis uniquement au fournisseur du modèle d’IA pour le classement et la rédaction du brouillon.
        </li>
        <li>
          Orbis conserve, pour chaque e-mail traité : les identifiants techniques du fournisseur de messagerie, des
          empreintes (hash SHA-256), le classement obtenu, un aperçu de l’objet (120 caractères au plus) et un aperçu du
          brouillon rédigé par Orbis (1 200 caractères au plus). Ces aperçus sont effacés après 30 jours.
        </li>
        <li>Le brouillon complet est créé dans votre boîte mail ; il y reste sous votre contrôle.</li>
      </ul>

      <h3>Fiche entreprise</h3>
      <ul>
        <li>
          Orbis lit une fois vos e-mails envoyés (90 derniers jours, 200 messages au plus) pour proposer des informations sur
          votre activité (prestations, délais, conditions…).
        </li>
        <li>
          Chaque information proposée peut être accompagnée de courtes citations (240 caractères au plus) dont les noms,
          adresses e-mail et numéros de téléphone de tiers sont masqués. Les citations sont effacées si vous rejetez
          l’information.
        </li>
        <li>Seules les informations que vous avez validées sont utilisées pour rédiger les brouillons.</li>
      </ul>

      <h3>Demandes et relances</h3>
      <ul>
        <li>
          Liste « Demandes » : nom, adresse e-mail et domaine du contact, résumé court du besoin, budget et délai tels
          qu’exprimés par le client (extraits de ses propres mots).
        </li>
        <li>Brouillons de relance : un aperçu est conservé, effacé après 30 jours.</li>
        <li>Rapport hebdomadaire : uniquement des nombres agrégés.</li>
      </ul>

      <h3>Page de démarrage (« /start ») sans compte</h3>
      <ul>
        <li>
          Si vous indiquez l’adresse de votre site, la page web publique est lue côté serveur pour en tirer un profil. Ce
          profil n’est pas enregistré sur nos serveurs : il est conservé dans le stockage local de votre navigateur pendant
          24 heures au plus.
        </li>
        <li>
          Un aperçu de brouillon par IA peut être généré à partir de ce contenu public, avec des limites de fréquence. Le
          résultat est gardé en mémoire vive du serveur jusqu’à 6 heures (pour ne pas le générer deux fois), sans être
          écrit en base de données.
        </li>
      </ul>

      <h3>Sécurité et limitation des abus</h3>
      <ul>
        <li>
          Des compteurs de requêtes sont associés à une empreinte (hash) de l’adresse IP ou de l’adresse e-mail, et non à
          l’adresse en clair. Ils sont conservés 2 jours au plus (suppression quotidienne des fenêtres expirées). Un
          compteur temporaire tenu en mémoire vive du serveur (jamais écrit sur disque ni en base, perdu au redémarrage)
          peut utiliser l’adresse IP telle quelle.
        </li>
      </ul>

      <h3>Mesure d’usage et erreurs</h3>
      <ul>
        <li>
          Événements de parcours produit (par exemple « boîte connectée », « premier brouillon créé ») contenant uniquement
          des identifiants techniques, jamais le contenu des e-mails. Ces événements peuvent être transmis à PostHog si cet
          outil est activé.
        </li>
        <li>
          Si le suivi des erreurs (Sentry) est activé, les adresses e-mail, le contenu des e-mails et les jetons sont
          filtrés avant envoi.
        </li>
      </ul>

      <h3>Facturation</h3>
      <ul>
        <li>
          Identifiant client Stripe, statut et formule d’abonnement. Les données de paiement sont saisies et conservées par
          Stripe.
        </li>
      </ul>

      <h2>3. Finalités et bases légales</h2>
      <ul>
        <li>
          Fournir le service (lecture des e-mails, classement, brouillons, relances, demandes, fiche entreprise, rapport) :{" "}
          exécution du contrat ; pour les données de vos contacts, traitement réalisé sur vos instructions en tant que
          sous-traitant.
        </li>
        <li>Gestion du compte, de l’abonnement et de la facturation : exécution du contrat et obligations légales.</li>
        <li>Sécurité, prévention des abus et limitation de fréquence : intérêt légitime.</li>
        <li>
          Mesure d’usage du produit et suivi des erreurs : intérêt légitime <Todo>ou consentement, selon l’analyse retenue pour PostHog</Todo>.
        </li>
      </ul>

      <h2>4. Intelligence artificielle</h2>
      <p>
        Les modèles utilisés sont fournis par OpenAI ou Anthropic, selon la configuration serveur d’Orbis. Vos données ne
        sont pas utilisées pour entraîner ces modèles, selon les conditions API du fournisseur ;{" "}
        <Todo>vérifier / activer l’option zéro rétention</Todo>.
      </p>
      <p>
        Le contenu des e-mails est traité comme une donnée non fiable : une instruction glissée dans un e-mail ne peut pas
        déclencher d’envoi, aucun outil à la disposition du modèle ne permettant d’envoyer, de transférer ou de supprimer
        un message.
      </p>

      <h2>5. Durées de conservation</h2>
      <Retention
        rows={[
          ["Corps des e-mails reçus", "Non stocké (mémoire, le temps du traitement)"],
          ["Aperçu de l’objet et du brouillon Orbis", "30 jours"],
          ["Aperçu des brouillons de relance", "30 jours"],
          ["Identifiants, empreintes et classement des e-mails traités", "Durée de vie de l’espace"],
          ["Fiche entreprise validée", "Durée de vie de l’espace, ou jusqu’à suppression par vous"],
          ["Citations d’une information rejetée", "Effacées au rejet"],
          [
            "Données de contact des demandes (nom, e-mail, domaine, besoin, budget, délai)",
            "Effacées 24 mois après la dernière activité, ou à la demande (« Effacer le contact »)",
          ],
          ["Profil de site sur /start (sans compte)", "Navigateur du visiteur, 24 heures au plus"],
          ["Compteurs anti-abus (empreinte d’IP ou d’e-mail)", "2 jours au plus"],
          ["Compte et espace", "Jusqu’à suppression du compte"],
          ["Factures", "Conservées par Stripe selon ses propres obligations légales"],
          [
            "Sauvegardes de la base de données",
            <Todo key="b">durée de rétention des sauvegardes Supabase</Todo>,
          ],
        ]}
      />

      <h2>6. Sous-traitants et transferts hors UE</h2>
      <p>
        Orbis fait appel à Supabase, Vercel, OpenAI ou Anthropic, Composio, Stripe et, s’ils sont activés, PostHog et
        Sentry. Le détail figure sur la page <Link href="/legal/sous-traitants">Sous-traitants</Link>.
      </p>
      <p>
        La base de données est prévue dans l’Union européenne : <Todo>région Supabase à confirmer</Todo>. Certains
        prestataires peuvent traiter des données hors de l’Union européenne, notamment aux États-Unis. Ces transferts sont
        encadrés par <Todo>pour chaque prestataire : décision d’adéquation (EU-US Data Privacy Framework) et/ou clauses contractuelles types de la Commission européenne</Todo>.
      </p>

      <h2>7. Vos droits</h2>
      <p>Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité.</p>
      <ul>
        <li>
          <strong>Export en ligne</strong> : le propriétaire de l’espace peut télécharger les données de l’espace (archive
          ZIP en JSON/CSV) depuis les Réglages.
        </li>
        <li>
          <strong>Suppression en ligne</strong> : le propriétaire peut supprimer l’espace et le compte depuis les Réglages
          (connexion récente et confirmation écrite requises). La suppression révoque les connexions de messagerie chez
          Composio, résilie l’abonnement et efface immédiatement toutes les données de l’espace. Un enregistrement minimal
          sans donnée personnelle (identifiant haché, date, volumes supprimés) est conservé comme preuve de suppression.
          Les sauvegardes de l’hébergeur expirent selon <Todo>durée de rétention des sauvegardes Supabase</Todo>. Les
          brouillons déjà créés dans votre boîte mail y restent ; vous pouvez les supprimer depuis votre messagerie.
        </li>
        <li>
          <strong>Effacer un contact</strong> : depuis la liste « Demandes », l’action « Effacer le contact » supprime ses
          données de contact.
        </li>
        <li>
          <strong>Rectification, opposition et autres demandes</strong> : écrivez à{" "}
          <Todo>adresse e-mail du DPO ou du contact données personnelles</Todo>. Nous répondons dans un délai d’un mois.
        </li>
        <li>
          Si une personne dont les e-mails ont été traités (un de vos clients) nous contacte, nous transmettons sa demande à
          l’entreprise utilisatrice concernée, responsable de traitement.
        </li>
        <li>
          Vous pouvez introduire une réclamation auprès de la CNIL (<a href="https://www.cnil.fr" rel="noopener noreferrer">www.cnil.fr</a>).
        </li>
      </ul>

      <h2>8. Sécurité</h2>
      <p>
        Mesures mises en place : chiffrement des échanges (HTTPS), jetons de messagerie détenus par Composio et jamais
        transmis au modèle d’IA, autorisations OAuth limitées à la lecture et à la création de brouillons, cloisonnement des
        données par espace, réauthentification avant les actions sensibles (suppression). <Todo>compléter : chiffrement au repos, contrôle d’accès interne, procédure de notification des violations</Todo>.
        Aucun système n’étant infaillible, ces mesures réduisent les risques sans pouvoir les supprimer totalement.
      </p>

      <h2>9. Cookies et stockage local</h2>
      <ul>
        <li>
          <strong>Cookies strictement nécessaires</strong> : cookies de session Supabase permettant de rester connecté. Ils
          ne nécessitent pas de consentement.
        </li>
        <li>
          <strong>Stockage local du navigateur</strong> : profil de site sur /start (24 heures au plus) et préférences
          d’affichage.
        </li>
        <li>
          <strong>Mesure d’audience</strong> : PostHog, uniquement s’il est activé.{" "}
          <Todo>préciser si PostHog dépose des cookies côté navigateur et, si oui, le recueil du consentement</Todo>.
        </li>
        <li>Aucun cookie publicitaire.</li>
      </ul>

      <h2>10. Modifications</h2>
      <p>
        Cette politique est mise à jour lorsque les traitements évoluent. La date de dernière mise à jour figure en haut de
        page.
      </p>
    </article>
  );
}
